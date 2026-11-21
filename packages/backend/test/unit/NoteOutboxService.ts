/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type * as Redis from 'ioredis';
import type { DataSource } from 'typeorm';
import type { MiNote, MiUser, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import type { MiNoteOutbox } from '@/models/NoteOutbox.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteUpdateService } from '@/core/NoteUpdateService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { NOTE_OUTBOX_MAX_ATTEMPTS, NoteOutboxService } from '@/core/NoteOutboxService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { QueueService } from '@/core/QueueService.js';
import { HashtagService } from '@/core/HashtagService.js';
import { RelayService } from '@/core/RelayService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import NotesChart from '@/core/chart/charts/notes.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('NoteOutboxService', () => {
	let app: TestingModule;
	let db: DataSource;
	let service: NoteOutboxService;
	let noteCreateService: NoteCreateService;
	let noteUpdateService: NoteUpdateService;
	let noteDeleteService: NoteDeleteService;
	let queueService: QueueService;
	let idService: IdService;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;

	let dispatch: MockInstance<NoteOutboxService['dispatch']>;
	let dispatchClaimed: MockInstance<NoteOutboxService['dispatchClaimed']>;
	let publishNotesStream: MockInstance<GlobalEventService['publishNotesStream']>;
	let publishNoteStream: MockInstance<GlobalEventService['publishNoteStream']>;
	let notesChartUpdate: MockInstance<NotesChart['update']>;
	let deliverToFollowers: MockInstance<ApDeliverManagerService['deliverToFollowersAndUsers']>;

	let alice: MiUser;
	let bob: MiUser;

	async function createUser(data: Partial<MiUser> = {}) {
		const id = idService.gen();
		const un = data.username ?? secureRndstr(16);
		await usersRepository.insert({ id, username: un, usernameLower: un.toLowerCase(), ...data });
		await userProfilesRepository.insert({ userId: id });
		return await usersRepository.findOneByOrFail({ id });
	}

	async function recordsOf(noteId: MiNote['id']): Promise<MiNoteOutbox[]> {
		const rows: MiNoteOutbox[] = await db.query('SELECT * FROM "note_outbox" WHERE "noteId" = $1 ORDER BY "seq"', [noteId]);
		return rows.map(row => ({ ...row, seq: String(row.seq) }));
	}

	async function recordOf(noteId: MiNote['id'], type: MiNoteOutbox['type']): Promise<MiNoteOutbox> {
		const record = (await recordsOf(noteId)).find(r => r.type === type);
		if (record == null) throw new Error(`no ${type} record of ${noteId}`);
		return record;
	}

	/**
	 * コミットの直後に停止したのと同じ状態を作る（プロセス内の処理を始めない）。
	 * 作成のレコードは処理中の状態で記録されるので、その期限が切れた後の状態にする
	 */
	async function createWithoutProcessing(user: MiUser, data: Parameters<NoteCreateService['create']>[1]) {
		const note = await noteCreateService.create(user, data);
		await db.query('UPDATE "note_outbox" SET "lockedUntil" = now() - interval \'1 second\' WHERE "noteId" = $1', [note.id]);
		return note;
	}

	function notesChartCalls(note: Pick<MiNote, 'id'>, isAdditional: boolean) {
		return notesChartUpdate.mock.calls.filter(([n, add]) => n.id === note.id && add === isAdditional).length;
	}

	function deletedEventsOf(note: Pick<MiNote, 'id'>) {
		return publishNoteStream.mock.calls.filter(([n, type]) => n.id === note.id && type === 'deleted').length;
	}

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
			})
			.compile();
		// NoteEntityService.packが使うサービスは、onModuleInitで解決される
		await app.init();

		db = app.get(DI.db);
		service = app.get(NoteOutboxService);
		noteCreateService = app.get(NoteCreateService);
		noteUpdateService = app.get(NoteUpdateService);
		noteDeleteService = app.get(NoteDeleteService);
		queueService = app.get(QueueService);
		idService = app.get(IdService);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);

		alice = await createUser({ host: null });
		bob = await createUser({ host: null });

		app.enableShutdownHooks();
	});

	beforeEach(() => {
		// restoreMocksが有効なので、spyはテストごとに作る。
		// @bindThisのメソッドは最初の参照でインスタンスのプロパティになるので、その後でspyする
		void service.dispatch;
		dispatch = vi.spyOn(service, 'dispatch').mockImplementation(() => {});
		void service.dispatchClaimed;
		dispatchClaimed = vi.spyOn(service, 'dispatchClaimed').mockImplementation(() => {});

		const globalEventService = app.get(GlobalEventService);
		void globalEventService.publishNotesStream;
		void globalEventService.publishNoteStream;
		publishNotesStream = vi.spyOn(globalEventService, 'publishNotesStream');
		publishNoteStream = vi.spyOn(globalEventService, 'publishNoteStream');

		const notesChart = app.get(NotesChart);
		void notesChart.update;
		notesChartUpdate = vi.spyOn(notesChart, 'update');

		const apDeliverManagerService = app.get(ApDeliverManagerService);
		void apDeliverManagerService.deliverToFollowersAndUsers;
		deliverToFollowers = vi.spyOn(apDeliverManagerService, 'deliverToFollowersAndUsers').mockResolvedValue(undefined);
	});

	afterEach(async () => {
		await db.query('DELETE FROM "note_outbox"');
		await notesRepository.createQueryBuilder().delete().execute();
		await usersRepository.update({ id: alice.id }, { notesCount: 0 });
		await usersRepository.update({ id: bob.id }, { notesCount: 0 });
	});

	afterAll(async () => {
		await usersRepository.delete({ id: alice.id });
		await usersRepository.delete({ id: bob.id });
		await app.close();
	});

	describe('記録', () => {
		test('作成と同じトランザクションで、作成のレコードを処理中の状態で記録し、コミット後にこのプロセスで処理を始める', async () => {
			const note = await noteCreateService.create(alice, { text: 'hello' });

			const records = await recordsOf(note.id);
			expect(records.map(r => r.type)).toEqual(['created']);
			expect(records[0].attempts).toBe(1);
			expect(records[0].lockedUntil).not.toBeNull();
			// 照合ジョブやほかのプロセスは、期限が切れるまで処理しない
			expect(await service.process(records[0].seq)).toBe('skipped');
			expect(dispatchClaimed).toHaveBeenCalledOnce();
			expect(dispatchClaimed.mock.calls[0][0].seq).toBe(records[0].seq);
		});

		test('コミット直後のこのプロセスでの処理は、作成に使ったオブジェクトで副作用を実行し、レコードを片付ける', async () => {
			dispatchClaimed.mockRestore();
			const note = await noteCreateService.create(alice, { text: 'hello' });

			for (let i = 0; i < 50 && (await recordsOf(note.id)).length > 0; i++) {
				await new Promise(resolve => setTimeout(resolve, 20));
			}
			expect(await recordsOf(note.id)).toEqual([]);
			expect(publishNotesStream.mock.calls.filter(([n]) => n.id === note.id)).toHaveLength(1);
			expect(notesChartCalls(note, true)).toBe(1);
		});

		test('更新と同じトランザクションで、更新のレコードを記録する', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			await noteUpdateService.update(alice, { text: 'edited' }, note);

			expect((await recordsOf(note.id)).map(r => r.type)).toEqual(['created', 'updated']);
		});

		test('レコードとpayloadには、本文やCWなどの内容を持たせない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'secret text', cw: 'secret cw' });
			await service.process((await recordOf(note.id, 'created')).seq);

			// 削除の副作用はコミット後に処理するので、その前に止める
			void service.processNow;
			vi.spyOn(service, 'processNow').mockResolvedValue();
			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));

			const records = await recordsOf(note.id);
			expect(records.map(r => r.type)).toEqual(['deleted']);
			expect(JSON.stringify(records)).not.toContain('secret');
		});
	});

	describe('処理', () => {
		test('コミットの直後に停止しても、後から1回だけ処理する', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');

			expect(await service.process(seq)).toBe('done');
			expect(await service.process(seq)).toBe('skipped');

			expect(await recordsOf(note.id)).toEqual([]);
			expect(publishNotesStream.mock.calls.filter(([n]) => n.id === note.id)).toHaveLength(1);
			expect(notesChartCalls(note, true)).toBe(1);
		});

		test('副作用の途中で失敗しても、再試行では終わっていない副作用だけを実行する', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');

			publishNotesStream.mockImplementationOnce(() => {
				throw new Error('stream is down');
			});

			expect(await service.process(seq)).toBe('retry');
			const record = await recordOf(note.id, 'created');
			expect(record.doneSteps).toContain('stats');
			expect(record.doneSteps).toContain('index');
			expect(record.doneSteps).not.toContain('stream');
			// 再試行の時刻まで、ほかのプロセスは処理しない
			expect(await service.process(seq)).toBe('skipped');

			await db.query('UPDATE "note_outbox" SET "lockedUntil" = now() - interval \'1 second\' WHERE "seq" = $1', [seq]);
			expect(await service.process(seq)).toBe('done');

			expect(publishNotesStream.mock.calls.filter(([n]) => n.id === note.id)).toHaveLength(2);
			expect(notesChartCalls(note, true)).toBe(1);
		});

		test('チャートの差分がデータベースに保存されるまで、statsを完了にしない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');

			const notesChart = app.get(NotesChart);
			void notesChart.waitForSave;
			const waitForSave = vi.spyOn(notesChart, 'waitForSave').mockRejectedValueOnce(new Error('process stopped before save'));

			expect(await service.process(seq)).toBe('retry');
			expect((await recordOf(note.id, 'created')).doneSteps).not.toContain('stats');

			await db.query('UPDATE "note_outbox" SET "lockedUntil" = now() - interval \'1 second\' WHERE "seq" = $1', [seq]);
			expect(await service.process(seq)).toBe('done');
			// 保存を確かめられなかった差分は、再試行で積み直す
			expect(notesChartCalls(note, true)).toBe(2);
			expect(waitForSave).toHaveBeenCalledTimes(2);
		});

		test('処理を始めた回数が上限に達したら、失敗した副作用を諦めてレコードを削除する', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');
			await db.query('UPDATE "note_outbox" SET "attempts" = $2 WHERE "seq" = $1', [seq, NOTE_OUTBOX_MAX_ATTEMPTS - 1]);

			publishNotesStream.mockImplementation(() => {
				throw new Error('stream is down');
			});

			expect(await service.process(seq)).toBe('done');
			expect(await recordsOf(note.id)).toEqual([]);
		});

		test('期限が切れてほかのプロセスに取得し直されたら、完了の記録とレコードの削除をしない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');

			// 最初の副作用の途中で、ほかのプロセスが取得し直す（世代が進む）
			notesChartUpdate.mockImplementationOnce(async () => {
				await db.query('UPDATE "note_outbox" SET "attempts" = "attempts" + 1, "doneSteps" = \'{}\' WHERE "seq" = $1', [seq]);
			});

			expect(await service.process(seq)).toBe('skipped');
			// 取得し直したプロセスのレコードは残り、古いプロセスの完了の記録は反映されない
			const record = await recordOf(note.id, 'created');
			expect(record.attempts).toBe(3);
			expect(record.doneSteps).toEqual([]);
		});

		test('副作用が失敗した後に取得し直されていたら、次の副作用を始めない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');
			const publishedBefore = publishNotesStream.mock.calls.length;

			// 最初の副作用が失敗する間に、ほかのプロセスが取得し直す（世代が進む）
			const hashtagService = app.get(HashtagService);
			void hashtagService.updateHashtags;
			vi.spyOn(hashtagService, 'updateHashtags').mockImplementationOnce(async () => {
				await db.query('UPDATE "note_outbox" SET "attempts" = "attempts" + 1 WHERE "seq" = $1', [seq]);
				throw new Error('hashtag update failed');
			});

			expect(await service.process(seq)).toBe('skipped');
			expect(publishNotesStream.mock.calls.length).toBe(publishedBefore);
			expect((await recordOf(note.id, 'created')).doneSteps).not.toContain('stream');
		});

		test('完了の記録が失敗し、その間に取得し直されていたら、次の副作用を始めない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');
			const publishedBefore = publishNotesStream.mock.calls.length;

			// 完了の記録がすべて失敗し、その間にほかのプロセスが取得し直す（世代が進む）。
			// 記録の結果からは取得し直されたことがわからないので、確かめ直さなければ次の副作用を始めてしまう
			const query = db.query.bind(db);
			let failedOnce = false;
			const spy = vi.spyOn(db, 'query').mockImplementation(async (sql: string, params?: unknown[]) => {
				if (sql.includes('array_append')) {
					if (!failedOnce) {
						failedOnce = true;
						await query('UPDATE "note_outbox" SET "attempts" = "attempts" + 1 WHERE "seq" = $1', [seq]);
					}
					throw new Error('connection lost');
				}
				return await query(sql, params);
			});
			try {
				expect(await service.process(seq)).toBe('skipped');
			} finally {
				spy.mockRestore();
			}

			expect(failedOnce).toBe(true);
			expect(publishNotesStream.mock.calls.length).toBe(publishedBefore);
			expect((await recordOf(note.id, 'created')).doneSteps).not.toContain('stream');
		});

		test('ほかのプロセスが処理中（期限内）のレコードは処理しない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const { seq } = await recordOf(note.id, 'created');
			await db.query('UPDATE "note_outbox" SET "attempts" = 1, "lockedUntil" = now() + interval \'1 minute\' WHERE "seq" = $1', [seq]);

			expect(await service.process(seq)).toBe('skipped');
			expect(notesChartCalls(note, true)).toBe(0);
		});

		test('同じノートの先のレコードが残っている間は、後のレコードを処理しない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const created = await recordOf(note.id, 'created');
			// 作成の処理が途中で止まった（処理を始めているので、削除では取り消されない）
			await db.query('UPDATE "note_outbox" SET "attempts" = 1, "lockedUntil" = now() - interval \'1 second\' WHERE "seq" = $1', [created.seq]);

			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));

			// 削除の副作用は、作成の副作用が終わるまで実行しない（作成の前に削除を配送しない）
			expect(deletedEventsOf(note)).toBe(0);
			const deleted = await recordOf(note.id, 'deleted');
			expect(await service.process(deleted.seq)).toBe('skipped');

			expect(await service.process(created.seq)).toBe('done');
			// 作成の処理を終えると、同じノートの次のレコードを続けて処理する
			expect(dispatch).toHaveBeenLastCalledWith([deleted.seq]);
			expect(await service.process(deleted.seq)).toBe('done');
			expect(deletedEventsOf(note)).toBe(1);
		});
	});

	describe('作成の副作用を終える前の削除', () => {
		test('作成のレコードを誰も処理していなければ取り消し、チャートを取り消さない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			// 処理を始めていないレコード（照合ジョブ待ちなど）
			await db.query('UPDATE "note_outbox" SET "attempts" = 0, "lockedUntil" = NULL WHERE "noteId" = $1', [note.id]);

			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));

			expect(await recordsOf(note.id)).toEqual([]);
			expect(notesChartCalls(note, true)).toBe(0);
			expect(notesChartCalls(note, false)).toBe(0);
			// 削除の配送・ストリーム・索引は、作成を受け取っていない宛先に届いても害がないので、そのまま実行する
			expect(deliverToFollowers).toHaveBeenCalledOnce();
			expect(deletedEventsOf(note)).toBe(1);
		});

		test('作成のコミット直後に停止してから削除されたら、照合ジョブの処理の後で、チャートを取り消さない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const created = await recordOf(note.id, 'created');

			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));
			const deleted = await recordOf(note.id, 'deleted');

			expect(await service.process(created.seq)).toBe('done');
			expect((await recordOf(note.id, 'deleted')).payload.createdDone).toEqual([]);
			expect(await service.process(deleted.seq)).toBe('done');

			expect(notesChartCalls(note, true)).toBe(0);
			expect(notesChartCalls(note, false)).toBe(0);
			expect(deliverToFollowers).toHaveBeenCalledOnce();
		});

		test('作成の副作用の途中で削除されたら、実行した分だけを取り消す', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			const created = await recordOf(note.id, 'created');
			// 作成の処理がチャートの更新まで進んで止まった
			await db.query('UPDATE "note_outbox" SET "attempts" = 1, "doneSteps" = \'{stats}\', "lockedUntil" = now() - interval \'1 second\' WHERE "seq" = $1', [created.seq]);

			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));
			const deleted = await recordOf(note.id, 'deleted');

			// 再開した作成の処理は、ノートがないので何もせず、実行済みの副作用を削除のレコードに伝える
			expect(await service.process(created.seq)).toBe('done');
			expect((await recordOf(note.id, 'deleted')).payload.createdDone).toEqual(['stats']);

			expect(await service.process(deleted.seq)).toBe('done');
			expect(notesChartCalls(note, false)).toBe(1);
			// 作成の配送が一部の宛先にだけ届いて止まった場合もあるので、削除は配送する
			expect(deliverToFollowers).toHaveBeenCalledOnce();
		});

		test('作成の副作用がすべて終わっていれば、すべて取り消す', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			await service.process((await recordOf(note.id, 'created')).seq);

			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));

			expect(notesChartCalls(note, true)).toBe(1);
			expect(notesChartCalls(note, false)).toBe(1);
			expect(deliverToFollowers).toHaveBeenCalledOnce();
		});
	});

	describe('削除', () => {
		test('削除のコミットの直後に停止しても、行がなくなった後で副作用を1回だけ実行する', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			await service.process((await recordOf(note.id, 'created')).seq);

			void service.processNow;
			const processNow = vi.spyOn(service, 'processNow').mockResolvedValue();
			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));
			processNow.mockRestore();

			expect(await notesRepository.existsBy({ id: note.id })).toBe(false);
			expect(deletedEventsOf(note)).toBe(0);

			const { seq } = await recordOf(note.id, 'deleted');
			expect(await service.process(seq)).toBe('done');
			expect(await service.process(seq)).toBe('skipped');

			expect(deletedEventsOf(note)).toBe(1);
			expect(deliverToFollowers).toHaveBeenCalledOnce();
			expect(notesChartCalls(note, false)).toBe(1);
		});

		/** 削除をコミットし、プロセス内の処理を始めずに削除のレコードを返す */
		async function deleteWithoutProcessing(note: MiNote) {
			void service.processNow;
			const processNow = vi.spyOn(service, 'processNow').mockResolvedValue();
			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));
			processNow.mockRestore();
			return (await recordOf(note.id, 'deleted')).seq;
		}

		test('リレーへの配送の登録が失敗しても、再試行ではフォロワーへの配送を重ねて登録しない', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			await service.process((await recordOf(note.id, 'created')).seq);
			deliverToFollowers.mockClear();
			const seq = await deleteWithoutProcessing(note);

			const relayService = app.get(RelayService);
			void relayService.deliverToRelays;
			const deliverToRelays = vi.spyOn(relayService, 'deliverToRelays')
				.mockRejectedValueOnce(new Error('redis is down'))
				.mockResolvedValue();

			expect(await service.process(seq)).toBe('retry');
			const record = await recordOf(note.id, 'deleted');
			expect(record.doneSteps).toContain('deliver');
			expect(record.doneSteps).not.toContain('deliverRelays');

			await db.query('UPDATE "note_outbox" SET "lockedUntil" = now() - interval \'1 second\' WHERE "seq" = $1', [seq]);
			expect(await service.process(seq)).toBe('done');

			expect(deliverToFollowers).toHaveBeenCalledOnce();
			expect(deliverToRelays).toHaveBeenCalledTimes(2);
		});

		test('Redisがストリームのイベントを受け付けなければ、streamを完了にせず再試行する', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			await service.process((await recordOf(note.id, 'created')).seq);
			const seq = await deleteWithoutProcessing(note);

			const redisForPub = app.get<Redis.Redis>(DI.redisForPub);
			vi.spyOn(redisForPub, 'publish').mockRejectedValueOnce(new Error('redis is down'));

			expect(await service.process(seq)).toBe('retry');
			expect((await recordOf(note.id, 'deleted')).doneSteps).not.toContain('stream');

			await db.query('UPDATE "note_outbox" SET "lockedUntil" = now() - interval \'1 second\' WHERE "seq" = $1', [seq]);
			expect(await service.process(seq)).toBe('done');
			expect(deletedEventsOf(note)).toBe(2);
		});
	});

	describe('drain', () => {
		test('処理できるレコードを、同じノートの順序を守ってすべて処理する', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			await service.process((await recordOf(note.id, 'created')).seq);
			await noteUpdateService.update(alice, { text: 'edited' }, await notesRepository.findOneByOrFail({ id: note.id }));
			void service.processNow;
			const processNow = vi.spyOn(service, 'processNow').mockResolvedValue();
			await noteDeleteService.delete(alice, await notesRepository.findOneByOrFail({ id: note.id }));
			processNow.mockRestore();
			const other = await createWithoutProcessing(bob, { text: 'other' });

			// まだ処理を始めていない更新のレコードは、削除のときに取り消されている
			expect((await recordsOf(note.id)).map(r => r.type)).toEqual(['deleted']);
			expect(await service.drain()).toEqual({ processed: 2, remaining: 0 });
			expect(await recordsOf(note.id)).toEqual([]);
			expect(await recordsOf(other.id)).toEqual([]);
			expect(deletedEventsOf(note)).toBe(1);
		});

		test('ほかのプロセスが処理中のレコードは残し、残りの数を返す', async () => {
			const note = await createWithoutProcessing(alice, { text: 'hello' });
			await db.query('UPDATE "note_outbox" SET "attempts" = 1, "lockedUntil" = now() + interval \'1 minute\' WHERE "noteId" = $1', [note.id]);

			expect(await service.drain()).toEqual({ processed: 0, remaining: 1 });
		});
	});

	describe('sweep', () => {
		test('プロセス内で処理されなかったレコードと、期限が切れたレコードをジョブにする', async () => {
			const stale = await createWithoutProcessing(alice, { text: 'stale' });
			const expired = await createWithoutProcessing(alice, { text: 'expired' });
			const fresh = await createWithoutProcessing(alice, { text: 'fresh' });
			const locked = await createWithoutProcessing(bob, { text: 'locked' });

			const staleSeq = (await recordOf(stale.id, 'created')).seq;
			const expiredSeq = (await recordOf(expired.id, 'created')).seq;
			const freshSeq = (await recordOf(fresh.id, 'created')).seq;
			const lockedSeq = (await recordOf(locked.id, 'created')).seq;
			// stale・fresh: 誰も処理を始めていない。staleだけが1分より前に記録された
			await db.query('UPDATE "note_outbox" SET "attempts" = 0, "lockedUntil" = NULL WHERE "seq" = ANY($1)', [[staleSeq, freshSeq]]);
			await db.query('UPDATE "note_outbox" SET "createdAt" = now() - interval \'5 minutes\' WHERE "seq" = $1', [staleSeq]);
			await db.query('UPDATE "note_outbox" SET "attempts" = 1, "lockedUntil" = now() - interval \'1 second\' WHERE "seq" = $1', [expiredSeq]);
			await db.query('UPDATE "note_outbox" SET "attempts" = 1, "createdAt" = now() - interval \'5 minutes\', "lockedUntil" = now() + interval \'1 minute\' WHERE "seq" = $1', [lockedSeq]);

			await queueService.dbQueue.obliterate({ force: true });
			try {
				expect(await service.sweep()).toBe(2);

				expect(await queueService.dbQueue.getJob(`noteOutbox-${staleSeq}`)).toBeTruthy();
				expect(await queueService.dbQueue.getJob(`noteOutbox-${expiredSeq}`)).toBeTruthy();
				expect(await queueService.dbQueue.getJob(`noteOutbox-${freshSeq}`)).toBeFalsy();
				expect(await queueService.dbQueue.getJob(`noteOutbox-${lockedSeq}`)).toBeFalsy();

				// 同じレコードのジョブがキューにある間は、二重に登録しない
				await service.sweep();
				const jobs = await queueService.dbQueue.getJobs(['waiting', 'delayed', 'active']);
				expect(jobs.filter(job => job.name === 'processNoteOutbox')).toHaveLength(2);
				expect(jobs.find(job => job.id === `noteOutbox-${staleSeq}`)?.data).toEqual({ v: 1, seq: staleSeq });
			} finally {
				await queueService.dbQueue.obliterate({ force: true });
			}
		});
	});
});
