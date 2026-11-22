/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import { vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import * as Bull from 'bullmq';
import type { DataSource } from 'typeorm';
import type * as Redis from 'ioredis';
import type { MiNote, MiUser, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { ScheduledNoteDeleteProcessorService } from '@/queue/processors/ScheduledNoteDeleteProcessorService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { QUEUE, baseWorkerOptions } from '@/queue/const.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteUpdateService } from '@/core/NoteUpdateService.js';
import { QueueService } from '@/core/QueueService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('ScheduledNoteDeleteProcessorService', () => {
	let app: TestingModule;
	let service: ScheduledNoteDeleteProcessorService;
	let noteDeleteService: NoteDeleteService;
	let noteCreateService: NoteCreateService;
	let noteUpdateService: NoteUpdateService;
	let queueService: QueueService;
	let idService: IdService;
	let db: DataSource;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;

	let publishNoteStream: MockInstance<GlobalEventService['publishNoteStream']>;
	let deliverToUsers: MockInstance<ApDeliverManagerService['deliverToFollowersAndUsers']>;

	// Local user
	let alice: MiUser;
	// Remote user
	let bob: MiUser;

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

		return user;
	}

	async function createNote(data: Partial<MiNote>, user: MiUser): Promise<MiNote> {
		const id = idService.gen();
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

	function fromNow(ms: number) {
		return new Date(Date.now() + ms);
	}

	function deletedEventsOf(note: MiNote) {
		return publishNoteStream.mock.calls.filter(([n, type]) => n.id === note.id && type === 'deleted');
	}

	async function exists(note: MiNote) {
		return await notesRepository.existsBy({ id: note.id });
	}

	async function getJob(note: MiNote) {
		return await queueService.scheduledNoteDeleteQueue.getJob(QueueService.scheduledNoteDeleteJobId(note.id));
	}

	async function waitFor(condition: () => Promise<boolean>, timeout = 10 * 1000) {
		const startedAt = Date.now();
		while (!(await condition())) {
			if (Date.now() - startedAt > timeout) throw new Error('timeout');
			await setTimeout(50);
		}
	}

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
				providers: [
					ScheduledNoteDeleteProcessorService,
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

		service = app.get(ScheduledNoteDeleteProcessorService);
		noteDeleteService = app.get(NoteDeleteService);
		noteCreateService = app.get(NoteCreateService);
		noteUpdateService = app.get(NoteUpdateService);
		queueService = app.get(QueueService);
		idService = app.get(IdService);
		db = app.get(DI.db);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);

		alice = await createUser({ host: null });
		bob = await createUser({ host: 'remote.example.com', uri: 'https://remote.example.com/users/bob', inbox: 'https://remote.example.com/inbox' });

		app.enableShutdownHooks();
	});

	beforeEach(async () => {
		// restoreMocksが有効なので、spyはテストごとに作る。
		// @bindThisのメソッドは最初の参照でインスタンスのプロパティになるので、その後でspyする
		const globalEventService = app.get(GlobalEventService);
		void globalEventService.publishNoteStream;
		publishNoteStream = vi.spyOn(globalEventService, 'publishNoteStream');

		const apDeliverManagerService = app.get(ApDeliverManagerService);
		void apDeliverManagerService.deliverToFollowersAndUsers;
		deliverToUsers = vi.spyOn(apDeliverManagerService, 'deliverToFollowersAndUsers').mockResolvedValue(undefined);

		await queueService.scheduledNoteDeleteQueue.obliterate({ force: true });
	});

	afterEach(async () => {
		await notesRepository.createQueryBuilder().delete().execute();
	});

	afterAll(async () => {
		await queueService.scheduledNoteDeleteQueue.obliterate({ force: true });
		await usersRepository.delete({ id: alice.id });
		await usersRepository.delete({ id: bob.id });
		await app.close();
	});

	describe('NoteDeleteService.deleteIfScheduledTimeReached', () => {
		test('削除予定時刻を過ぎたノートを削除し、副作用を1回だけ実行する', async () => {
			const parent = await createNote({ repliesCount: 1 }, alice);
			const note = await createNote({ deleteAt: fromNow(-1000), replyId: parent.id, replyUserId: alice.id }, alice);

			const result = await noteDeleteService.deleteIfScheduledTimeReached(note.id);

			expect(result).toEqual({ deleted: true });
			expect(await exists(note)).toBe(false);
			expect(deletedEventsOf(note)).toHaveLength(1);
			expect((await notesRepository.findOneByOrFail({ id: parent.id })).repliesCount).toBe(0);
		});

		test('延期されたノートは削除しない', async () => {
			const deleteAt = fromNow(HOUR);
			const note = await createNote({ deleteAt }, alice);

			const result = await noteDeleteService.deleteIfScheduledTimeReached(note.id);

			expect(result).toEqual({ deleted: false, deleteAt });
			expect(await exists(note)).toBe(true);
			expect(deletedEventsOf(note)).toHaveLength(0);
		});

		test('予約が解除されたノートは削除しない', async () => {
			const note = await createNote({ deleteAt: null }, alice);

			const result = await noteDeleteService.deleteIfScheduledTimeReached(note.id);

			expect(result).toEqual({ deleted: false, deleteAt: null });
			expect(await exists(note)).toBe(true);
			expect(deletedEventsOf(note)).toHaveLength(0);
		});

		test('存在しないノートでは何もしない', async () => {
			const result = await noteDeleteService.deleteIfScheduledTimeReached(idService.gen());

			expect(result).toEqual({ deleted: false, deleteAt: null });
		});

		test('同時に実行しても二重に削除しない', async () => {
			const parent = await createNote({ repliesCount: 3 }, alice);
			const note = await createNote({ deleteAt: fromNow(-1000), replyId: parent.id, replyUserId: alice.id }, alice);

			const results = await Promise.all([
				noteDeleteService.deleteIfScheduledTimeReached(note.id),
				noteDeleteService.deleteIfScheduledTimeReached(note.id),
				noteDeleteService.deleteIfScheduledTimeReached(note.id),
			]);

			expect(results.filter(r => r.deleted)).toHaveLength(1);
			expect(deletedEventsOf(note)).toHaveLength(1);
			expect((await notesRepository.findOneByOrFail({ id: parent.id })).repliesCount).toBe(2);
		});

		test('確認の前に延期の更新が始まっていれば、更新の確定を待ち、削除しない', async () => {
			const note = await createNote({ deleteAt: fromNow(-1000) }, alice);
			const postponed = fromNow(HOUR);

			const queryRunner = db.createQueryRunner();
			await queryRunner.connect();
			await queryRunner.startTransaction();

			let settled = false;
			let pending: Promise<unknown> | null = null;

			try {
				// 更新側が先に行ロックを取る
				await queryRunner.manager.update('note', { id: note.id }, { deleteAt: postponed });

				pending = noteDeleteService.deleteIfScheduledTimeReached(note.id).finally(() => { settled = true; });

				// 更新が確定するまで、削除側は待たされる
				await setTimeout(500);
				expect(settled).toBe(false);

				await queryRunner.commitTransaction();
			} finally {
				if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
				await queryRunner.release();
			}

			expect(await pending).toEqual({ deleted: false, deleteAt: postponed });
			expect(await exists(note)).toBe(true);
			expect(deletedEventsOf(note)).toHaveLength(0);
		});

		test('削除が先に確定した場合、その後の更新は「ノートなし」になる', async () => {
			const note = await createNote({ deleteAt: fromNow(-1000) }, alice);

			expect(await noteDeleteService.deleteIfScheduledTimeReached(note.id)).toEqual({ deleted: true });

			const updated = await noteUpdateService.update(alice, {
				text: 'edited',
				deleteAt: fromNow(HOUR),
			}, note);

			expect(updated).toBeNull();
			expect(await exists(note)).toBe(false);
		});

		test('返信・Renoteしたリモートユーザーへの配送先を、行を消す前に求める', async () => {
			const note = await createNote({ deleteAt: fromNow(-1000) }, alice);
			await createNote({ replyId: note.id, replyUserId: alice.id }, bob);

			await noteDeleteService.deleteIfScheduledTimeReached(note.id);

			expect(deliverToUsers).toHaveBeenCalledTimes(1);
			const recipients = deliverToUsers.mock.calls[0][2] as MiUser[];
			expect(recipients.map(u => u.id)).toEqual([bob.id]);
		});
	});

	describe('QueueService (BullMQ)', () => {
		test('登録・取得・取り消し・再登録ができる', async () => {
			const note = await createNote({}, alice);

			// 登録
			await queueService.scheduleNoteDelete(note.id, fromNow(HOUR));

			const job = await getJob(note);
			expect(job?.data).toEqual({ v: 1, noteId: note.id });
			expect(await job?.getState()).toBe('delayed');
			expect(job?.opts.delay).toBeGreaterThan(HOUR - MINUTE);
			expect(job?.opts.delay).toBeLessThanOrEqual(HOUR);

			// 延期。ジョブは1つのまま、新しい時刻になる
			await queueService.scheduleNoteDelete(note.id, fromNow(2 * HOUR));

			expect(await queueService.scheduledNoteDeleteQueue.getJobCounts('delayed', 'waiting')).toMatchObject({ delayed: 1, waiting: 0 });
			expect((await getJob(note))?.opts.delay).toBeGreaterThan(2 * HOUR - MINUTE);

			// 取り消し
			await queueService.cancelScheduledNoteDelete(note.id);

			expect(await getJob(note)).toBeUndefined();
			expect(await queueService.scheduledNoteDeleteQueue.getJobCounts('delayed', 'waiting')).toMatchObject({ delayed: 0, waiting: 0 });

			// 取り消したIDで再登録できる
			await queueService.scheduleNoteDelete(note.id, fromNow(HOUR));

			expect(await (await getJob(note))?.getState()).toBe('delayed');
		});

		test('ジョブがないノートの取り消しは何もしない', async () => {
			await expect(queueService.cancelScheduledNoteDelete(idService.gen())).resolves.toBeUndefined();
		});

		test('ensureNoteDeleteScheduledは既存のジョブを上書きしない', async () => {
			const note = await createNote({}, alice);

			await queueService.scheduleNoteDelete(note.id, fromNow(HOUR));
			await queueService.ensureNoteDeleteScheduled(note.id, fromNow(2 * HOUR));

			expect(await queueService.scheduledNoteDeleteQueue.getJobCounts('delayed')).toEqual({ delayed: 1 });
			expect((await getJob(note))?.opts.delay).toBeLessThanOrEqual(HOUR);
		});

		test('過去の時刻を渡すと、遅延なしで登録する', async () => {
			const note = await createNote({}, alice);

			await queueService.scheduleNoteDelete(note.id, fromNow(-HOUR));

			expect((await getJob(note))?.opts.delay).toBe(0);
		});

		test('syncScheduledNoteDeleteは、キューの操作が失敗しても例外を投げない', async () => {
			const note = await createNote({}, alice);
			const queue = queueService.scheduledNoteDeleteQueue;
			const remove = vi.spyOn(queue, 'remove').mockRejectedValue(new Error('redis is down'));
			const add = vi.spyOn(queue, 'add').mockRejectedValue(new Error('redis is down'));

			// 登録の失敗
			await expect(queueService.syncScheduledNoteDelete(note.id, fromNow(HOUR))).resolves.toBeUndefined();
			// 取り消しの失敗
			await expect(queueService.syncScheduledNoteDelete(note.id, null)).resolves.toBeUndefined();

			expect(remove).toHaveBeenCalledTimes(2);
			expect(add).not.toHaveBeenCalled();
		});

		test('syncScheduledNoteDeleteは、deleteAtに合わせて登録・取り消しをする', async () => {
			const note = await createNote({}, alice);

			await queueService.syncScheduledNoteDelete(note.id, fromNow(HOUR));
			expect(await (await getJob(note))?.getState()).toBe('delayed');

			await queueService.syncScheduledNoteDelete(note.id, null);
			expect(await getJob(note)).toBeUndefined();
		});

		test('管理画面のキュー一覧に含まれる', async () => {
			const note = await createNote({}, alice);
			await queueService.scheduleNoteDelete(note.id, fromNow(HOUR));

			const queue = await queueService.queueGetQueue('scheduledNoteDelete');
			expect(queue.counts.delayed).toBe(1);

			const queues = await queueService.queueGetQueues();
			expect(queues.map(q => q.name)).toContain('scheduledNoteDelete');
		});
	});

	describe('NoteCreateService / NoteUpdateService', () => {
		async function jobCount() {
			const counts = await queueService.scheduledNoteDeleteQueue.getJobCounts('delayed', 'waiting');
			return counts.delayed + counts.waiting;
		}

		test('作成時にジョブを1つだけ登録し、延期・解除でジョブを置き換える・取り消す', async () => {
			// 作成
			// silent: ジョブの登録に関係しない後処理（配信など）を省く
			const note = await noteCreateService.create(alice, { text: 'scheduled', deleteAt: fromNow(HOUR) }, true);

			await waitFor(async () => (await getJob(note)) != null);
			// 後処理が終わるまで待っても増えない
			await setTimeout(300);
			expect(await jobCount()).toBe(1);
			expect((await getJob(note))?.opts.delay).toBeLessThanOrEqual(HOUR);

			// 延期
			const postponed = await noteUpdateService.update(alice, { text: 'scheduled', deleteAt: fromNow(3 * HOUR) }, note);

			await waitFor(async () => ((await getJob(note))?.opts.delay ?? 0) > 2 * HOUR);
			expect(await jobCount()).toBe(1);

			// 解除
			const cancelled = await noteUpdateService.update(alice, { text: 'scheduled', deleteAt: null }, postponed!);

			expect(cancelled?.deleteAt).toBeNull();
			await waitFor(async () => (await getJob(note)) == null);
			expect(await jobCount()).toBe(0);
		});
	});

	describe('process', () => {
		let worker: Bull.Worker | null = null;

		afterEach(async () => {
			await worker?.close();
			worker = null;
		});

		function startWorker() {
			worker = new Bull.Worker(
				QUEUE.SCHEDULED_NOTE_DELETE,
				(job, token) => service.process(job, token),
				baseWorkerOptions(app.get<Config>(DI.config), QUEUE.SCHEDULED_NOTE_DELETE, app.get<Redis.Redis>(DI.redisForJobQueue)),
			);
			return worker;
		}

		test('時刻になったジョブでノートを削除する', async () => {
			const note = await createNote({ deleteAt: fromNow(-1000) }, alice);
			await queueService.scheduleNoteDelete(note.id, note.deleteAt!);

			startWorker();

			await waitFor(async () => !(await exists(note)));
			await waitFor(async () => (await getJob(note)) == null);
			expect(deletedEventsOf(note)).toHaveLength(1);
		});

		test('解除されたノートのジョブは、削除せずに終わる', async () => {
			const note = await createNote({ deleteAt: null }, alice);
			// 取り消しに失敗して残ったジョブを想定する
			await queueService.ensureNoteDeleteScheduled(note.id, fromNow(-1000));

			startWorker();

			await waitFor(async () => (await getJob(note)) == null);
			expect(await exists(note)).toBe(true);
		});

		test('延期されたノートのジョブは、新しい時刻まで延期され、失敗扱いにならない', async () => {
			const deleteAt = fromNow(HOUR);
			const note = await createNote({ deleteAt }, alice);
			// 延期の更新のときに実行中で取り消せなかったジョブを想定する
			await queueService.ensureNoteDeleteScheduled(note.id, fromNow(-1000));

			const failed = vi.fn();
			startWorker().on('failed', failed);

			await waitFor(async () => (await (await getJob(note))?.getState()) === 'delayed');

			const job = await getJob(note);
			expect(job!.timestamp + job!.delay).toBeGreaterThan(deleteAt.getTime() - MINUTE);
			expect(job!.timestamp + job!.delay).toBeLessThanOrEqual(deleteAt.getTime() + MINUTE);
			expect(await exists(note)).toBe(true);
			expect(failed).not.toHaveBeenCalled();
			expect(await queueService.scheduledNoteDeleteQueue.getJobCounts('failed')).toEqual({ failed: 0 });
		});

		test('jobIdを固定する前のジョブ: 延期されていれば固定IDのジョブを登録して終わる', async () => {
			const note = await createNote({ deleteAt: fromNow(HOUR) }, alice);
			// 旧形式: ジョブ名がノートIDで、jobIdは自動採番
			const legacyJob = await queueService.scheduledNoteDeleteQueue.add(note.id, { noteId: note.id }, { removeOnComplete: true });

			startWorker();

			await waitFor(async () => (await queueService.scheduledNoteDeleteQueue.getJob(legacyJob.id!)) == null);

			expect(await exists(note)).toBe(true);
			const job = await getJob(note);
			expect(await job?.getState()).toBe('delayed');
			expect(job?.opts.delay).toBeGreaterThan(HOUR - MINUTE);
		});

		test('jobIdを固定する前のジョブ: 時刻を過ぎていれば削除する', async () => {
			const note = await createNote({ deleteAt: fromNow(-1000) }, alice);
			await queueService.scheduledNoteDeleteQueue.add(note.id, { noteId: note.id }, { removeOnComplete: true });

			startWorker();

			await waitFor(async () => !(await exists(note)));
			expect(deletedEventsOf(note)).toHaveLength(1);
		});
	});

	describe('reconcile', () => {
		test('ジョブが失われ、削除予定時刻を過ぎたノートを削除する', async () => {
			const overdue = await createNote({ deleteAt: fromNow(-2 * MINUTE) }, alice);
			const justNow = await createNote({ deleteAt: fromNow(-10 * 1000) }, alice);
			const future = await createNote({ deleteAt: fromNow(HOUR) }, alice);
			const unscheduled = await createNote({ deleteAt: null }, alice);

			const result = await service.reconcile();

			expect(result).toBe('deleted: 1, failed: 0');
			expect(await exists(overdue)).toBe(false);
			expect(deletedEventsOf(overdue)).toHaveLength(1);
			// 時刻どおりのジョブに任せる
			expect(await exists(justNow)).toBe(true);
			expect(await exists(future)).toBe(true);
			expect(await exists(unscheduled)).toBe(true);
		});

		test('1件の失敗で止まらない', async () => {
			const a = await createNote({ deleteAt: fromNow(-3 * MINUTE) }, alice);
			const b = await createNote({ deleteAt: fromNow(-2 * MINUTE) }, alice);

			const original = noteDeleteService.deleteIfScheduledTimeReached;
			const spy = vi.spyOn(noteDeleteService, 'deleteIfScheduledTimeReached')
				.mockImplementation(async (id) => {
					if (id === a.id) throw new Error('boom');
					return await original(id);
				});

			try {
				expect(await service.reconcile()).toBe('deleted: 1, failed: 1');
			} finally {
				spy.mockRestore();
			}

			expect(await exists(a)).toBe(true);
			expect(await exists(b)).toBe(false);
		});
	});
});
