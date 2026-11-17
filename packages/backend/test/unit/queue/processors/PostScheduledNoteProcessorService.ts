/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import { vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import * as Bull from 'bullmq';
import type * as Redis from 'ioredis';
import type { MiNoteDraft, MiUser, NoteDraftsRepository, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { MiLocalUser } from '@/models/User.js';
import type { PostScheduledNoteJobData } from '@/queue/types.js';
import { MAX_SCHEDULED_POST_REQUEUES, PostScheduledNoteProcessorService } from '@/queue/processors/PostScheduledNoteProcessorService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { QUEUE, baseWorkerOptions } from '@/queue/const.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteDraftService } from '@/core/NoteDraftService.js';
import type { NoteDraftOptions } from '@/core/NoteDraftService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { QueueService } from '@/core/QueueService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('PostScheduledNoteProcessorService', () => {
	let app: TestingModule;
	let service: PostScheduledNoteProcessorService;
	let noteCreateService: NoteCreateService;
	let noteDraftService: NoteDraftService;
	let queueService: QueueService;
	let idService: IdService;
	let notesRepository: NotesRepository;
	let noteDraftsRepository: NoteDraftsRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;

	let createNotification: MockInstance<NotificationService['createNotification']>;

	let alice: MiUser;

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

	async function createDraft(data: Partial<MiNoteDraft> = {}): Promise<MiNoteDraft> {
		const id = idService.gen();
		await noteDraftsRepository.insert({
			id,
			userId: alice.id,
			text: `draft_${id}`,
			visibility: 'public',
			pollChoices: [],
			pollMultiple: false,
			scheduledAt: fromNow(-1000),
			isActuallyScheduled: true,
			...data,
		});
		return await noteDraftsRepository.findOneByOrFail({ id });
	}

	function fromNow(ms: number) {
		return new Date(Date.now() + ms);
	}

	/** 処理に渡すジョブ。workerを介さずに、停止・再実行の時点を細かく制御するために使う */
	function fakeJob(draft: MiNoteDraft, data: { id?: string; attemptsMade?: number; attempts?: number } = {}) {
		return {
			id: data.id ?? 'legacy-job',
			data: { noteDraftId: draft.id },
			attemptsMade: data.attemptsMade ?? 0,
			opts: { attempts: data.attempts ?? 5 },
		} as unknown as Bull.Job<PostScheduledNoteJobData>;
	}

	async function notesOf(draft: MiNoteDraft) {
		return await notesRepository.findBy({ userId: draft.userId, text: draft.text ?? undefined });
	}

	async function findDraft(draft: MiNoteDraft) {
		return await noteDraftsRepository.findOneBy({ id: draft.id });
	}

	function notificationsOf(type: 'scheduledNotePosted' | 'scheduledNotePostFailed') {
		return createNotification.mock.calls.filter(([, t]) => t === type);
	}

	async function getJob(draft: MiNoteDraft) {
		return await queueService.postScheduledNoteQueue.getJob(QueueService.postScheduledNoteJobId(draft.id));
	}

	/** 同じIDの、再試行を使い切って失敗したジョブを残す */
	async function leaveFailedJob(draft: MiNoteDraft) {
		await queueService.scheduleNotePost(draft.id, fromNow(-1000));
		const worker = new Bull.Worker(
			QUEUE.POST_SCHEDULED_NOTE,
			null,
			{ ...baseWorkerOptions(app.get<Config>(DI.config), QUEUE.POST_SCHEDULED_NOTE, app.get<Redis.Redis>(DI.redisForJobQueue)), autorun: false },
		);
		try {
			const token = 'test-token';
			const job = await worker.getNextJob(token);
			expect(job.id).toBe(QueueService.postScheduledNoteJobId(draft.id));
			await job.moveToFailed(new Bull.UnrecoverableError('failed'), token, false);
		} finally {
			await worker.close();
		}
		expect(await (await getJob(draft))?.getState()).toBe('failed');
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
					PostScheduledNoteProcessorService,
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

		service = app.get(PostScheduledNoteProcessorService);
		noteCreateService = app.get(NoteCreateService);
		noteDraftService = app.get(NoteDraftService);
		queueService = app.get(QueueService);
		idService = app.get(IdService);
		notesRepository = app.get(DI.notesRepository);
		noteDraftsRepository = app.get(DI.noteDraftsRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);

		alice = await createUser({ host: null });

		app.enableShutdownHooks();
	});

	beforeEach(async () => {
		// restoreMocksが有効なので、spyはテストごとに作る。
		// @bindThisのメソッドは最初の参照でインスタンスのプロパティになるので、その後でspyする
		const notificationService = app.get(NotificationService);
		void notificationService.createNotification;
		createNotification = vi.spyOn(notificationService, 'createNotification').mockImplementation(() => {});

		// ノート作成後の配信・配送・索引は、このテストの対象外
		const noteCreateServiceInternal = noteCreateService as unknown as { postNoteCreated: () => Promise<void> };
		void noteCreateServiceInternal.postNoteCreated;
		vi.spyOn(noteCreateServiceInternal, 'postNoteCreated').mockResolvedValue();

		await queueService.postScheduledNoteQueue.obliterate({ force: true });
	});

	afterEach(async () => {
		await noteDraftsRepository.createQueryBuilder().delete().execute();
		await notesRepository.createQueryBuilder().delete().execute();
	});

	afterAll(async () => {
		await queueService.postScheduledNoteQueue.obliterate({ force: true });
		await usersRepository.delete({ id: alice.id });
		await app.close();
	});

	describe('process', () => {
		test('予約時刻になったドラフトを投稿し、通知してからドラフトを削除する', async () => {
			const draft = await createDraft({ searchableBy: 'followers' });

			const result = await service.process(fakeJob(draft));

			const notes = await notesOf(draft);
			expect(notes).toHaveLength(1);
			expect(result).toBe(`posted: ${notes[0].id}`);
			// 予約投稿でもsearchableByを引き継ぐ
			expect(notes[0].searchableBy).toBe('followers');
			expect(await findDraft(draft)).toBeNull();
			expect(notificationsOf('scheduledNotePosted')).toEqual([[alice.id, 'scheduledNotePosted', { noteId: notes[0].id }]]);
		});

		test('insertの前に停止: 再実行で1回だけ投稿する', async () => {
			const draft = await createDraft();
			vi.spyOn(noteCreateService, 'fetchAndCreate').mockRejectedValueOnce(new Error('crash'));

			await expect(service.process(fakeJob(draft))).rejects.toThrow('crash');

			expect(await notesOf(draft)).toHaveLength(0);
			expect((await findDraft(draft))?.postedAt).toBeNull();
			// 再試行が残っているので、失敗は通知しない
			expect(notificationsOf('scheduledNotePostFailed')).toHaveLength(0);

			await service.process(fakeJob(draft, { attemptsMade: 1 }));

			expect(await notesOf(draft)).toHaveLength(1);
			expect(await findDraft(draft)).toBeNull();
			expect(notificationsOf('scheduledNotePosted')).toHaveLength(1);
		});

		test('insertのコミット後に停止: 再実行で再投稿せず、後処理だけを行う', async () => {
			const draft = await createDraft();
			// 後処理（通知→ドラフト削除）の最初で止める
			createNotification.mockImplementationOnce(() => {
				throw new Error('crash');
			});

			await expect(service.process(fakeJob(draft))).rejects.toThrow('crash');

			const notes = await notesOf(draft);
			expect(notes).toHaveLength(1);
			const posted = await findDraft(draft);
			expect(posted?.postedAt).not.toBeNull();
			expect(posted?.postedNoteId).toBe(notes[0].id);

			expect(await service.process(fakeJob(draft))).toBe('skipped: already posted');

			expect(await notesOf(draft)).toHaveLength(1);
			expect(await findDraft(draft)).toBeNull();
			expect(notificationsOf('scheduledNotePosted').at(-1)).toEqual([alice.id, 'scheduledNotePosted', { noteId: notes[0].id }]);
		});

		test('通知の後、ドラフト削除の前に停止: 再実行で再投稿しない（通知の重複は許容する）', async () => {
			const draft = await createDraft();
			const original = noteDraftsRepository.createQueryBuilder.bind(noteDraftsRepository);
			const spy = vi.spyOn(noteDraftsRepository, 'createQueryBuilder').mockImplementation((...args) => {
				const qb = original(...args);
				if (args.length === 0) {
					// 後処理のドラフト削除
					vi.spyOn(qb, 'delete').mockImplementation(() => {
						throw new Error('crash');
					});
				}
				return qb;
			});

			await expect(service.process(fakeJob(draft))).rejects.toThrow('crash');
			spy.mockRestore();

			expect(await notesOf(draft)).toHaveLength(1);
			expect(notificationsOf('scheduledNotePosted')).toHaveLength(1);
			expect((await findDraft(draft))?.postedAt).not.toBeNull();

			await service.process(fakeJob(draft));

			expect(await notesOf(draft)).toHaveLength(1);
			expect(await findDraft(draft)).toBeNull();
			expect(notificationsOf('scheduledNotePosted')).toHaveLength(2);
		});

		test('ドラフト削除の後に再実行: 何もしない', async () => {
			const draft = await createDraft();
			await service.process(fakeJob(draft));

			expect(await service.process(fakeJob(draft))).toBe('skipped: draft not found');

			expect(await notesOf(draft)).toHaveLength(1);
			expect(notificationsOf('scheduledNotePosted')).toHaveLength(1);
		});

		test('作成済みのノートを削除した後に再実行しても、再作成しない', async () => {
			const draft = await createDraft();
			const noteId = idService.gen();
			// insertのコミット後に止まり、その後にノートが削除された状態
			await noteDraftsRepository.update(draft.id, { postedAt: new Date(), postedNoteId: noteId });

			await service.process(fakeJob(draft));

			expect(await notesOf(draft)).toHaveLength(0);
			expect(await findDraft(draft)).toBeNull();
		});

		test('同時に実行しても二重に投稿しない', async () => {
			const draft = await createDraft();

			const results = await Promise.all([
				service.process(fakeJob(draft)),
				service.process(fakeJob(draft)),
				service.process(fakeJob(draft)),
			]);

			expect(await notesOf(draft)).toHaveLength(1);
			expect(results.filter(r => r.startsWith('posted:'))).toHaveLength(1);
			expect(await findDraft(draft)).toBeNull();
		});

		test('ノートの作成中にドラフトが削除されたら、ノートを作らない', async () => {
			const draft = await createDraft();
			const original = noteCreateService.fetchAndCreate;
			vi.spyOn(noteCreateService, 'fetchAndCreate').mockImplementationOnce(async (...args) => {
				await noteDraftsRepository.delete(draft.id);
				return await original(...args);
			});

			expect(await service.process(fakeJob(draft))).toBe('skipped: draft not found');
			expect(await notesOf(draft)).toHaveLength(0);
		});

		test('ノートの作成中に予約が延期されたら、ノートを作らず、新しい時刻のジョブを登録する', async () => {
			const draft = await createDraft();
			const scheduledAt = fromNow(HOUR);
			const original = noteCreateService.fetchAndCreate;
			vi.spyOn(noteCreateService, 'fetchAndCreate').mockImplementationOnce(async (...args) => {
				await noteDraftsRepository.update(draft.id, { scheduledAt });
				return await original(...args);
			});

			expect(await service.process(fakeJob(draft))).toBe('skipped: schedule postponed');
			expect(await notesOf(draft)).toHaveLength(0);
			const job = await getJob(draft);
			expect(await job?.getState()).toBe('delayed');
			expect(job?.opts.delay).toBeGreaterThan(HOUR - MINUTE);
		});

		test('ノートの作成中にドラフトの本文が編集されたら、編集後の内容で1回だけ投稿する', async () => {
			const draft = await createDraft({ visibility: 'public' });
			const original = noteCreateService.fetchAndCreate;
			vi.spyOn(noteCreateService, 'fetchAndCreate').mockImplementationOnce(async (...args) => {
				await noteDraftsRepository.update(draft.id, { text: 'edited', visibility: 'home' });
				return await original(...args);
			});

			await service.process(fakeJob(draft));

			expect(await notesOf(draft)).toHaveLength(0);
			const notes = await notesRepository.findBy({ userId: alice.id, text: 'edited' });
			expect(notes).toHaveLength(1);
			expect(notes[0].visibility).toBe('home');
			expect(await findDraft(draft)).toBeNull();
		});

		test('予約が解除されたドラフトは投稿しない', async () => {
			const draft = await createDraft({ isActuallyScheduled: false });

			expect(await service.process(fakeJob(draft))).toBe('skipped: not scheduled');
			expect(await notesOf(draft)).toHaveLength(0);
			expect(await findDraft(draft)).not.toBeNull();
		});

		test('入力の検証で失敗したら再試行せず、失敗を通知して照合の対象から外す', async () => {
			const draft = await createDraft({ replyId: idService.gen() });

			await expect(service.process(fakeJob(draft))).rejects.toBeInstanceOf(Bull.UnrecoverableError);

			expect(await notesOf(draft)).toHaveLength(0);
			expect(notificationsOf('scheduledNotePostFailed')).toEqual([[alice.id, 'scheduledNotePostFailed', { noteDraftId: draft.id }]]);
			expect((await findDraft(draft))?.postAttempts).toBe(MAX_SCHEDULED_POST_REQUEUES);
		});

		test('再試行を使い切っても、照合ジョブが登録し直す余地があれば失敗を通知しない', async () => {
			const draft = await createDraft();
			vi.spyOn(noteCreateService, 'fetchAndCreate').mockRejectedValue(new Error('db is down'));

			await expect(service.process(fakeJob(draft, { attemptsMade: 4, attempts: 5 }))).rejects.toThrow('db is down');
			expect(notificationsOf('scheduledNotePostFailed')).toHaveLength(0);

			await noteDraftsRepository.update(draft.id, { postAttempts: MAX_SCHEDULED_POST_REQUEUES });

			await expect(service.process(fakeJob(draft, { attemptsMade: 4, attempts: 5 }))).rejects.toThrow('db is down');
			expect(notificationsOf('scheduledNotePostFailed')).toHaveLength(1);
		});
	});

	describe('QueueService (BullMQ)', () => {
		test('固定IDで登録・取得・取り消し・再登録ができる', async () => {
			const draft = await createDraft({ scheduledAt: fromNow(HOUR) });

			await queueService.scheduleNotePost(draft.id, fromNow(HOUR));

			const job = await getJob(draft);
			expect(job?.data).toEqual({ noteDraftId: draft.id });
			expect(await job?.getState()).toBe('delayed');
			expect(job?.opts.attempts).toBe(5);

			// 延期。ジョブは1つのまま、新しい時刻になる
			await queueService.scheduleNotePost(draft.id, fromNow(2 * HOUR));
			expect(await queueService.postScheduledNoteQueue.getJobCounts('delayed')).toEqual({ delayed: 1 });
			expect((await getJob(draft))?.opts.delay).toBeGreaterThan(2 * HOUR - MINUTE);

			await queueService.cancelScheduledNotePost(draft.id);
			expect(await getJob(draft)).toBeUndefined();

			await queueService.scheduleNotePost(draft.id, fromNow(HOUR));
			expect(await (await getJob(draft))?.getState()).toBe('delayed');
		});

		test('失敗したジョブが残っていても、scheduleNotePostは登録し直す', async () => {
			const draft = await createDraft();
			await leaveFailedJob(draft);

			// ensureは既存のジョブを上書きしない
			await queueService.ensureNotePostScheduled(draft.id, fromNow(HOUR));
			expect(await (await getJob(draft))?.getState()).toBe('failed');

			await queueService.scheduleNotePost(draft.id, fromNow(HOUR));
			expect(await (await getJob(draft))?.getState()).toBe('delayed');
		});

		test('syncScheduledNotePostは、キューの操作が失敗しても例外を投げない', async () => {
			const queue = queueService.postScheduledNoteQueue;
			vi.spyOn(queue, 'remove').mockRejectedValue(new Error('redis is down'));

			await expect(queueService.syncScheduledNotePost(idService.gen(), fromNow(HOUR))).resolves.toBeUndefined();
			await expect(queueService.syncScheduledNotePost(idService.gen(), null)).resolves.toBeUndefined();
		});
	});

	describe('NoteDraftService', () => {
		const me = () => alice as MiLocalUser;

		function options(data: Partial<NoteDraftOptions>): NoteDraftOptions {
			return {
				text: 'scheduled',
				visibility: 'public',
				fileIds: [],
				visibleUserIds: [],
				pollChoices: [],
				pollMultiple: false,
				isActuallyScheduled: false,
				scheduledAt: null,
				...data,
			} as NoteDraftOptions;
		}

		test('作成で登録し、延期で置き換え、解除・削除で取り消す', async () => {
			const draft = await noteDraftService.create(me(), options({ isActuallyScheduled: true, scheduledAt: fromNow(HOUR) }));

			expect(await (await getJob(draft))?.getState()).toBe('delayed');

			await noteDraftService.update(me(), draft.id, { isActuallyScheduled: true, scheduledAt: fromNow(3 * HOUR) });
			expect(await queueService.postScheduledNoteQueue.getJobCounts('delayed')).toEqual({ delayed: 1 });
			expect((await getJob(draft))?.opts.delay).toBeGreaterThan(2 * HOUR);

			await noteDraftService.update(me(), draft.id, { isActuallyScheduled: false });
			expect(await getJob(draft)).toBeUndefined();

			await noteDraftService.update(me(), draft.id, { isActuallyScheduled: true, scheduledAt: fromNow(HOUR) });
			expect(await (await getJob(draft))?.getState()).toBe('delayed');

			await noteDraftService.delete(me(), draft.id);
			expect(await getJob(draft)).toBeUndefined();
		});

		test('更新すると、照合で登録し直した回数を0に戻す', async () => {
			const draft = await createDraft({ scheduledAt: fromNow(HOUR), postAttempts: MAX_SCHEDULED_POST_REQUEUES });

			await noteDraftService.update(me(), draft.id, { text: 'edited' });

			expect((await findDraft(draft))?.postAttempts).toBe(0);
		});

		test('投稿済みのドラフトは、ドラフトと予約の上限に数えない', async () => {
			// 既定の上限は、予約3件・ドラフト10件
			for (let i = 0; i < 10; i++) {
				await createDraft({ scheduledAt: fromNow(HOUR), postedAt: new Date(), postedNoteId: idService.gen() });
			}

			const draft = await noteDraftService.create(me(), options({ isActuallyScheduled: true, scheduledAt: fromNow(HOUR) }));

			expect(await findDraft(draft)).not.toBeNull();
		});

		test('投稿済みのドラフトは更新できない', async () => {
			const draft = await createDraft({ postedAt: new Date(), postedNoteId: idService.gen() });

			await expect(noteDraftService.update(me(), draft.id, { text: 'edited' })).rejects.toThrow('No such note draft');
			expect((await findDraft(draft))?.text).toBe(draft.text);
		});
	});

	describe('worker', () => {
		let worker: Bull.Worker | null = null;

		afterEach(async () => {
			await worker?.close();
			worker = null;
		});

		function startWorker() {
			worker = new Bull.Worker(
				QUEUE.POST_SCHEDULED_NOTE,
				(job, token) => service.process(job, token),
				baseWorkerOptions(app.get<Config>(DI.config), QUEUE.POST_SCHEDULED_NOTE, app.get<Redis.Redis>(DI.redisForJobQueue)),
			);
			return worker;
		}

		test('時刻になったジョブで1回だけ投稿し、ジョブは残らない', async () => {
			const draft = await createDraft();
			await queueService.scheduleNotePost(draft.id, fromNow(-1000));

			startWorker();

			await waitFor(async () => (await findDraft(draft)) == null);
			await waitFor(async () => (await getJob(draft)) == null);
			expect(await notesOf(draft)).toHaveLength(1);
		});

		test('延期されたドラフトのジョブは、新しい時刻まで延期され、失敗扱いにならない', async () => {
			const scheduledAt = fromNow(HOUR);
			const draft = await createDraft({ scheduledAt });
			// 延期のときに実行中で取り消せなかったジョブを想定する
			await queueService.ensureNotePostScheduled(draft.id, fromNow(-1000));

			const failed = vi.fn();
			startWorker().on('failed', failed);

			await waitFor(async () => (await (await getJob(draft))?.getState()) === 'delayed');

			const job = await getJob(draft);
			if (job == null) throw new Error('job not found');
			expect(job.timestamp + job.delay).toBeGreaterThan(scheduledAt.getTime() - MINUTE);
			expect(job.timestamp + job.delay).toBeLessThanOrEqual(scheduledAt.getTime() + MINUTE);
			expect(await notesOf(draft)).toHaveLength(0);
			expect(failed).not.toHaveBeenCalled();
		});

		test('jobIdを固定する前のジョブと固定IDのジョブが両方動いても、1回だけ投稿する', async () => {
			const draft = await createDraft();
			// 旧形式: ジョブ名がドラフトIDで、jobIdは自動採番
			await queueService.postScheduledNoteQueue.add(draft.id, { noteDraftId: draft.id }, { removeOnComplete: true });
			await queueService.scheduleNotePost(draft.id, fromNow(-1000));

			startWorker();

			await waitFor(async () => (await queueService.postScheduledNoteQueue.getJobCounts('waiting', 'active', 'delayed').then(c => c.waiting + c.active + c.delayed)) === 0);
			expect(await notesOf(draft)).toHaveLength(1);
			expect(await findDraft(draft)).toBeNull();
		});
	});

	describe('reconcile', () => {
		test('ジョブが失われたドラフトを登録し直し、待機中のジョブがあるドラフトは触らない', async () => {
			const lost = await createDraft({ scheduledAt: fromNow(-2 * MINUTE) });
			const waiting = await createDraft({ scheduledAt: fromNow(-2 * MINUTE) });
			await queueService.scheduleNotePost(waiting.id, fromNow(MINUTE));
			const justNow = await createDraft({ scheduledAt: fromNow(-10 * 1000) });
			const future = await createDraft({ scheduledAt: fromNow(HOUR) });
			const unscheduled = await createDraft({ scheduledAt: fromNow(-2 * MINUTE), isActuallyScheduled: false });
			const givenUp = await createDraft({ scheduledAt: fromNow(-2 * MINUTE), postAttempts: MAX_SCHEDULED_POST_REQUEUES });

			expect(await service.reconcile()).toBe('finished: 0, requeued: 1, failed: 0');

			expect(await (await getJob(lost))?.getState()).toBe('waiting');
			expect((await findDraft(lost))?.postAttempts).toBe(1);
			expect((await findDraft(waiting))?.postAttempts).toBe(0);
			for (const draft of [justNow, future, unscheduled, givenUp]) {
				expect(await getJob(draft)).toBeUndefined();
			}
		});

		test('失敗したジョブが残っているドラフトは、そのジョブを取り除いて登録し直す', async () => {
			const draft = await createDraft({ scheduledAt: fromNow(-2 * MINUTE) });
			await leaveFailedJob(draft);

			expect(await service.reconcile()).toBe('finished: 0, requeued: 1, failed: 0');

			expect(await (await getJob(draft))?.getState()).toBe('waiting');
		});

		test('登録し直す回数には上限がある', async () => {
			const draft = await createDraft({ scheduledAt: fromNow(-2 * MINUTE) });

			for (let i = 0; i < MAX_SCHEDULED_POST_REQUEUES; i++) {
				await queueService.cancelScheduledNotePost(draft.id);
				expect(await service.reconcile()).toBe('finished: 0, requeued: 1, failed: 0');
			}

			await queueService.cancelScheduledNotePost(draft.id);
			expect(await service.reconcile()).toBe('finished: 0, requeued: 0, failed: 0');
			expect(await getJob(draft)).toBeUndefined();
		});

		test('ジョブの登録に失敗しても、登録し直す回数を消費しない', async () => {
			const draft = await createDraft({ scheduledAt: fromNow(-2 * MINUTE) });
			const add = vi.spyOn(queueService.postScheduledNoteQueue, 'add').mockRejectedValueOnce(new Error('redis is down'));

			expect(await service.reconcile()).toBe('finished: 0, requeued: 0, failed: 1');
			expect((await findDraft(draft))?.postAttempts).toBe(0);

			add.mockRestore();
			expect(await service.reconcile()).toBe('finished: 0, requeued: 1, failed: 0');
			expect((await findDraft(draft))?.postAttempts).toBe(1);
		});

		test('後処理の前に止まった投稿済みのドラフトを片付ける', async () => {
			const noteId = idService.gen();
			const stale = await createDraft({ postedAt: fromNow(-2 * MINUTE), postedNoteId: noteId });
			// 処理中のジョブと重ならないよう、直後のものは拾わない
			const fresh = await createDraft({ postedAt: new Date(), postedNoteId: idService.gen() });

			expect(await service.reconcile()).toBe('finished: 1, requeued: 0, failed: 0');

			expect(await findDraft(stale)).toBeNull();
			expect(await findDraft(fresh)).not.toBeNull();
			expect(notificationsOf('scheduledNotePosted')).toEqual([[alice.id, 'scheduledNotePosted', { noteId }]]);
		});
	});
});
