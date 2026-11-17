/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import type * as Redis from 'ioredis';
import { Test, TestingModule } from '@nestjs/testing';
import type { MiMeta, MiNote, MiUser, NotesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { BakeBufferedReactionsProcessorService } from '@/queue/processors/BakeBufferedReactionsProcessorService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('BakeBufferedReactionsProcessorService', () => {
	let app: TestingModule;
	let service: BakeBufferedReactionsProcessorService;
	let reactionsBufferingService: ReactionsBufferingService;
	let idService: IdService;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let meta: MiMeta;
	let alice: MiUser;

	async function createNote(): Promise<MiNote> {
		const id = idService.gen();
		await notesRepository.insert({
			id,
			text: `note_${id}`,
			userId: alice.id,
			userHost: null,
			visibility: 'public',
		});
		return await notesRepository.findOneByOrFail({ id });
	}

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [GlobalModule, CoreModule],
				providers: [QueueLoggerService, BakeBufferedReactionsProcessorService],
			})
			.compile();

		service = app.get(BakeBufferedReactionsProcessorService);
		reactionsBufferingService = app.get(ReactionsBufferingService);
		idService = app.get(IdService);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);
		meta = app.get(DI.meta);

		const username = secureRndstr(16);
		const id = idService.gen();
		await usersRepository.insert({ id, username, usernameLower: username.toLowerCase() });
		alice = await usersRepository.findOneByOrFail({ id });

		app.enableShutdownHooks();
	});

	afterAll(async () => {
		await app.close();
	});

	test('バッファリングを無効にした後でも、残った差分を反映する', async () => {
		const note = await createNote();
		await reactionsBufferingService.create(note.id, alice.id, '👍', []);

		meta.enableReactionsBuffering = false;
		await service.process();

		const baked = await notesRepository.findOneByOrFail({ id: note.id });
		expect(baked.reactions).toEqual({ '👍': 1 });
		expect((await reactionsBufferingService.get(note.id)).deltas).toEqual({});
	});

	async function processingBatches(): Promise<string[]> {
		return await app.get<Redis.Redis>(DI.redisForReactions).smembers('reactionsBufferProcessingBatches');
	}

	test('1件のノートの反映に失敗しても、後続のノートを反映し、失敗したバッチは次回に再試行する', async () => {
		const failing = await createNote();
		const other = await createNote();
		await reactionsBufferingService.create(failing.id, alice.id, '👍', []);
		await reactionsBufferingService.create(other.id, alice.id, '👍', []);

		// @bindThisのメソッドは最初の参照でインスタンスのプロパティになるので、その後でspyする
		const applyBatch = reactionsBufferingService.applyBatch;
		vi.spyOn(reactionsBufferingService, 'applyBatch').mockImplementation(batch =>
			batch.noteId === failing.id ? Promise.reject(new Error('injected failure')) : applyBatch(batch));

		await expect(service.process()).rejects.toThrow(/1 batch/);
		vi.restoreAllMocks();

		expect((await notesRepository.findOneByOrFail({ id: other.id })).reactions).toEqual({ '👍': 1 });
		expect((await notesRepository.findOneByOrFail({ id: failing.id })).reactions).toEqual({});
		expect((await processingBatches()).some(m => m.startsWith(`${failing.id}:`))).toBe(true);

		await service.process();

		const baked = await notesRepository.findOneByOrFail({ id: failing.id });
		expect(baked.reactions).toEqual({ '👍': 1 });
		expect(baked.reactionAndUserPairCache).toEqual([`${alice.id}/👍`]);
		expect((await processingBatches()).some(m => m.startsWith(`${failing.id}:`))).toBe(false);
	});

	test('後始末のRedisのコマンドが失敗しても、後続のノートを反映し、再実行で二重に加算しない', async () => {
		const first = await createNote();
		const second = await createNote();
		await reactionsBufferingService.create(first.id, alice.id, '👍', []);
		await reactionsBufferingService.create(second.id, alice.id, '👍', []);

		const redis = app.get<Redis.Redis>(DI.redisForReactions);
		const multi = redis.multi.bind(redis);
		vi.spyOn(redis, 'multi').mockImplementationOnce((() => {
			const m = multi();
			m.exec = (() => Promise.resolve([[new Error('injected command failure'), null]])) as typeof m.exec;
			return m;
		}) as typeof redis.multi);

		await expect(service.process()).rejects.toThrow(/1 batch/);
		vi.restoreAllMocks();

		// どちらもコミット済み。後始末に失敗したバッチは集合に残る
		expect((await notesRepository.findOneByOrFail({ id: first.id })).reactions).toEqual({ '👍': 1 });
		expect((await notesRepository.findOneByOrFail({ id: second.id })).reactions).toEqual({ '👍': 1 });

		await service.process();

		expect((await notesRepository.findOneByOrFail({ id: first.id })).reactions).toEqual({ '👍': 1 });
		expect((await notesRepository.findOneByOrFail({ id: second.id })).reactions).toEqual({ '👍': 1 });
		expect((await processingBatches()).some(m => m.startsWith(`${first.id}:`) || m.startsWith(`${second.id}:`))).toBe(false);
	});
});
