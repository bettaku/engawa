/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
});
