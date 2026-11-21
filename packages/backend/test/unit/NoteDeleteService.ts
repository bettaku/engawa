/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { MiNote, MiUser, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { ALL_NOTE_DELETE_EFFECTS, NO_NOTE_DELETE_EFFECTS, NoteDeleteService } from '@/core/NoteDeleteService.js';
import type { NoteDeleteEffects } from '@/core/NoteDeleteService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SearchService } from '@/core/SearchService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { MockInstance } from 'vitest';

describe('NoteDeleteService', () => {
	let app: TestingModule;
	let service: NoteDeleteService;
	let idService: IdService;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;

	let publishNoteStream: MockInstance<GlobalEventService['publishNoteStream']>;
	let deliverToFollowers: MockInstance<ApDeliverManagerService['deliverToFollowers']>;
	let requestSyncNoteIndex: MockInstance<SearchService['requestSyncNoteIndex']>;

	// Local users
	let alice: MiUser;
	let carol: MiUser;
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

	function deletedEventsOf(note: Pick<MiNote, 'id'>) {
		return publishNoteStream.mock.calls.filter(([n, type]) => n.id === note.id && type === 'deleted');
	}

	async function exists(note: Pick<MiNote, 'id'>) {
		return await notesRepository.existsBy({ id: note.id });
	}

	async function repliesCountOf(note: MiNote) {
		return (await notesRepository.findOneByOrFail({ id: note.id })).repliesCount;
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

		service = app.get(NoteDeleteService);
		idService = app.get(IdService);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);

		alice = await createUser({ host: null });
		carol = await createUser({ host: null });
		bob = await createUser({ host: 'remote.example.com', uri: 'https://remote.example.com/users/bob', inbox: 'https://remote.example.com/inbox' });

		app.enableShutdownHooks();
	});

	beforeEach(() => {
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

		const searchService = app.get(SearchService);
		void searchService.requestSyncNoteIndex;
		requestSyncNoteIndex = vi.spyOn(searchService, 'requestSyncNoteIndex').mockResolvedValue(undefined);
	});

	afterEach(async () => {
		await notesRepository.createQueryBuilder().delete().execute();
	});

	afterAll(async () => {
		await usersRepository.delete({ id: alice.id });
		await usersRepository.delete({ id: carol.id });
		await usersRepository.delete({ id: bob.id });
		await app.close();
	});

	describe('delete', () => {
		test('行を削除し、副作用を実行する', async () => {
			const parent = await createNote({ repliesCount: 1 }, carol);
			const note = await createNote({ replyId: parent.id, replyUserId: carol.id }, alice);

			await service.delete(alice, note);

			expect(await exists(note)).toBe(false);
			expect(deletedEventsOf(note)).toHaveLength(1);
			expect(deliverToFollowers).toHaveBeenCalledTimes(1);
			expect(requestSyncNoteIndex).toHaveBeenCalledTimes(1);
			expect(await repliesCountOf(parent)).toBe(0);
		});

		test('同じノートを同時に削除しても、副作用は1回だけ実行する', async () => {
			const parent = await createNote({ repliesCount: 1 }, carol);
			const note = await createNote({ replyId: parent.id, replyUserId: carol.id }, alice);

			await Promise.all([
				service.delete(alice, note),
				service.delete(alice, note),
			]);

			expect(await exists(note)).toBe(false);
			expect(deletedEventsOf(note)).toHaveLength(1);
			expect(deliverToFollowers).toHaveBeenCalledTimes(1);
			expect(await repliesCountOf(parent)).toBe(0);
		});

		test('すでに削除されたノートでは、副作用を実行しない', async () => {
			const parent = await createNote({ repliesCount: 0 }, carol);
			const note = await createNote({ replyId: parent.id, replyUserId: carol.id }, alice);
			await notesRepository.delete({ id: note.id });

			await service.delete(alice, note);

			expect(deletedEventsOf(note)).toHaveLength(0);
			expect(deliverToFollowers).not.toHaveBeenCalled();
			expect(requestSyncNoteIndex).not.toHaveBeenCalled();
			expect(await repliesCountOf(parent)).toBe(0);
		});

		test('quietでは、返信数と検索索引だけを更新する', async () => {
			const parent = await createNote({ repliesCount: 1 }, carol);
			const note = await createNote({ replyId: parent.id, replyUserId: carol.id }, alice);

			await service.delete(alice, note, true);

			expect(await exists(note)).toBe(false);
			expect(deletedEventsOf(note)).toHaveLength(0);
			expect(deliverToFollowers).not.toHaveBeenCalled();
			expect(requestSyncNoteIndex).toHaveBeenCalledTimes(1);
			expect(await repliesCountOf(parent)).toBe(0);
		});
	});

	describe('deleteMany', () => {
		test('指定した副作用だけを、削除したノートごとに実行する', async () => {
			const parent = await createNote({ repliesCount: 2 }, carol);
			const notes = [
				await createNote({ replyId: parent.id, replyUserId: carol.id }, alice),
				await createNote({ replyId: parent.id, replyUserId: carol.id }, alice),
			];
			const effects: NoteDeleteEffects = { ...NO_NOTE_DELETE_EFFECTS, repliesCount: true, unindex: true };

			const deleted = await service.deleteMany(alice, notes, { effects });

			expect(deleted.map(n => n.id).sort()).toEqual(notes.map(n => n.id).sort());
			for (const note of notes) {
				expect(await exists(note)).toBe(false);
				expect(deletedEventsOf(note)).toHaveLength(0);
			}
			expect(deliverToFollowers).not.toHaveBeenCalled();
			expect(requestSyncNoteIndex).toHaveBeenCalledTimes(2);
			expect(await repliesCountOf(parent)).toBe(0);
		});

		test('すべての副作用を指定すると、ノートごとに配送する', async () => {
			const notes = [await createNote({}, alice), await createNote({}, alice)];

			await service.deleteMany(alice, notes, { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(deliverToFollowers).toHaveBeenCalledTimes(2);
			for (const note of notes) {
				expect(deletedEventsOf(note)).toHaveLength(1);
			}
		});

		test('ローカル限定のノートは配送しない', async () => {
			const note = await createNote({ localOnly: true }, alice);

			await service.deleteMany(alice, [note], { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(await exists(note)).toBe(false);
			expect(deliverToFollowers).not.toHaveBeenCalled();
		});

		test('リモートのノートは配送しない', async () => {
			const note = await createNote({}, bob);

			await service.deleteMany(bob, [note], { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(await exists(note)).toBe(false);
			expect(deletedEventsOf(note)).toHaveLength(1);
			expect(deliverToFollowers).not.toHaveBeenCalled();
		});

		test('指定した投稿者のものでないノートは削除しない', async () => {
			const own = await createNote({}, alice);
			const others = await createNote({}, carol);

			const deleted = await service.deleteMany(alice, [own, others], { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(deleted.map(n => n.id)).toEqual([own.id]);
			expect(await exists(own)).toBe(false);
			expect(await exists(others)).toBe(true);
			expect(deletedEventsOf(others)).toHaveLength(0);
		});

		test('投稿者を指定しないときは、副作用なしで行だけを削除する', async () => {
			const notes = [await createNote({}, alice), await createNote({}, bob)];

			const deleted = await service.deleteMany(null, notes.map(n => ({ id: n.id })), { effects: NO_NOTE_DELETE_EFFECTS });

			expect(deleted).toHaveLength(2);
			for (const note of notes) {
				expect(await exists(note)).toBe(false);
			}
			expect(publishNoteStream).not.toHaveBeenCalled();
			expect(requestSyncNoteIndex).not.toHaveBeenCalled();
		});

		test('投稿者を指定せずに副作用を指定すると、何も削除せずに失敗する', async () => {
			const note = await createNote({}, alice);

			await expect(service.deleteMany(null, [{ id: note.id }], { effects: ALL_NOTE_DELETE_EFFECTS as never }))
				.rejects.toThrow();
			expect(await exists(note)).toBe(true);
		});

		test('同じノートが重複して渡されても、副作用は1回だけ実行する', async () => {
			const parent = await createNote({ repliesCount: 1 }, carol);
			const note = await createNote({ replyId: parent.id, replyUserId: carol.id }, alice);

			const deleted = await service.deleteMany(alice, [note, note], { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(deleted).toHaveLength(1);
			expect(deletedEventsOf(note)).toHaveLength(1);
			expect(deliverToFollowers).toHaveBeenCalledTimes(1);
			expect(await repliesCountOf(parent)).toBe(0);
		});

		test('1件の副作用が失敗しても、他のノートの副作用は実行する', async () => {
			const failing = await createNote({}, alice);
			const other = await createNote({}, alice);
			publishNoteStream.mockImplementation((n) => {
				if (n.id === failing.id) throw new Error('boom');
			});

			const deleted = await service.deleteMany(alice, [failing, other], { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(deleted).toHaveLength(2);
			expect(await exists(failing)).toBe(false);
			expect(await exists(other)).toBe(false);
			expect(deletedEventsOf(other)).toHaveLength(1);
			// 失敗したノートでも、ストリーム以外の副作用は実行する
			expect(requestSyncNoteIndex.mock.calls.map(([id]) => id).sort()).toEqual([failing.id, other.id].sort());
		});

		test('配送が失敗しても、同じノートの残りの副作用は実行する', async () => {
			const parent = await createNote({ repliesCount: 1 }, carol);
			const note = await createNote({ replyId: parent.id, replyUserId: carol.id }, alice);
			deliverToFollowers.mockImplementation(() => {
				throw new Error('boom');
			});

			const deleted = await service.deleteMany(alice, [note], { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(deleted).toHaveLength(1);
			expect(deletedEventsOf(note)).toHaveLength(1);
			expect(requestSyncNoteIndex).toHaveBeenCalledTimes(1);
			expect(await repliesCountOf(parent)).toBe(0);
		});

		test('公開範囲がspecifiedの純粋なRenoteは、配送せずに他の副作用を実行する', async () => {
			const target = await createNote({}, carol);
			const renote = await createNote({ text: null, renoteId: target.id, renoteUserId: carol.id, visibility: 'specified' }, alice);

			const deleted = await service.deleteMany(alice, [renote], { effects: ALL_NOTE_DELETE_EFFECTS });

			expect(deleted).toHaveLength(1);
			expect(deliverToFollowers).not.toHaveBeenCalled();
			expect(deletedEventsOf(renote)).toHaveLength(1);
			expect(requestSyncNoteIndex).toHaveBeenCalledTimes(1);
		});

		test('空の配列では何もしない', async () => {
			expect(await service.deleteMany(alice, [], { effects: ALL_NOTE_DELETE_EFFECTS })).toEqual([]);
		});
	});
});
