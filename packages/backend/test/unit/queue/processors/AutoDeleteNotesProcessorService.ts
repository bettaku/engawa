/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { MiNote, MiUser, NoteFavoritesRepository, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { AUTO_DELETE_NOTES_LIMIT_PER_RUN, AutoDeleteNotesProcessorService } from '@/queue/processors/AutoDeleteNotesProcessorService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import type { DbJobDataWithUser } from '@/queue/types.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { QueueService } from '@/core/QueueService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type * as Bull from 'bullmq';
import type { MockInstance } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;

describe('AutoDeleteNotesProcessorService', () => {
	let app: TestingModule;
	let service: AutoDeleteNotesProcessorService;
	let queueService: QueueService;
	let idService: IdService;
	let notesRepository: NotesRepository;
	let noteFavoritesRepository: NoteFavoritesRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;

	let publishNoteStream: MockInstance<GlobalEventService['publishNoteStream']>;
	let deliverToFollowers: MockInstance<ApDeliverManagerService['deliverToFollowers']>;

	const users: MiUser[] = [];

	async function createUser(data: Partial<MiUser> = {}) {
		const id = idService.gen();
		const un = data.username ?? secureRndstr(16);
		const user = await usersRepository
			.insert({
				id,
				username: un,
				usernameLower: un.toLowerCase(),
				...data,
			})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

		await userProfilesRepository.insert({
			userId: id,
		});

		users.push(user);
		return user;
	}

	async function createNote(data: Partial<MiNote>, user: MiUser, daysAgo = 0): Promise<MiNote> {
		const id = idService.gen(Date.now() - (daysAgo * DAY));
		return await notesRepository
			.insert({
				id: id,
				text: `note_${id}`,
				userId: user.id,
				userHost: user.host,
				visibility: 'public',
				...data,
			})
			.then(x => notesRepository.findOneByOrFail(x.identifiers[0]));
	}

	function jobFor(user: MiUser) {
		return { data: { user: { id: user.id } } } as Bull.Job<DbJobDataWithUser>;
	}

	async function exists(note: MiNote) {
		return await notesRepository.existsBy({ id: note.id });
	}

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
				providers: [
					AutoDeleteNotesProcessorService,
					{
						provide: QueueLoggerService,
						useFactory: () => ({
							logger: {
								createSubLogger: () => ({
									info: vi.fn(),
									warn: vi.fn(),
									error: vi.fn(),
								}),
							},
						}),
					},
				],
			})
			.compile();

		service = app.get(AutoDeleteNotesProcessorService);
		queueService = app.get(QueueService);
		idService = app.get(IdService);
		notesRepository = app.get(DI.notesRepository);
		noteFavoritesRepository = app.get(DI.noteFavoritesRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);

		app.enableShutdownHooks();
	});

	beforeEach(async () => {
		// restoreMocksが有効なので、spyはテストごとに作る。
		// @bindThisのメソッドは最初の参照でインスタンスのプロパティになるので、その後でspyする
		const globalEventService = app.get(GlobalEventService);
		void globalEventService.publishNoteStream;
		publishNoteStream = vi.spyOn(globalEventService, 'publishNoteStream');

		const apDeliverManagerService = app.get(ApDeliverManagerService);
		void apDeliverManagerService.deliverToFollowers;
		void apDeliverManagerService.deliverToUsers;
		deliverToFollowers = vi.spyOn(apDeliverManagerService, 'deliverToFollowers').mockResolvedValue(undefined);
		vi.spyOn(apDeliverManagerService, 'deliverToUsers').mockResolvedValue(undefined);

		await queueService.dbQueue.obliterate({ force: true });
	});

	afterEach(async () => {
		await noteFavoritesRepository.createQueryBuilder().delete().execute();
		await notesRepository.createQueryBuilder().delete().execute();
		while (users.length > 0) {
			const user = users.pop();
			if (user) await usersRepository.delete({ id: user.id });
		}
	});

	afterAll(async () => {
		await queueService.dbQueue.obliterate({ force: true });
		await app.close();
	});

	describe('process（対象ユーザーの列挙）', () => {
		test('自動削除を設定したローカルユーザーごとに、ジョブを1つずつ登録する', async () => {
			const alice = await createUser({ host: null, autoDeleteNotesAfterDays: 7 });
			await createUser({ host: null, autoDeleteNotesAfterDays: null });
			await createUser({ host: 'remote.example.com', autoDeleteNotesAfterDays: 7 });

			const result = await service.process();

			expect(result).toEqual({ queuedUsers: 1 });
			const jobs = await queueService.dbQueue.getJobs(['waiting', 'delayed', 'prioritized']);
			expect(jobs.map(job => [job.name, job.id, job.data])).toEqual([
				['autoDeleteUserNotes', QueueService.autoDeleteUserNotesJobId(alice.id), { v: 1, user: { id: alice.id } }],
			]);
		});

		test('前回のジョブが残っているユーザーには、重ねて登録しない', async () => {
			await createUser({ host: null, autoDeleteNotesAfterDays: 7 });

			await service.process();
			await service.process();

			const jobs = await queueService.dbQueue.getJobs(['waiting', 'delayed', 'prioritized']);
			expect(jobs).toHaveLength(1);
		});
	});

	describe('processUser（ユーザーごとの削除）', () => {
		test('保存期間を過ぎたノートを、通常の削除と同じ副作用付きで削除する', async () => {
			const alice = await createUser({ host: null, autoDeleteNotesAfterDays: 7, autoDeleteKeepFavorites: false });
			const carol = await createUser({ host: null });
			const parent = await createNote({ repliesCount: 1 }, carol, 30);
			const old = await createNote({ replyId: parent.id, replyUserId: carol.id }, alice, 10);
			const recent = await createNote({}, alice, 1);
			const othersOld = await createNote({}, carol, 10);

			const result = await service.processUser(jobFor(alice));

			expect(result).toEqual({ deletedCount: 1 });
			expect(await exists(old)).toBe(false);
			expect(await exists(recent)).toBe(true);
			expect(await exists(othersOld)).toBe(true);

			// 迂回経路では行われていなかった副作用
			expect(deliverToFollowers).toHaveBeenCalledTimes(1);
			expect(publishNoteStream.mock.calls.filter(([n, type]) => n.id === old.id && type === 'deleted')).toHaveLength(1);
			expect((await notesRepository.findOneByOrFail({ id: parent.id })).repliesCount).toBe(0);
		});

		test('お気に入りの保護が有効なら、お気に入りのノートを残す', async () => {
			const alice = await createUser({ host: null, autoDeleteNotesAfterDays: 7, autoDeleteKeepFavorites: true });
			const favorited = await createNote({}, alice, 10);
			const other = await createNote({}, alice, 10);
			await noteFavoritesRepository.insert({ id: idService.gen(), noteId: favorited.id, userId: alice.id });

			const result = await service.processUser(jobFor(alice));

			expect(result).toEqual({ deletedCount: 1 });
			expect(await exists(favorited)).toBe(true);
			expect(await exists(other)).toBe(false);
		});

		test('ジョブの登録後に設定が解除されていたら、何も削除しない', async () => {
			const alice = await createUser({ host: null, autoDeleteNotesAfterDays: null });
			const old = await createNote({}, alice, 10);

			const result = await service.processUser(jobFor(alice));

			expect(result).toEqual({ deletedCount: 0 });
			expect(await exists(old)).toBe(true);
		});

		test('1回のジョブで削除するのは上限までにする', async () => {
			const alice = await createUser({ host: null, autoDeleteNotesAfterDays: 7, autoDeleteKeepFavorites: false });
			const baseTime = Date.now() - (10 * DAY);
			const total = AUTO_DELETE_NOTES_LIMIT_PER_RUN + 5;
			await notesRepository.insert(Array.from({ length: total }, (_, i) => {
				const id = idService.gen(baseTime + i);
				return { id, text: `note_${id}`, userId: alice.id, userHost: null, visibility: 'public' as const, localOnly: true };
			}));

			const result = await service.processUser(jobFor(alice));

			expect(result).toEqual({ deletedCount: AUTO_DELETE_NOTES_LIMIT_PER_RUN });
			expect(await notesRepository.countBy({ userId: alice.id })).toBe(5);
		});
	});
});
