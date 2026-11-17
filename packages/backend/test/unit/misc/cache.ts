/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Test, TestingModule } from '@nestjs/testing';
import type { BlockingsRepository, MiUser, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { CacheService } from '@/core/CacheService.js';
import { IdService } from '@/core/IdService.js';
import { kvCacheKey, RedisKVCache, RedisSingleCache, singleCacheKey } from '@/misc/cache.js';
import type { CacheKeyVersion } from '@/misc/cache.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('RedisKVCache / RedisSingleCache', () => {
	let app: TestingModule;
	let redis: Redis.Redis;

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [GlobalModule] }).compile();
		redis = app.get(DI.redis);
	});

	afterAll(async () => {
		await app.close();
	});

	/**
	 * 別々のプロセスを模して、メモリ層を共有しないキャッシュを作る。
	 * メモリ層の無効化（P2-2）はここでは扱わないので、メモリ層は使わない（寿命を負にする）
	 */
	function process(name: string, db: Map<string, string>, version: CacheKeyVersion | null) {
		return new RedisKVCache<string>(redis, name, {
			lifetime: 1000 * 60,
			memoryCacheLifetime: -1,
			fetcher: async (key) => db.get(key) ?? 'none',
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
			version,
		});
	}

	test('v1のキーは従来の形式のまま', () => {
		expect(kvCacheKey('userProfile', 'a', 1)).toBe('kvcache:userProfile:a');
		expect(kvCacheKey('userProfile', 'a', 2)).toBe('kvcache:v2:userProfile:a');
		expect(kvCacheKey('flashAccessTokens', 'a', null)).toBe('kvcache:flashAccessTokens:a');
		expect(singleCacheKey('localEmojis', 1)).toBe('singlecache:localEmojis');
		expect(singleCacheKey('localEmojis', 2)).toBe('singlecache:v2:localEmojis');
	});

	for (const [writer, reader] of [[1, 2], [2, 1], [1, 1]] as const) {
		test(`v${writer}のプロセスが更新すると、v${reader}のプロセスの次の取得は最新の値になる`, async () => {
			const name = `test-${secureRndstr(8)}`;
			const db = new Map([['k', 'old']]);
			const writerProcess = process(name, db, writer);
			const readerProcess = process(name, db, reader);

			// 両方のプロセスが古い値をRedisに持っている
			expect(await readerProcess.fetch('k')).toBe('old');
			expect(await writerProcess.fetch('k')).toBe('old');

			db.set('k', 'new');
			await writerProcess.refresh('k');
			expect(await readerProcess.fetch('k')).toBe('new');

			db.set('k', 'newer');
			await writerProcess.delete('k');
			expect(await readerProcess.fetch('k')).toBe('newer');
		});
	}

	test('set はほかの版のキーを同じMULTIで消す', async () => {
		const name = `test-${secureRndstr(8)}`;
		await redis.set(kvCacheKey(name, 'k', 2), JSON.stringify('stale'));

		await process(name, new Map(), 1).set('k', 'value');

		expect(await redis.get(kvCacheKey(name, 'k', 1))).toBe(JSON.stringify('value'));
		expect(await redis.get(kvCacheKey(name, 'k', 2))).toBeNull();
	});

	test('版を持たないキャッシュは、ほかの版のキーを消さない', async () => {
		const name = `test-${secureRndstr(8)}`;
		await redis.set(kvCacheKey(name, 'k', 2), JSON.stringify('other'));

		const cache = process(name, new Map(), null);
		await cache.set('k', 'value');
		await cache.delete('k');

		expect(await redis.get(kvCacheKey(name, 'k', 2))).toBe(JSON.stringify('other'));
	});

	test('RedisSingleCacheも、ほかの版のプロセスの次の取得が最新の値になる', async () => {
		const name = `test-${secureRndstr(8)}`;
		let value = 'old';
		const make = (version: CacheKeyVersion) => new RedisSingleCache<string>(redis, name, {
			lifetime: 1000 * 60,
			memoryCacheLifetime: -1,
			fetcher: async () => value,
			toRedisConverter: (v) => JSON.stringify(v),
			fromRedisConverter: (v) => JSON.parse(v),
			version,
		});
		const v1 = make(1);
		const v2 = make(2);

		expect(await v1.fetch()).toBe('old');
		expect(await v2.fetch()).toBe('old');

		value = 'new';
		await v2.refresh();
		expect(await v1.fetch()).toBe('new');

		value = 'newer';
		await v1.delete();
		expect(await v2.fetch()).toBe('newer');
	});
});

describe('CacheService のキャッシュの版の切り替え', () => {
	let app: TestingModule;
	let redis: Redis.Redis;
	let cacheService: CacheService;
	let idService: IdService;
	let usersRepository: UsersRepository;
	let blockingsRepository: BlockingsRepository;
	let alice: MiUser;
	let bob: MiUser;

	async function createUser() {
		const id = idService.gen();
		const un = secureRndstr(16);
		await usersRepository.insert({ id, username: un, usernameLower: un.toLowerCase(), host: null });
		return await usersRepository.findOneByOrFail({ id });
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] }).compile();
		redis = app.get(DI.redis);
		cacheService = app.get(CacheService);
		idService = app.get(IdService);
		usersRepository = app.get(DI.usersRepository);
		blockingsRepository = app.get(DI.blockingsRepository);
		alice = await createUser();
		bob = await createUser();
		app.enableShutdownHooks();
	});

	afterAll(async () => {
		await blockingsRepository.delete({ blockerId: alice.id });
		await usersRepository.delete({ id: alice.id });
		await usersRepository.delete({ id: bob.id });
		await app.close();
	});

	test('現行の版（v1）のプロセスがブロックを更新すると、v2のプロセスは次の取得で最新の値を読む', async () => {
		// 第2リリースのプロセス（v2）を模す
		const v2Process = new RedisKVCache<Set<string>>(redis, 'userBlocking', {
			lifetime: 1000 * 60,
			memoryCacheLifetime: -1,
			fetcher: (key) => blockingsRepository.find({ where: { blockerId: key }, select: ['blockeeId'] }).then(xs => new Set(xs.map(x => x.blockeeId))),
			toRedisConverter: (value) => JSON.stringify(Array.from(value)),
			fromRedisConverter: (value) => new Set(JSON.parse(value)),
			version: 2,
		});
		expect(await v2Process.fetch(alice.id)).toEqual(new Set());

		await blockingsRepository.insert({ id: idService.gen(), blockerId: alice.id, blockeeId: bob.id });
		// UserBlockingService.block と同じ無効化
		await cacheService.userBlockingCache.refresh(alice.id);

		expect(await v2Process.fetch(alice.id)).toEqual(new Set([bob.id]));
	});
});
