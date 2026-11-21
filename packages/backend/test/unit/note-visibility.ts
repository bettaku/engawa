/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * ノートの公開範囲の判定（pre-rust-tech-debt.md P2-7）を、判定表 test/fixtures/note-visibility.json で全系統について試験する。
 * 判定表の説明と、系統ごとの既知の差は docs/rust-migration/note-visibility.md にある。
 */

import { readFileSync } from 'node:fs';
import { Test, TestingModule } from '@nestjs/testing';
import type { MiNote, MiUser, NotesRepository, UsersRepository, UserProfilesRepository, FollowingsRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { CacheService } from '@/core/CacheService.js';
import Channel from '@/server/api/stream/channel.js';
import type Connection from '@/server/api/stream/Connection.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

type Visibility = MiNote['visibility'];
type Relation = 'anonymous' | 'author' | 'follower' | 'stranger' | 'recipient' | 'mentioned' | 'replyTarget';
type Expected = boolean | 'undecided' | null;

const table = JSON.parse(readFileSync(new URL('../fixtures/note-visibility.json', import.meta.url), 'utf-8')) as {
	visibilities: Visibility[];
	relations: Record<Relation, string>;
	visibility: Record<Visibility, Record<Relation, Expected>>;
};

const relations = Object.keys(table.relations) as Relation[];

/**
 * 系統ごとの、判定表との既知の差。キーは`<visibility>/<relation>`、値はその系統の現在の結果。
 * 差は docs/rust-migration/note-visibility.md の「既知の差」に理由を書いている。
 * 差を直したら、ここから消す（消さないと、このテストが失敗する）。
 */
const knownDeviations: Record<string, Partial<Record<string, boolean>>> = {
	'specified/mentioned': { query: true },
	'private/mentioned': { query: true, isVisibleForMe: false, streaming: true, isCurrentlyVisibleForMe: false, packed: false },
	'private/anonymous': { streaming: true },
	'private/follower': { streaming: true },
	'private/stranger': { streaming: true },
	'private/replyTarget': { streaming: true },
};

/** 判定する系統 */
type System = {
	name: string;
	/** 投稿者の設定を見るか（見ない系統は、公開範囲だけで判定する） */
	appliesAuthorFlags: boolean;
	check: (note: MiNote, viewer: MiUser | null) => Promise<boolean>;
};

describe('ノートの公開範囲の判定表', () => {
	let app: TestingModule;
	let idService: IdService;
	let queryService: QueryService;
	let noteEntityService: NoteEntityService;
	let cacheService: CacheService;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let followingsRepository: FollowingsRepository;

	const viewers = {} as Record<Exclude<Relation, 'anonymous'>, MiUser>;
	let author: MiUser;

	async function createUser(data: Partial<MiUser> = {}): Promise<MiUser> {
		const id = idService.gen();
		const username = secureRndstr(16);
		await usersRepository.insert({ id, username, usernameLower: username.toLowerCase(), host: null, ...data });
		await userProfilesRepository.insert({ userId: id });
		return await usersRepository.findOneByOrFail({ id });
	}

	async function createNote(visibility: Visibility, user: MiUser, createdAt?: Date): Promise<MiNote> {
		const replyTo = await notesRepository.insert({
			id: idService.gen(),
			userId: viewers.replyTarget.id,
			userHost: null,
			visibility: 'public',
			text: 'reply target',
		}).then(x => x.identifiers[0].id as string);

		const id = idService.gen(createdAt?.getTime());
		await notesRepository.insert({
			id,
			userId: user.id,
			userHost: user.host,
			visibility,
			text: `${visibility} note`,
			replyId: replyTo,
			replyUserId: viewers.replyTarget.id,
			replyUserHost: null,
			mentions: [viewers.mentioned.id],
			visibleUserIds: visibility === 'specified' ? [viewers.recipient.id] : [],
			localOnly: visibility === 'private',
		});
		return await notesRepository.findOneByOrFail({ id });
	}

	function fakeConnection(viewer: MiUser | null, following: Record<string, { withReplies: boolean }>): Connection {
		return {
			user: viewer,
			following,
		} as unknown as Connection;
	}

	class TestChannel extends Channel {
		public readonly chName = 'test';
		public init(): void {
			// 判定だけを使うので、購読しない
		}
		public check(note: Packed<'Note'>): boolean {
			return this.isNoteVisibleForMe(note);
		}
	}

	async function followingOf(viewer: MiUser | null): Promise<Record<string, { withReplies: boolean }>> {
		if (viewer == null) return {};
		const followings = await followingsRepository.findBy({ followerId: viewer.id });
		return Object.fromEntries(followings.map(f => [f.followeeId, { withReplies: f.withReplies }]));
	}

	const systems: System[] = [
		{
			// タイムライン・検索（SQL）などの一覧
			name: 'query',
			appliesAuthorFlags: false,
			check: async (note, viewer) => {
				const q = notesRepository.createQueryBuilder('note').where('note.id = :noteId', { noteId: note.id });
				queryService.generateVisibilityQuery(q, viewer);
				return await q.getExists();
			},
		},
		{
			name: 'isVisibleForMe',
			appliesAuthorFlags: false,
			check: async (note, viewer) => await noteEntityService.isVisibleForMe(note, viewer?.id ?? null),
		},
		{
			// Streamingのチャンネル（配信されたノートは、閲覧者を指定せずにpackしたもの）
			name: 'streaming',
			appliesAuthorFlags: false,
			check: async (note, viewer) => {
				const packed = await noteEntityService.pack(note, null, { skipHide: true });
				const channel = new TestChannel({ id: 'test', connection: fakeConnection(viewer, await followingOf(viewer)) });
				return channel.check(packed);
			},
		},
		{
			// ノートの内容や、ノートに紐づく情報を返す前の認可
			name: 'isCurrentlyVisibleForMe',
			appliesAuthorFlags: true,
			check: async (note, viewer) => await noteEntityService.isCurrentlyVisibleForMe(note, viewer?.id ?? null),
		},
		{
			// packしたノートの内容を見せるか（shouldHideNote）
			name: 'packed',
			appliesAuthorFlags: true,
			check: async (note, viewer) => {
				const packed = await noteEntityService.pack(note, null, { skipHide: true });
				return !(await noteEntityService.shouldHideNote(packed, viewer?.id ?? null));
			},
		},
	];

	function viewerOf(relation: Relation): MiUser | null {
		if (relation === 'anonymous') return null;
		if (relation === 'author') return author;
		return viewers[relation];
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		}).compile();
		await app.init();

		idService = app.get(IdService);
		queryService = app.get(QueryService);
		noteEntityService = app.get(NoteEntityService);
		cacheService = app.get(CacheService);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		followingsRepository = app.get(DI.followingsRepository);

		author = await createUser();
		for (const relation of relations) {
			if (relation === 'anonymous' || relation === 'author') continue;
			viewers[relation] = await createUser();
		}
		await followingsRepository.insert({
			id: idService.gen(),
			followerId: viewers.follower.id,
			followeeId: author.id,
			followerHost: null,
			followeeHost: null,
		});
	});

	afterAll(async () => {
		await app.close();
	});

	afterEach(async () => {
		await usersRepository.update(author.id, { requireSigninToViewContents: false, makeNotesHiddenBefore: null, makeNotesFollowersOnlyBefore: null });
		await cacheService.userByIdCache.delete(author.id);
	});

	/** 判定表の値と既知の差から、その系統で期待する結果を決める。nullなら試験しない */
	function expectedFor(system: string, visibility: Visibility, relation: Relation): boolean | null {
		const deviation = knownDeviations[`${visibility}/${relation}`]?.[system];
		if (deviation !== undefined) return deviation;
		const expected = table.visibility[visibility][relation];
		if (expected === null || expected === 'undecided') return null;
		return expected;
	}

	describe('公開範囲', () => {
		for (const visibility of table.visibilities) {
			for (const relation of relations) {
				if (table.visibility[visibility][relation] === null) continue;

				test(`${visibility} / ${relation}`, async () => {
					const note = await createNote(visibility, author);
					const viewer = viewerOf(relation);

					const actual: Record<string, boolean> = {};
					const expected: Record<string, boolean> = {};
					for (const system of systems) {
						const e = expectedFor(system.name, visibility, relation);
						if (e === null) continue;
						expected[system.name] = e;
						actual[system.name] = await system.check(note, viewer);
					}
					expect(actual).toEqual(expected);
				});
			}
		}
	});

	describe('投稿者の設定', () => {
		const flagSystems = () => systems.filter(s => s.appliesAuthorFlags);

		test('requireSigninToViewContents: ログインしていない閲覧者には見せない', async () => {
			await usersRepository.update(author.id, { requireSigninToViewContents: true });
			for (const visibility of ['public', 'home'] as const) {
				const note = await createNote(visibility, author);
				for (const system of flagSystems()) {
					expect({ system: system.name, visibility, anonymous: await system.check(note, null) })
						.toEqual({ system: system.name, visibility, anonymous: false });
					expect({ system: system.name, visibility, stranger: await system.check(note, viewers.stranger) })
						.toEqual({ system: system.name, visibility, stranger: true });
				}
			}
		});

		test('makeNotesHiddenBefore: 該当するノートは投稿者以外に見せない', async () => {
			const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
			await usersRepository.update(author.id, { makeNotesHiddenBefore: -60 * 60 });
			const note = await createNote('public', author, old);
			const recent = await createNote('public', author);
			for (const system of flagSystems()) {
				for (const relation of ['anonymous', 'follower', 'stranger'] as const) {
					expect({ system: system.name, relation, old: await system.check(note, viewerOf(relation)) })
						.toEqual({ system: system.name, relation, old: false });
					expect({ system: system.name, relation, recent: await system.check(recent, viewerOf(relation)) })
						.toEqual({ system: system.name, relation, recent: true });
				}
				expect({ system: system.name, author: await system.check(note, author) })
					.toEqual({ system: system.name, author: true });
			}
		});

		test('makeNotesFollowersOnlyBefore: 該当するpublic・homeのノートはfollowersとして扱う', async () => {
			const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
			await usersRepository.update(author.id, { makeNotesFollowersOnlyBefore: -60 * 60 });
			for (const visibility of ['public', 'home'] as const) {
				const note = await createNote(visibility, author, old);
				// Streamingは投稿者の設定を見ないが、配信するノートのpackでこの設定によりfollowersに変わるので、対象に含める
				for (const system of systems.filter(s => s.appliesAuthorFlags || s.name === 'streaming')) {
					for (const relation of ['anonymous', 'follower', 'stranger', 'mentioned'] as const) {
						const expected = expectedFor(system.name, 'followers', relation);
						expect({ system: system.name, visibility, relation, visible: await system.check(note, viewerOf(relation)) })
							.toEqual({ system: system.name, visibility, relation, visible: expected });
					}
				}
			}
		});
	});

	test('isVisibleForMe: replyUserIdがない古いノートでも、読み込んだreplyから返信先の投稿者を判定する', async () => {
		const note = await createNote('followers', author);
		const reply = await notesRepository.findOneByOrFail({ id: note.replyId ?? '' });
		const legacy = { ...note, replyUserId: null, mentions: [], reply } as MiNote;

		expect(await noteEntityService.isVisibleForMe(legacy, viewers.replyTarget.id)).toBe(true);
		expect(await noteEntityService.isVisibleForMe(legacy, viewers.stranger.id)).toBe(false);
		expect(await noteEntityService.isVisibleForMe({ ...legacy, reply: null } as MiNote, viewers.replyTarget.id)).toBe(false);
	});

	test('既知の差は、判定表と異なるものだけを書く', () => {
		for (const [key, deviations] of Object.entries(knownDeviations)) {
			const [visibility, relation] = key.split('/') as [Visibility, Relation];
			const expected = table.visibility[visibility][relation];
			for (const [system, value] of Object.entries(deviations)) {
				expect({ key, system, sameAsTable: value === expected }).toEqual({ key, system, sameAsTable: false });
			}
		}
	});
});
