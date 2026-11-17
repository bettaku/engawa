/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { vi } from 'vitest';
import * as Redis from 'ioredis';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import type { MiNote, MiUser, NotesRepository, UsersRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ReactionsBufferingService, addReactionDeltasSql } from '@/core/ReactionsBufferingService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('ReactionsBufferingService', () => {
	let app: TestingModule;
	let service: ReactionsBufferingService;
	let idService: IdService;
	let db: DataSource;
	let redis: Redis.Redis;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let alice: MiUser;

	async function createUser(): Promise<MiUser> {
		const id = idService.gen();
		const username = secureRndstr(16);
		await usersRepository.insert({ id, username, usernameLower: username.toLowerCase() });
		return await usersRepository.findOneByOrFail({ id });
	}

	async function createNote(data: Partial<MiNote> = {}): Promise<MiNote> {
		const id = idService.gen();
		await notesRepository.insert({
			id,
			text: `note_${id}`,
			userId: alice.id,
			userHost: null,
			visibility: 'public',
			...data,
		});
		return await notesRepository.findOneByOrFail({ id });
	}

	async function reactionsOf(note: Pick<MiNote, 'id'>) {
		return (await notesRepository.findOneByOrFail({ id: note.id })).reactions;
	}

	async function react(note: Pick<MiNote, 'id'>, reaction: string, user?: MiUser) {
		await service.create(note.id, (user ?? await createUser()).id, reaction, []);
	}

	async function processingBatches(): Promise<string[]> {
		return await redis.smembers('reactionsBufferProcessingBatches');
	}

	async function processingKeysOf(note: Pick<MiNote, 'id'>): Promise<string[]> {
		const keyPrefix = redis.options.keyPrefix ?? '';
		return await redis.keys(`${keyPrefix}reactionsBufferProcessing:${note.id}:*`);
	}

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [GlobalModule, CoreModule],
			})
			.compile();

		service = app.get(ReactionsBufferingService);
		idService = app.get(IdService);
		db = app.get(DI.db);
		redis = app.get(DI.redisForReactions);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);

		alice = await createUser();

		app.enableShutdownHooks();
	});

	afterAll(async () => {
		await app.close();
	});

	describe('bake', () => {
		test('複数のリアクションを同時に増減しても、互いに上書きしない', async () => {
			const note = await createNote({ reactions: { a: 1, b: 1, c: 2 } });
			const bob = await createUser();
			await react(note, 'a');
			await react(note, 'b');
			await react(note, 'd');
			await react(note, 'c', bob);
			await service.delete(note.id, bob.id, 'c');
			await service.delete(note.id, (await createUser()).id, 'c');

			await service.bake();

			expect(await reactionsOf(note)).toEqual({ a: 2, b: 2, c: 1, d: 1 });
			expect((await service.get(note.id)).deltas).toEqual({});
			expect(await processingKeysOf(note)).toEqual([]);
		});

		test('ペアのキャッシュを反映する', async () => {
			const note = await createNote();
			const bob = await createUser();
			await react(note, '👍', bob);

			await service.bake();

			expect((await notesRepository.findOneByOrFail({ id: note.id })).reactionAndUserPairCache).toEqual([`${bob.id}/👍`]);
		});

		test('取り出した後に届いたリアクションは、次のバッチで反映する', async () => {
			const note = await createNote();
			await react(note, 'a');

			const batch = await service.takeOut(note.id);
			assert.ok(batch != null);
			await react(note, 'a');
			await react(note, 'b');

			// 取り出し中の差分は表示に含まれない（読み取りはprocessingキーを読まない）
			expect((await service.get(note.id)).deltas).toEqual({ a: 1, b: 1 });

			await service.bake();

			expect(await reactionsOf(note)).toEqual({ a: 2, b: 1 });
			expect(await processingBatches()).not.toContain(`${note.id}:${batch.batchId}`);
		});

		test('同じバッチを二度適用しない', async () => {
			const note = await createNote();
			await react(note, 'a');
			const batch = await service.takeOut(note.id);
			assert.ok(batch != null);

			await service.applyBatch(batch);
			await service.applyBatch(batch);

			expect(await reactionsOf(note)).toEqual({ a: 1 });
		});

		test('差分がないノートは取り出さない', async () => {
			const note = await createNote();
			expect(await service.takeOut(note.id)).toBeNull();
		});

		test('削除されたノートの差分は捨てる', async () => {
			const note = await createNote();
			await react(note, 'a');
			await notesRepository.delete(note.id);

			await service.bake();

			expect(await processingKeysOf(note)).toEqual([]);
			expect((await service.get(note.id)).deltas).toEqual({});
		});
	});

	describe('停止したときの再実行', () => {
		test('RENAMEの前に停止した場合、再実行で1回だけ反映する', async () => {
			const note = await createNote();
			await react(note, 'a');

			await service.bake();

			expect(await reactionsOf(note)).toEqual({ a: 1 });
		});

		test('RENAMEの後、コミットの前に停止した場合、再実行で1回だけ反映する', async () => {
			const note = await createNote();
			await react(note, 'a');
			const batch = await service.takeOut(note.id);
			assert.ok(batch != null);
			expect(await processingBatches()).toContain(`${note.id}:${batch.batchId}`);

			await service.bake();

			expect(await reactionsOf(note)).toEqual({ a: 1 });
			expect(await processingKeysOf(note)).toEqual([]);
			expect(await processingBatches()).not.toContain(`${note.id}:${batch.batchId}`);
		});

		test('加算した後、コミットの前に失敗した場合、ロールバックして再実行で1回だけ反映する', async () => {
			const note = await createNote();
			await react(note, 'a');

			const transaction = db.transaction.bind(db);
			const spy = vi.spyOn(db, 'transaction').mockImplementationOnce((async (run: (em: EntityManager) => Promise<unknown>) => {
				await transaction(async (em: EntityManager) => {
					await run(em);
					throw new Error('injected failure before commit');
				});
			}) as unknown as DataSource['transaction']);

			await expect(service.bake()).rejects.toThrow();
			spy.mockRestore();

			expect(await reactionsOf(note)).toEqual({});
			expect(await processingKeysOf(note)).not.toEqual([]);

			await service.bake();

			expect(await reactionsOf(note)).toEqual({ a: 1 });
			expect(await processingKeysOf(note)).toEqual([]);
		});

		test('コミットの後、processingキーの削除の前に停止した場合、再実行で二重に加算しない', async () => {
			const note = await createNote();
			await react(note, 'a');
			const batch = await service.takeOut(note.id);
			assert.ok(batch != null);
			await service.applyBatch(batch);

			await service.bake();

			expect(await reactionsOf(note)).toEqual({ a: 1 });
			expect(await processingKeysOf(note)).toEqual([]);
			expect(await processingBatches()).not.toContain(`${note.id}:${batch.batchId}`);
		});

		test('processingキーを削除した後、集合から外す前に停止した場合、再実行で集合から外す', async () => {
			const note = await createNote();
			await react(note, 'a');
			const batch = await service.takeOut(note.id);
			assert.ok(batch != null);
			await service.applyBatch(batch);
			const keyPrefix = redis.options.keyPrefix ?? '';
			for (const key of await processingKeysOf(note)) {
				await redis.del(key.slice(keyPrefix.length));
			}

			await service.bake();

			expect(await reactionsOf(note)).toEqual({ a: 1 });
			expect(await processingBatches()).not.toContain(`${note.id}:${batch.batchId}`);
		});
	});

	describe('Redisのprefix', () => {
		test('redisForReactionsのprefixがredisと異なっても、差分を反映する', async () => {
			const config = app.get<Config>(DI.config);
			const other = new Redis.Redis({ ...config.redisForReactions, keyPrefix: `${config.redis.prefix}-reactions-${secureRndstr(8)}:` });
			try {
				const otherService = new ReactionsBufferingService(other, db, app.get(LoggerService));
				const note = await createNote();
				await otherService.create(note.id, alice.id, 'a', []);

				await otherService.bake();

				expect(await reactionsOf(note)).toEqual({ a: 1 });
				expect((await otherService.get(note.id)).deltas).toEqual({});
			} finally {
				other.disconnect();
			}
		});
	});

	describe('addReactionDeltasSql', () => {
		test('リアクション名をSQLに埋め込まない', async () => {
			const names = [`it's`, '{a,b}', '"quoted"', ':emoji@example.com:', 'a\\b'];
			const note = await createNote({ reactions: { [names[0]]: 1 } });

			await notesRepository.createQueryBuilder().update()
				.set({ reactions: () => addReactionDeltasSql('deltas') })
				.setParameter('deltas', JSON.stringify(Object.fromEntries(names.map(name => [name, 1]))))
				.where('id = :id', { id: note.id })
				.execute();

			expect(await reactionsOf(note)).toEqual(Object.fromEntries(names.map((name, i) => [name, i === 0 ? 2 : 1])));
		});
	});
});
