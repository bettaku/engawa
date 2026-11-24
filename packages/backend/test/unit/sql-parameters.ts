/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * SQLに文字列として埋め込んでいた値をパラメータにした箇所（P2-8）の振る舞いを確かめる。
 * docs/rust-migration/db-schema.md を参照。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { ChatMessagesRepository, HashtagsRepository, MiNote, MiUser, NotesRepository, PollsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { IdService } from '@/core/IdService.js';
import { PollService } from '@/core/PollService.js';
import { HashtagService } from '@/core/HashtagService.js';
import { ChatService } from '@/core/ChatService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('SQL parameters', () => {
	let app: TestingModule;
	let idService: IdService;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let notesRepository: NotesRepository;
	let pollsRepository: PollsRepository;
	let hashtagsRepository: HashtagsRepository;
	let chatMessagesRepository: ChatMessagesRepository;

	async function createUser(host: string | null = null): Promise<MiUser> {
		const id = idService.gen();
		const un = secureRndstr(16);
		await usersRepository.insert({ id, username: un, usernameLower: un.toLowerCase(), host });
		await userProfilesRepository.insert({ userId: id });
		return await usersRepository.findOneByOrFail({ id });
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] }).compile();
		app.enableShutdownHooks();
		await app.init();
		idService = app.get(IdService);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		notesRepository = app.get(DI.notesRepository);
		pollsRepository = app.get(DI.pollsRepository);
		hashtagsRepository = app.get(DI.hashtagsRepository);
		chatMessagesRepository = app.get(DI.chatMessagesRepository);
	});

	afterAll(async () => {
		await app.close();
	});

	describe('PollService.vote', () => {
		test('選んだ選択肢の票数だけを1増やす', async () => {
			const author = await createUser();
			const voter1 = await createUser();
			const voter2 = await createUser();
			const noteId = idService.gen();
			// 配送はしない（localOnly）
			await notesRepository.insert({ id: noteId, userId: author.id, userHost: null, visibility: 'public', localOnly: true, text: 'poll', hasPoll: true });
			await pollsRepository.insert({ noteId, choices: ['a', 'b', 'c'], votes: [0, 0, 0], multiple: false, expiresAt: null, noteVisibility: 'public', userId: author.id, userHost: null });
			const note = await notesRepository.findOneByOrFail({ id: noteId }) as MiNote;

			await app.get(PollService).vote(voter1, note, 2);
			await app.get(PollService).vote(voter2, note, 2);

			expect((await pollsRepository.findOneByOrFail({ noteId })).votes).toEqual([0, 0, 2]);
		});
	});

	describe('HashtagService.updateHashtag', () => {
		async function waitForHashtag(name: string, predicate: (tag: Awaited<ReturnType<HashtagsRepository['findOneByOrFail']>>) => boolean) {
			const start = Date.now();
			for (;;) {
				const tag = await hashtagsRepository.findOneBy({ name });
				if (tag != null && predicate(tag)) return tag;
				if (Date.now() - start > 5000) throw new Error(`timed out: ${JSON.stringify(tag)}`);
				await new Promise(r => setTimeout(r, 20));
			}
		}

		test('ユーザーIDを配列に追加・削除する', async () => {
			const hashtagService = app.get(HashtagService);
			const name = `tag${secureRndstr(8).toLowerCase()}`;
			const local = await createUser();
			const remote = await createUser('remote.example.com');
			const other = await createUser();

			// 行を作る（新規作成はinsert）
			await hashtagService.updateHashtag(other, name, true);
			await waitForHashtag(name, () => true);

			// ここからは既存の行へのUPDATE（パラメータを使う経路）
			await hashtagService.updateHashtag(local, name, true);
			await hashtagService.updateHashtag(remote, name, true);
			let tag = await waitForHashtag(name, t => t.attachedUsersCount === 3);
			expect(tag.attachedUserIds).toEqual([other.id, local.id, remote.id]);
			expect(tag.attachedLocalUserIds).toEqual([other.id, local.id]);
			expect(tag.attachedRemoteUserIds).toEqual([remote.id]);

			await hashtagService.updateHashtag(local, name, true, false);
			tag = await waitForHashtag(name, t => t.attachedUsersCount === 2);
			expect(tag.attachedUserIds).toEqual([other.id, remote.id]);
			expect(tag.attachedLocalUserIds).toEqual([other.id]);
			expect(tag.attachedLocalUsersCount).toBe(1);

			await hashtagService.updateHashtag(local, name, false);
			tag = await waitForHashtag(name, t => t.mentionedUsersCount === 1);
			expect(tag.mentionedUserIds).toEqual([local.id]);
			expect(tag.mentionedLocalUserIds).toEqual([local.id]);
			expect(tag.mentionedRemoteUserIds).toEqual([]);
		});
	});

	describe('ChatService.react / unreact', () => {
		test('リアクションを「ユーザーID/リアクション」として追加・削除する', async () => {
			const chatService = app.get(ChatService);
			const from = await createUser();
			const to = await createUser();
			const messageId = idService.gen();
			await chatMessagesRepository.insert({ id: messageId, fromUserId: from.id, toUserId: to.id, toRoomId: null, text: 'hi', reads: [], reactions: [] });

			await chatService.react(messageId, to.id, '👍');
			expect((await chatMessagesRepository.findOneByOrFail({ id: messageId })).reactions).toEqual([`${to.id}/👍`]);

			await chatService.unreact(messageId, to.id, '👍');
			expect((await chatMessagesRepository.findOneByOrFail({ id: messageId })).reactions).toEqual([]);
		});
	});
});
