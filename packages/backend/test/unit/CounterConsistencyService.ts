/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import type { ClipNotesRepository, ClipsRepository, FollowingsRepository, MiNote, MiUser, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { COUNTER_NAMES, CounterConsistencyService } from '@/core/CounterConsistencyService.js';
import { NO_NOTE_DELETE_EFFECTS, NoteDeleteService } from '@/core/NoteDeleteService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('CounterConsistencyService', () => {
	let app: TestingModule;
	let service: CounterConsistencyService;
	let noteDeleteService: NoteDeleteService;
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
		// 他のテストが残したデータの影響を受けないように、空のDBから始める
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
		await noteDeleteService.deleteMany(bob, [reply, renote, quote], { effects });
		await noteDeleteService.deleteMany(alice, [selfRenote], { effects });
		await noteDeleteService.deleteMany(bot, [botRenote], { effects });

		expect(await mismatches()).toEqual({});
		const after = await notesRepository.findOneByOrFail({ id: parent.id });
		expect(after.repliesCount).toBe(0);
		expect(after.renoteCount).toBe(0);
		expect((await usersRepository.findOneByOrFail({ id: bob.id })).notesCount).toBe(0);
		expect((await usersRepository.findOneByOrFail({ id: alice.id })).notesCount).toBe(1);
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
