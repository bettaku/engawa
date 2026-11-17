/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
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

	test('1件のノートの反映に失敗しても、後続のノートを反映し、失敗した差分は次回に再試行する', async () => {
		const failing = await createNote();
		const other = await createNote();
		await reactionsBufferingService.create(failing.id, alice.id, '👍', []);
		await reactionsBufferingService.create(other.id, alice.id, '👍', []);

		const createQueryBuilder = notesRepository.createQueryBuilder.bind(notesRepository);
		const spy = vi.spyOn(notesRepository, 'createQueryBuilder').mockImplementation(((alias?: string) => {
			const qb = createQueryBuilder(alias);
			const update = qb.update.bind(qb);
			qb.update = ((...args: Parameters<typeof qb.update>) => {
				const uqb = update(...args);
				const where = uqb.where.bind(uqb);
				uqb.where = ((...whereArgs: Parameters<typeof uqb.where>) => {
					const params = whereArgs[1] as { id?: string } | undefined;
					if (params?.id === failing.id) {
						uqb.execute = () => Promise.reject(new Error('injected failure'));
					}
					return where(...whereArgs);
				}) as typeof uqb.where;
				return uqb;
			}) as typeof qb.update;
			return qb;
		}) as typeof notesRepository.createQueryBuilder);

		await expect(service.process()).rejects.toThrow();
		spy.mockRestore();

		expect((await notesRepository.findOneByOrFail({ id: other.id })).reactions).toEqual({ '👍': 1 });
		expect((await notesRepository.findOneByOrFail({ id: failing.id })).reactions).toEqual({});
		expect((await reactionsBufferingService.get(failing.id)).deltas).toEqual({ '👍': 1 });

		await service.process();

		expect((await notesRepository.findOneByOrFail({ id: failing.id })).reactions).toEqual({ '👍': 1 });
	});
});
