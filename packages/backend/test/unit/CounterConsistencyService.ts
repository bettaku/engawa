/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { In } from 'typeorm';
import type { DataSource } from 'typeorm';
import type { ClipNotesRepository, ClipsRepository, FollowingsRepository, MiNote, MiUser, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { COUNTER_NAMES, CounterConsistencyService } from '@/core/CounterConsistencyService.js';
import { ALL_NOTE_DELETE_EFFECTS, NO_NOTE_DELETE_EFFECTS, NoteDeleteService } from '@/core/NoteDeleteService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteOutboxService } from '@/core/NoteOutboxService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('CounterConsistencyService', () => {
	let app: TestingModule;
	let service: CounterConsistencyService;
	let noteDeleteService: NoteDeleteService;
	let noteCreateService: NoteCreateService;
	let db: DataSource;
	let idService: IdService;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let followingsRepository: FollowingsRepository;
	let clipsRepository: ClipsRepository;
	let clipNotesRepository: ClipNotesRepository;

	const createdUsers: MiUser[] = [];

	async function createUser(data: Partial<MiUser> = {}) {
		const id = idService.gen();
		const un = data.username ?? secureRndstr(16);
		await usersRepository.insert({
			id,
			username: un,
			usernameLower: un.toLowerCase(),
			...data,
		});
		await userProfilesRepository.insert({ userId: id });
		const user = await usersRepository.findOneByOrFail({ id });
		createdUsers.push(user);
		return user;
	}

	async function createNote(data: Partial<MiNote>, user: MiUser): Promise<MiNote> {
		const id = idService.gen();
		await notesRepository.insert({
			id,
			text: `note_${id}`,
			userId: user.id,
			userHost: user.host,
			visibility: 'public',
			...data,
		});
		return await notesRepository.findOneByOrFail({ id });
	}

	async function follow(follower: MiUser, followee: MiUser) {
		await followingsRepository.insert({
			id: idService.gen(),
			followerId: follower.id,
			followeeId: followee.id,
			followerHost: follower.host,
			followeeHost: followee.host,
		});
	}

	async function mismatches() {
		const reports = await service.check();
		return Object.fromEntries(reports.filter(r => r.mismatched > 0).map(r => [r.counter, r.samples]));
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

		service = app.get(CounterConsistencyService);
		noteDeleteService = app.get(NoteDeleteService);
		noteCreateService = app.get(NoteCreateService);
		db = app.get(DI.db);
		idService = app.get(IdService);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		followingsRepository = app.get(DI.followingsRepository);
		clipsRepository = app.get(DI.clipsRepository);
		clipNotesRepository = app.get(DI.clipNotesRepository);

		app.enableShutdownHooks();
	});

	beforeEach(async () => {
		// カウンタはノートの作成・削除と同じトランザクションで更新する。outboxの後処理（配送・チャートなど）はこのテストの対象外
		const noteOutboxService = app.get(NoteOutboxService);
		void noteOutboxService.dispatchClaimed;
		void noteOutboxService.processNow;
		vi.spyOn(noteOutboxService, 'dispatchClaimed').mockImplementation(() => {});
		vi.spyOn(noteOutboxService, 'processNow').mockResolvedValue();

		// 他のテストが残したデータの影響を受けないように、空のDBから始める
		await db.query('DELETE FROM "note_outbox"');
		await clipNotesRepository.createQueryBuilder().delete().execute();
		await clipsRepository.createQueryBuilder().delete().execute();
		await followingsRepository.createQueryBuilder().delete().execute();
		await notesRepository.createQueryBuilder().delete().execute();
		await service.repair();
	});

	afterAll(async () => {
		await clipNotesRepository.createQueryBuilder().delete().execute();
		await clipsRepository.createQueryBuilder().delete().execute();
		await followingsRepository.createQueryBuilder().delete().execute();
		await notesRepository.createQueryBuilder().delete().execute();
		for (const user of createdUsers) {
			await usersRepository.delete({ id: user.id });
		}
		await app.close();
	});

	test('ずれたカウンタを検出し、修復すると差分がゼロになる', async () => {
		const alice = await createUser({ host: null });
		const bob = await createUser({ host: null });
		const bot = await createUser({ host: null, isBot: true });

		const parent = await createNote({}, alice);
		await createNote({ replyId: parent.id, replyUserId: alice.id }, bob);
		await createNote({ replyId: parent.id, replyUserId: alice.id }, bob);
		// Renoteは、Renote先の投稿者以外で、botでない投稿者のものだけを数える
		await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bob);
		await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: 'quote' }, bob);
		await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, alice);
		await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bot);

		const clipId = idService.gen();
		await clipsRepository.insert({ id: clipId, userId: alice.id, name: 'clip' });
		await clipNotesRepository.insert({ id: idService.gen(), noteId: parent.id, clipId });

		await follow(alice, bob);
		await follow(bot, bob);

		// 加算・減算を経ずに作ったので、カウンタはずれている
		const before = await mismatches();
		expect(Object.keys(before).sort()).toEqual([
			'note.clippedCount',
			'note.renoteCount',
			'note.repliesCount',
			'user.followersCount',
			'user.followingCount',
			'user.notesCount',
		]);
		expect(before['note.repliesCount']).toContainEqual({ id: parent.id, actual: 0, expected: 2 });
		expect(before['note.renoteCount']).toContainEqual({ id: parent.id, actual: 0, expected: 2 });

		const reports = await service.repair();
		expect(reports.find(r => r.counter === 'note.repliesCount')?.repaired).toBe(1);

		expect(await mismatches()).toEqual({});
		const repaired = await notesRepository.findOneByOrFail({ id: parent.id });
		expect(repaired.repliesCount).toBe(2);
		expect(repaired.renoteCount).toBe(2);
		expect(repaired.clippedCount).toBe(1);
		expect((await usersRepository.findOneByOrFail({ id: bob.id })).followersCount).toBe(2);
		expect((await usersRepository.findOneByOrFail({ id: alice.id })).followingCount).toBe(1);
		expect((await usersRepository.findOneByOrFail({ id: bob.id })).notesCount).toBe(4);
	});

	test('リモートのユーザーのノート数・フォロー数は対象にしない', async () => {
		const remote = await createUser({ host: 'remote.example.com', notesCount: 100, followersCount: 50, followingCount: 10 });

		expect(await mismatches()).toEqual({});
		await service.repair();
		expect(await usersRepository.findOneByOrFail({ id: remote.id })).toMatchObject({ notesCount: 100, followersCount: 50, followingCount: 10 });
	});

	test('引っ越し済みのユーザーとのフォローは数えない', async () => {
		const alice = await createUser({ host: null });
		const moved = await createUser({ host: null, movedToUri: 'https://example.com/users/new' });
		await follow(alice, moved);
		await follow(moved, alice);

		expect(await mismatches()).toEqual({});
	});

	test('smallintの上限を超える値は上限に丸める', async () => {
		const alice = await createUser({ host: null });
		const parent = await createNote({}, alice);
		await notesRepository.update(parent.id, { repliesCount: 5 });

		await notesRepository.query(
			'INSERT INTO "note" ("id", "userId", "replyId", "visibility") SELECT \'r\' || g, $1, $2, \'public\' FROM generate_series(1, 32768) g',
			[alice.id, parent.id],
		);
		await service.repair(['note.repliesCount']);

		expect((await notesRepository.findOneByOrFail({ id: parent.id })).repliesCount).toBe(32767);
	});

	test('バッチの境界をまたいでも全件を確認する', async () => {
		const alice = await createUser({ host: null });
		for (let i = 0; i < 5; i++) {
			await createNote({ repliesCount: 1 }, alice);
		}

		const [report] = await service.check(['note.repliesCount'], { batchSize: 2 });
		expect(report.checked).toBe(5);
		expect(report.mismatched).toBe(5);
	});

	test('ノートを削除しても、カウンタは数え直した値と一致する', async () => {
		const alice = await createUser({ host: null });
		const bob = await createUser({ host: null });
		const bot = await createUser({ host: null, isBot: true });

		const parent = await createNote({}, alice);
		const reply = await createNote({ replyId: parent.id, replyUserId: alice.id }, bob);
		const renote = await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bob);
		const quote = await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: 'quote' }, bob);
		const selfRenote = await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, alice);
		const botRenote = await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bot);
		// 作成時の加算の結果に揃える
		await service.repair();

		const effects = { ...NO_NOTE_DELETE_EFFECTS, repliesCount: true, renoteCount: true, notesCount: true };
		const renoteCountOfParent = async () => (await notesRepository.findOneByOrFail({ id: parent.id })).renoteCount;
		expect(await renoteCountOfParent()).toBe(2);

		// 数えていない自分のRenoteとbotのRenoteを先に消し、Renote数が減らないことを確かめる
		await noteDeleteService.deleteMany(alice, [selfRenote], { effects });
		expect(await renoteCountOfParent()).toBe(2);
		await noteDeleteService.deleteMany(bot, [botRenote], { effects });
		expect(await renoteCountOfParent()).toBe(2);

		await noteDeleteService.deleteMany(bob, [reply, renote, quote], { effects });

		expect(await mismatches()).toEqual({});
		const after = await notesRepository.findOneByOrFail({ id: parent.id });
		expect(after.repliesCount).toBe(0);
		expect(after.renoteCount).toBe(0);
		expect((await usersRepository.findOneByOrFail({ id: bob.id })).notesCount).toBe(0);
		expect((await usersRepository.findOneByOrFail({ id: alice.id })).notesCount).toBe(1);
	});

	test('上限に丸めたRenote数は、削除のときに数え直す', async () => {
		const alice = await createUser({ host: null });
		const bob = await createUser({ host: null });
		const parent = await createNote({}, alice);

		await notesRepository.query(
			'INSERT INTO "note" ("id", "userId", "renoteId", "renoteUserId", "visibility") SELECT \'rn\' || g, $1, $2, $3, \'public\' FROM generate_series(1, 32768) g',
			[bob.id, parent.id, alice.id],
		);
		// 修復で上限に丸めた状態（修復の丸めは、smallintの上限のテストで確かめている）
		await notesRepository.update(parent.id, { renoteCount: 32767 });

		const effects = { ...NO_NOTE_DELETE_EFFECTS, renoteCount: true };
		// 残りは32767件なので、上限のまま
		await noteDeleteService.deleteMany(bob, [await notesRepository.findOneByOrFail({ id: 'rn1' })], { effects });
		expect((await notesRepository.findOneByOrFail({ id: parent.id })).renoteCount).toBe(32767);
		// 残りは32766件
		await noteDeleteService.deleteMany(bob, [await notesRepository.findOneByOrFail({ id: 'rn2' })], { effects });
		expect((await notesRepository.findOneByOrFail({ id: parent.id })).renoteCount).toBe(32766);
	});

	test('同じRenote先へのRenoteをまとめて削除しても、上限に丸めたRenote数を数え直した値から引かない', async () => {
		const alice = await createUser({ host: null });
		const bob = await createUser({ host: null });
		const parent = await createNote({}, alice);

		await notesRepository.query(
			'INSERT INTO "note" ("id", "userId", "renoteId", "renoteUserId", "visibility") SELECT \'rb\' || g, $1, $2, $3, \'public\' FROM generate_series(1, 32768) g',
			[bob.id, parent.id, alice.id],
		);
		await notesRepository.update(parent.id, { renoteCount: 32767 });

		const effects = { ...NO_NOTE_DELETE_EFFECTS, renoteCount: true };
		const targets = await notesRepository.findBy({ id: In(['rb1', 'rb2']) });
		await noteDeleteService.deleteMany(bob, targets, { effects });

		// 残りは32766件
		expect((await notesRepository.findOneByOrFail({ id: parent.id })).renoteCount).toBe(32766);
	});

	test('同じRenote先へのRenoteをまとめて削除すると、件数分だけ減らす', async () => {
		const alice = await createUser({ host: null });
		const bob = await createUser({ host: null });
		const parent = await createNote({}, alice);
		const renotes = [
			await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bob),
			await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bob),
			await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bob),
		];
		await service.repair(['note.renoteCount']);

		await noteDeleteService.deleteMany(bob, renotes.slice(0, 2), { effects: { ...NO_NOTE_DELETE_EFFECTS, renoteCount: true } });

		expect((await notesRepository.findOneByOrFail({ id: parent.id })).renoteCount).toBe(1);
	});

	describe('ノートの作成・削除と同じトランザクションでの更新（P3-1）', () => {
		async function renoteCountOf(note: MiNote) {
			return (await notesRepository.findOneByOrFail({ id: note.id })).renoteCount;
		}

		test('作成直後に削除しても、カウンタに1が残らない', async () => {
			const alice = await createUser({ host: null });
			const bob = await createUser({ host: null });
			const parent = await createNote({}, alice);
			// 直接insertしたノートの分を合わせておく
			await service.repair(['user.notesCount']);

			const renote = await noteCreateService.create(bob, { renote: parent });
			const reply = await noteCreateService.create(bob, { reply: parent, text: 'reply' });
			expect(await renoteCountOf(parent)).toBe(1);
			expect((await notesRepository.findOneByOrFail({ id: parent.id })).repliesCount).toBe(1);
			expect((await usersRepository.findOneByOrFail({ id: bob.id })).notesCount).toBe(2);

			// 作成の後処理（outbox）を待たずに削除する
			await noteDeleteService.delete(bob, await notesRepository.findOneByOrFail({ id: renote.id }));
			await noteDeleteService.delete(bob, await notesRepository.findOneByOrFail({ id: reply.id }));

			expect(await renoteCountOf(parent)).toBe(0);
			expect((await notesRepository.findOneByOrFail({ id: parent.id })).repliesCount).toBe(0);
			expect((await usersRepository.findOneByOrFail({ id: bob.id })).notesCount).toBe(0);
			expect(await mismatches()).toEqual({});
		});

		test('作成時に計上したかどうかを記録し、削除時の投稿者のbotの設定に左右されない', async () => {
			const alice = await createUser({ host: null });
			const bob = await createUser({ host: null, isBot: false });
			const parent = await createNote({}, alice);
			// 直接insertしたノートの分を合わせておく
			await service.repair(['user.notesCount']);

			const renote = await noteCreateService.create(bob, { renote: parent });
			expect((await notesRepository.findOneByOrFail({ id: renote.id })).renoteCounted).toBe(true);
			expect(await renoteCountOf(parent)).toBe(1);

			// 作成後にbotに変えても、計上した事実は変わらない
			await usersRepository.update(bob.id, { isBot: true });
			expect(await mismatches()).toEqual({});

			await noteDeleteService.delete(await usersRepository.findOneByOrFail({ id: bob.id }), await notesRepository.findOneByOrFail({ id: renote.id }));
			expect(await renoteCountOf(parent)).toBe(0);
		});

		test('botのときに作成した（計上していない）Renoteは、botでなくなった後に削除しても、ほかのRenoteの分を減らさない', async () => {
			const alice = await createUser({ host: null });
			const bot = await createUser({ host: null, isBot: true });
			const carol = await createUser({ host: null });
			const parent = await createNote({}, alice);
			// 直接insertしたノートの分を合わせておく
			await service.repair(['user.notesCount']);

			const botRenote = await noteCreateService.create(bot, { renote: parent });
			await noteCreateService.create(carol, { renote: parent });
			expect((await notesRepository.findOneByOrFail({ id: botRenote.id })).renoteCounted).toBe(false);
			expect(await renoteCountOf(parent)).toBe(1);

			await usersRepository.update(bot.id, { isBot: false });
			expect(await mismatches()).toEqual({});

			await noteDeleteService.delete(await usersRepository.findOneByOrFail({ id: bot.id }), await notesRepository.findOneByOrFail({ id: botRenote.id }));
			expect(await renoteCountOf(parent)).toBe(1);
			expect(await mismatches()).toEqual({});
		});

		test('計上したかを記録する前のノートは、投稿者の現在のbotの設定で判定する', async () => {
			const alice = await createUser({ host: null });
			const bob = await createUser({ host: null });
			const parent = await createNote({}, alice);
			const renote = await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null, renoteCounted: null }, bob);
			await service.repair(['note.renoteCount']);
			expect(await renoteCountOf(parent)).toBe(1);

			await noteDeleteService.deleteMany(bob, [renote], { effects: ALL_NOTE_DELETE_EFFECTS });
			expect(await renoteCountOf(parent)).toBe(0);
		});

		test('上限に丸めたRenote数は、並行する削除が先にコミットした分も含めて数え直す', async () => {
			const alice = await createUser({ host: null });
			const bob = await createUser({ host: null });
			const parent = await createNote({}, alice);

			await notesRepository.query(
				'INSERT INTO "note" ("id", "userId", "renoteId", "renoteUserId", "visibility", "renoteCounted") SELECT \'rc\' || g, $1, $2, $3, \'public\', TRUE FROM generate_series(1, 32768) g',
				[bob.id, parent.id, alice.id],
			);
			await notesRepository.update(parent.id, { renoteCount: 32767 });
			const effects = { ...NO_NOTE_DELETE_EFFECTS, renoteCount: true };
			const [rc1, rc2] = await Promise.all([
				notesRepository.findOneByOrFail({ id: 'rc1' }),
				notesRepository.findOneByOrFail({ id: 'rc2' }),
			]);

			// Renote先の行ロックを先に取り、2つの削除を、どちらも行の削除を終えてロックを待つ状態にする
			const runner = db.createQueryRunner();
			await runner.startTransaction();
			try {
				await runner.query('SELECT 1 FROM "note" WHERE "id" = $1 FOR UPDATE', [parent.id]);
				const deletions = Promise.all([
					noteDeleteService.deleteMany(bob, [rc1], { effects }),
					noteDeleteService.deleteMany(bob, [rc2], { effects }),
				]);
				await setTimeout(500);
				await runner.commitTransaction();
				await deletions;
			} finally {
				await runner.release();
			}

			// 残りは32766件
			expect(await renoteCountOf(parent)).toBe(32766);
		});

		test('親と返信を並行して削除しても失敗せず、カウンタは数え直した値と一致する', async () => {
			const alice = await createUser({ host: null });
			for (let i = 0; i < 10; i++) {
				const parent = await noteCreateService.create(alice, { text: 'parent' });
				const reply = await noteCreateService.create(alice, { text: 'reply', reply: parent });
				const [p, r] = await Promise.all([
					notesRepository.findOneByOrFail({ id: parent.id }),
					notesRepository.findOneByOrFail({ id: reply.id }),
				]);

				await Promise.all([
					noteDeleteService.deleteMany(alice, [p, r], { effects: ALL_NOTE_DELETE_EFFECTS }),
					noteDeleteService.delete(alice, r),
				]);

				expect(await notesRepository.existsBy({ id: p.id })).toBe(false);
				expect(await notesRepository.existsBy({ id: r.id })).toBe(false);
			}
			expect((await usersRepository.findOneByOrFail({ id: alice.id })).notesCount).toBe(0);
		});

		test('書き込み中に修復しても、修復を待たせた加算を数え直しに含める', async () => {
			const alice = await createUser({ host: null });
			const bob = await createUser({ host: null });
			const parent = await createNote({}, alice);
			await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null, renoteCounted: true }, bob);
			// ずれた状態
			await notesRepository.update(parent.id, { renoteCount: 5 });

			// 作成のトランザクション（Renoteの行の追加と、Renote先の加算）を途中で止める
			const runner = db.createQueryRunner();
			await runner.startTransaction();
			try {
				await runner.query(
					'INSERT INTO "note" ("id", "userId", "renoteId", "renoteUserId", "visibility", "renoteCounted") VALUES ($1, $2, $3, $4, \'public\', TRUE)',
					[idService.gen(), bob.id, parent.id, alice.id],
				);
				await runner.query('UPDATE "note" SET "renoteCount" = "renoteCount" + 1 WHERE "id" = $1', [parent.id]);

				// 修復は、加算がコミットされるまでRenote先の行ロックを待つ
				const repair = service.repair(['note.renoteCount']);
				await setTimeout(500);
				await runner.commitTransaction();
				await repair;
			} finally {
				await runner.release();
			}

			expect(await renoteCountOf(parent)).toBe(2);
			expect((await mismatches())['note.renoteCount']).toBeUndefined();
		});
	});

	test('0以下のbatchSizeは受け付けない', async () => {
		await expect(service.check(['note.repliesCount'], { batchSize: 0 })).rejects.toThrow('batchSize');
		await expect(service.repair(['note.repliesCount'], { batchSize: -1 })).rejects.toThrow('batchSize');
	});

	test('カウンタは0未満にならない', async () => {
		const alice = await createUser({ host: null });
		const bob = await createUser({ host: null });
		const parent = await createNote({ renoteCount: 0 }, alice);
		const renote = await createNote({ renoteId: parent.id, renoteUserId: alice.id, text: null }, bob);

		await noteDeleteService.deleteMany(bob, [renote], { effects: { ...NO_NOTE_DELETE_EFFECTS, renoteCount: true, notesCount: true } });

		expect((await notesRepository.findOneByOrFail({ id: parent.id })).renoteCount).toBe(0);
		expect((await usersRepository.findOneByOrFail({ id: bob.id })).notesCount).toBe(0);
	});

	test('COUNTER_NAMESはすべてのカウンタを含む', () => {
		expect(COUNTER_NAMES).toHaveLength(6);
	});
});
