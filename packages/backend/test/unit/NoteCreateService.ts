/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test } from '@nestjs/testing';
import { afterEach, vi } from 'vitest';

import { CoreModule } from '@/core/CoreModule.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { MiNote } from '@/models/Note.js';
import { IPoll } from '@/models/Poll.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

describe('NoteCreateService', () => {
	let noteCreateService: NoteCreateService;

	beforeAll(async () => {
		const app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		}).compile();
		noteCreateService = app.get<NoteCreateService>(NoteCreateService);
	});

	describe('is-renote', () => {
		const base: MiNote = {
			id: 'some-note-id',
			replyId: null,
			reply: null,
			renoteId: null,
			renote: null,
			threadId: null,
			text: null,
			name: null,
			cw: null,
			userId: 'some-user-id',
			user: null,
			localOnly: false,
			reactionAcceptance: null,
			renoteCount: 0,
			repliesCount: 0,
			clippedCount: 0,
			pageCount: 0,
			reactions: {},
			visibility: 'public',
			uri: null,
			url: null,
			fileIds: [],
			attachedFileTypes: [],
			visibleUserIds: [],
			mentions: [],
			mentionedRemoteUsers: '',
			reactionAndUserPairCache: [],
			emojis: [],
			tags: [],
			hasPoll: false,
			userHost: null,
			replyUserId: null,
			replyUserHost: null,
			renoteUserId: null,
			renoteUserHost: null,
			updatedAt: null,
			updatedAtHistory: null,
			hasEvent: false,
			disableRightClick: false,
			deleteAt: null,
			searchableBy: 'public',
		};

		const poll: IPoll = {
			choices: ['kinoko', 'takenoko'],
			multiple: false,
			expiresAt: null,
		};

		const file: MiDriveFile = {
			id: 'some-file-id',
			userId: null,
			user: null,
			userHost: null,
			md5: '',
			name: '',
			type: '',
			size: 0,
			comment: null,
			blurhash: null,
			properties: {},
			storedInternal: false,
			url: '',
			thumbnailUrl: null,
			webpublicUrl: null,
			webpublicType: null,
			accessKey: null,
			thumbnailAccessKey: null,
			webpublicAccessKey: null,
			uri: null,
			src: null,
			folderId: null,
			folder: null,
			isSensitive: false,
			maybeSensitive: false,
			maybePorn: false,
			isLink: false,
			requestHeaders: null,
			requestIp: null,
		};

		test('note without renote should not be Renote', () => {
			const note = { renote: null };
			expect(noteCreateService['isRenote'](note)).toBe(false);
		});

		test('note with renote should be Renote and not be Quote', () => {
			const note = { renote: base };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(false);
		});

		test('note with renote and text should be Quote', () => {
			const note = { renote: base, text: 'some-text' };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and cw should be Quote', () => {
			const note = { renote: base, cw: 'some-cw' };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and reply should be Quote', () => {
			const note = { renote: base, reply: { ...base, id: 'another-note-id' } };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and poll should be Quote', () => {
			const note = { renote: base, poll };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and non-empty files should be Quote', () => {
			const note = { renote: base, files: [file] };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});
	});

	describe('specified visibility pure renote', () => {
		const user = {
			id: 'some-user-id',
			username: 'alice',
			host: null,
			isBot: false,
			isCat: false,
			isIndexable: false,
			isSensitive: false,
		};

		const renoteTarget = {
			id: 'renote-target-id',
			userId: 'another-user-id',
			userHost: null,
			visibility: 'public',
			localOnly: false,
		} as MiNote;

		const visibleUser = { id: 'visible-user-id', username: 'bob', host: null, uri: null };

		function stubInsert() {
			// DBへの書き込みと後処理は止め、作成処理が insert まで到達したかだけを見る
			const target = noteCreateService as unknown as {
				insertNote: () => Promise<MiNote>;
				postNoteCreated: () => Promise<void>;
			};
			const insertNote = vi.spyOn(target, 'insertNote').mockImplementation(async () => ({ id: 'created-note-id' }) as MiNote);
			const postNoteCreated = vi.spyOn(target, 'postNoteCreated').mockImplementation(async () => {});
			return { insertNote, postNoteCreated };
		}

		// 後処理は setImmediate 経由で呼ばれるので、モックを戻す前に走らせておく
		const flushPostCreated = () => new Promise(resolve => setImmediate(resolve));

		afterEach(async () => {
			await flushPostCreated();
			vi.restoreAllMocks();
		});

		test('pure renote with specified visibility should be rejected', async () => {
			const { insertNote } = stubInsert();

			const err = await noteCreateService.create(user, {
				renote: renoteTarget,
				visibility: 'specified',
				visibleUsers: [visibleUser],
			}).catch(e => e);

			expect(err).toBeInstanceOf(IdentifiableError);
			expect((err as IdentifiableError).id).toBe('a093350c-a7cf-4293-8dbd-497fb1426e74');
			expect(insertNote).not.toHaveBeenCalled();
		});

		test('quote with specified visibility should be allowed', async () => {
			const { insertNote, postNoteCreated } = stubInsert();

			await noteCreateService.create(user, {
				renote: renoteTarget,
				text: 'quote text',
				visibility: 'specified',
				visibleUsers: [visibleUser],
			});
			await flushPostCreated();

			expect(insertNote).toHaveBeenCalledOnce();
			expect(postNoteCreated).toHaveBeenCalledOnce();
		});

		test('pure renote with non-specified visibility should be allowed', async () => {
			const { insertNote, postNoteCreated } = stubInsert();

			await noteCreateService.create(user, {
				renote: renoteTarget,
				visibility: 'home',
			});
			await flushPostCreated();

			expect(insertNote).toHaveBeenCalledOnce();
			expect(postNoteCreated).toHaveBeenCalledOnce();
		});
	});
});
