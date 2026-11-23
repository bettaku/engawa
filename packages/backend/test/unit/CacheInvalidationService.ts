/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Test, TestingModule } from '@nestjs/testing';
import type { MiUser, MutingsRepository, UserListsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { CacheService } from '@/core/CacheService.js';
import { IdService } from '@/core/IdService.js';
import { UserListService } from '@/core/UserListService.js';
import { UserMutingService } from '@/core/UserMutingService.js';
import { CURRENT_CACHE_KEY_VERSION, kvCacheKey } from '@/misc/cache.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

async function waitFor(condition: () => Promise<boolean> | boolean, timeout = 5000) {
	const start = Date.now();
	while (!(await condition())) {
		if (Date.now() - start > timeout) throw new Error('timed out');
		await new Promise(r => setTimeout(r, 20));
	}
}

/**
 * 2つのDIコンテナを別々のプロセスとみなし、一方での更新がもう一方のメモリ層に伝わることを確かめる
 */
describe('CacheInvalidationService', () => {
	let a: TestingModule;
	let b: TestingModule;
	let idService: IdService;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let mutingsRepository: MutingsRepository;
	let userListsRepository: UserListsRepository;
	let alice: MiUser;
	let bob: MiUser;

	async function createApp() {
		const app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] }).compile();
		app.enableShutdownHooks();
		await app.init();
		return app;
	}

	async function createUser() {
		const id = idService.gen();
		const un = secureRndstr(16);
		await usersRepository.insert({ id, username: un, usernameLower: un.toLowerCase(), host: null });
		await userProfilesRepository.insert({ userId: id });
		return await usersRepository.findOneByOrFail({ id });
	}

	beforeAll(async () => {
		a = await createApp();
		b = await createApp();
		idService = a.get(IdService);
		usersRepository = a.get(DI.usersRepository);
		userProfilesRepository = a.get(DI.userProfilesRepository);
		mutingsRepository = a.get(DI.mutingsRepository);
		userListsRepository = a.get(DI.userListsRepository);
		alice = await createUser();
		bob = await createUser();
	});

	afterAll(async () => {
		await mutingsRepository.delete({ muterId: alice.id });
		await userListsRepository.delete({ userId: alice.id });
		await usersRepository.delete({ id: alice.id });
		await usersRepository.delete({ id: bob.id });
		await a.close();
		await b.close();
	});

	test('ほかのプロセスでミュートすると、メモリ層に古い値を持つプロセスも次の取得で最新の値を読む', async () => {
		const cacheB = b.get(CacheService);
		// プロセスBのメモリ層に、ミュートしていない状態を載せる
		expect(await cacheB.userMutingsCache.fetch(alice.id)).toEqual(new Set());

		await a.get(UserMutingService).mute(alice, bob);

		await waitFor(async () => (await cacheB.userMutingsCache.fetch(alice.id)).has(bob.id));
	});

	test('ほかのプロセスでリストにメンバーを追加・削除すると、Redisとメモリ層の値が変わる', async () => {
		const listId = idService.gen();
		await userListsRepository.insert({ id: listId, userId: alice.id, name: 'list' });
		const list = await userListsRepository.findOneByOrFail({ id: listId });
		const listServiceB = b.get(UserListService);
		const membersB = (listServiceB as unknown as { membersCache: CacheService['userMutingsCache'] }).membersCache;
		expect(await membersB.fetch(listId)).toEqual(new Set());

		await a.get(UserListService).addMember(bob, list, alice);
		await waitFor(async () => (await membersB.fetch(listId)).has(bob.id));
		// 以前はメモリ上のSetだけを書き換え、Redisには古い値が残っていた
		expect(JSON.parse(await a.get<Redis.Redis>(DI.redis).get(kvCacheKey('userListMembers', listId, CURRENT_CACHE_KEY_VERSION)) ?? '[]')).not.toEqual([]);

		await a.get(UserListService).removeMember(bob, list);
		await waitFor(async () => !(await membersB.fetch(listId)).has(bob.id));
	});

	test('i/update以外の経路でプロフィールを更新しても、ほかのプロセスは次の取得で最新の値を読む', async () => {
		const cacheB = b.get(CacheService);
		expect((await cacheB.userProfileCache.fetch(alice.id)).mutedInstances).toEqual([]);

		// 管理画面などの経路と同じく、DBを更新してからキャッシュを消す
		await userProfilesRepository.update({ userId: alice.id }, { mutedInstances: ['muted.example.com'] });
		await a.get(CacheService).userProfileCache.delete(alice.id);

		await waitFor(async () => (await cacheB.userProfileCache.fetch(alice.id)).mutedInstances.includes('muted.example.com'));
	});

	test('自分が発行した無効化では、メモリ層を消さない', async () => {
		const cacheA = a.get(CacheService);
		await cacheA.userBlockingCache.set(alice.id, new Set(['x']));
		// Redisだけを書き換える。メモリ層が残っていれば、書き換える前の値を返す
		await a.get<Redis.Redis>(DI.redis).set(kvCacheKey('userBlocking', alice.id, CURRENT_CACHE_KEY_VERSION), JSON.stringify(['y']));
		await new Promise(r => setTimeout(r, 200));

		expect(await cacheA.userBlockingCache.get(alice.id)).toEqual(new Set(['x']));
	});

	test('Pub/Subをつなぎ直すと、メモリ層を捨てる', async () => {
		const cacheB = b.get(CacheService);
		await cacheB.userBlockingCache.fetch(bob.id);
		await b.get<Redis.Redis>(DI.redis).set(kvCacheKey('userBlocking', bob.id, CURRENT_CACHE_KEY_VERSION), JSON.stringify(['changed-while-disconnected']));
		expect(await cacheB.userBlockingCache.get(bob.id)).toEqual(new Set());

		const redisForSub = b.get<Redis.Redis>(DI.redisForSub);
		const ready = new Promise<void>(resolve => redisForSub.once('ready', () => resolve()));
		redisForSub.disconnect(true);
		await ready;

		expect(await cacheB.userBlockingCache.get(bob.id)).toEqual(new Set(['changed-while-disconnected']));
	});
});
