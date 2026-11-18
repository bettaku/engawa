/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { errors } from '@elastic/elasticsearch';
import type { MiNote, MiUser, NotesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { loadConfig } from '@/config.js';
import { IdService } from '@/core/IdService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { SearchService } from '@/core/SearchService.js';
import { QueueService } from '@/core/QueueService.js';
import { AppLockService } from '@/core/AppLockService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

function responseError(statusCode: number) {
	return new errors.ResponseError({
		body: {},
		statusCode,
		headers: {},
		warnings: null,
		meta: {} as never,
	});
}

/**
 * Elasticsearchの外部バージョン（`version_type=external`）の振る舞いを再現する。
 * - 書き込みのバージョンが現在のバージョン以下なら409で拒否する
 * - 削除はtombstoneとしてバージョンを残す
 */
class FakeElasticsearch {
	public docs = new Map<string, { version: number; document: Record<string, unknown> | null }>();

	public indices = {
		exists: async () => true,
		create: async () => ({}),
		delete: async () => {
			this.docs.clear();
			return {};
		},
	};

	public async index({ id, version, version_type, document }: { id: string; version: number; version_type: string; document: Record<string, unknown> }) {
		expect(version_type).toBe('external');
		const current = this.docs.get(id);
		if (current && version <= current.version) throw responseError(409);
		this.docs.set(id, { version, document });
		return {};
	}

	public async delete({ id, version, version_type }: { id: string; version: number; version_type: string }) {
		expect(version_type).toBe('external');
		const current = this.docs.get(id);
		if (current && version <= current.version) throw responseError(409);
		this.docs.set(id, { version, document: null });
		if (current?.document == null) throw responseError(404);
		return {};
	}

	public async bulk({ operations }: { operations: Record<string, any>[] }) {
		const items = [];
		for (let i = 0; i < operations.length; i += 2) {
			const { _id, version, version_type } = operations[i].index;
			try {
				await this.index({ id: _id, version, version_type, document: operations[i + 1] });
				items.push({ index: { _id, status: 201 } });
			} catch {
				items.push({ index: { _id, status: 409, error: { type: 'version_conflict_engine_exception' } } });
			}
		}
		return { errors: items.some(x => x.index.status !== 201), items };
	}

	public indexed(id: string) {
		return this.docs.get(id)?.document ?? null;
	}
}

describe('SearchService (Elasticsearch)', () => {
	let app: TestingModule;
	let service: SearchService;
	let idService: IdService;
	let notesRepository: NotesRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let es: FakeElasticsearch;

	let alice: MiUser;
	let notIndexable: MiUser;
	let remote: MiUser;

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
		return await usersRepository.findOneByOrFail({ id });
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

	/** DBを読んだ直後で止める。返り値の`resume`を呼ぶと書き込みに進む */
	function pauseAfterRead() {
		void (service as any).readNoteForIndex;
		const original = (service as any).readNoteForIndex;
		let resume!: () => void;
		const resumed = new Promise<void>(r => resume = r);
		let read!: () => void;
		const readDone = new Promise<void>(r => read = r);
		vi.spyOn(service as any, 'readNoteForIndex').mockImplementationOnce(async (...args: unknown[]) => {
			const result = await original(...args);
			read();
			await resumed;
			return result;
		});
		return { readDone, resume };
	}

	beforeAll(async () => {
		const config = loadConfig();
		es = new FakeElasticsearch();

		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
			})
			.overrideProvider(DI.config)
			.useValue({
				...config,
				fulltextSearch: { provider: 'elasticsearch' },
				elasticsearch: { host: 'localhost', port: 9200, user: '', pass: '', index: 'test', scope: 'local' },
			})
			.overrideProvider(DI.elasticsearch)
			.useValue(es)
			.compile();

		service = app.get(SearchService);
		idService = app.get(IdService);
		notesRepository = app.get(DI.notesRepository);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);

		alice = await createUser({ host: null, isIndexable: true });
		notIndexable = await createUser({ host: null, isIndexable: false });
		remote = await createUser({ host: 'remote.example.com', isIndexable: true });

		app.enableShutdownHooks();
	});

	afterEach(async () => {
		await notesRepository.createQueryBuilder().delete().execute();
		es.docs.clear();
	});

	afterAll(async () => {
		await usersRepository.delete({ id: alice.id });
		await usersRepository.delete({ id: notIndexable.id });
		await usersRepository.delete({ id: remote.id });
		await app.close();
	});

	test('索引の対象のノートを登録する', async () => {
		const note = await createNote({ text: 'hello', cw: 'cw' }, alice);
		await service.syncNoteIndex(note.id);

		expect(es.indexed(note.id)).toMatchObject({ text: 'hello', cw: 'cw', userId: alice.id, visibility: 'public', isBot: false });
	});

	test('索引の対象外のノートは登録しない', async () => {
		const followers = await createNote({ visibility: 'followers' }, alice);
		const noText = await createNote({ text: null }, alice);
		const ofNotIndexable = await createNote({}, notIndexable);
		const ofRemote = await createNote({}, remote);

		for (const note of [followers, noText, ofNotIndexable, ofRemote]) {
			await service.syncNoteIndex(note.id);
			expect(es.indexed(note.id)).toBeNull();
		}
	});

	test('空本文への編集で索引から削除する', async () => {
		const note = await createNote({}, alice);
		await service.syncNoteIndex(note.id);
		expect(es.indexed(note.id)).not.toBeNull();

		await notesRepository.update(note.id, { text: null, updatedAt: new Date() });
		await service.syncNoteIndex(note.id);

		expect(es.indexed(note.id)).toBeNull();
	});

	test('非公開化で索引から削除する', async () => {
		const note = await createNote({}, alice);
		await service.syncNoteIndex(note.id);

		await notesRepository.update(note.id, { visibility: 'followers', updatedAt: new Date() });
		await service.syncNoteIndex(note.id);

		expect(es.indexed(note.id)).toBeNull();
	});

	test('ユーザーの検索の許可を取り消すと、updatedAtが変わらなくても索引から削除する', async () => {
		const user = await createUser({ host: null, isIndexable: true });
		try {
			const note = await createNote({}, user);
			await service.syncNoteIndex(note.id);

			await usersRepository.update(user.id, { isIndexable: false });
			await service.syncNoteIndex(note.id);

			expect(es.indexed(note.id)).toBeNull();
		} finally {
			await usersRepository.delete({ id: user.id });
		}
	});

	test('削除したノートを索引から削除する', async () => {
		const note = await createNote({}, alice);
		await service.syncNoteIndex(note.id);

		await notesRepository.delete(note.id);
		await service.syncNoteIndex(note.id);

		expect(es.indexed(note.id)).toBeNull();
	});

	test('索引に入っていないノートの削除は成功する', async () => {
		await expect(service.syncNoteIndex(idService.gen())).resolves.toBeUndefined();
	});

	test('同時の編集では、最後に読んだ状態が残る', async () => {
		const note = await createNote({ text: 'v1' }, alice);
		await service.syncNoteIndex(note.id);

		await notesRepository.update(note.id, { text: 'v2', updatedAt: new Date() });
		const first = service.syncNoteIndex(note.id);
		await notesRepository.update(note.id, { text: 'v3', updatedAt: new Date() });
		const second = service.syncNoteIndex(note.id);
		await Promise.all([first, second]);

		expect(es.indexed(note.id)).toMatchObject({ text: 'v3' });
	});

	test('古い編集のジョブが削除のジョブより後に実行されても、削除済みのノートは復活しない', async () => {
		const note = await createNote({}, alice);
		await service.syncNoteIndex(note.id);

		await notesRepository.delete(note.id);
		await service.syncNoteIndex(note.id); // 削除のジョブ
		await service.syncNoteIndex(note.id); // 遅れて実行された編集のジョブ

		expect(es.indexed(note.id)).toBeNull();
	});

	test('DBを読んだ後にロックの期限が切れ、その間に削除のジョブが完了しても、古いジョブの書き込みは拒否される', async () => {
		const note = await createNote({ text: 'old' }, alice);

		// ロックの期限切れを再現するため、ロックを取らない
		const appLockService = app.get(AppLockService);
		void appLockService.getSearchIndexLock;
		vi.spyOn(appLockService, 'getSearchIndexLock').mockResolvedValue(() => {});

		const { readDone, resume } = pauseAfterRead();
		const stale = service.syncNoteIndex(note.id);
		await readDone;

		await notesRepository.delete(note.id);
		await service.syncNoteIndex(note.id);
		expect(es.indexed(note.id)).toBeNull();

		resume();
		await stale;

		expect(es.indexed(note.id)).toBeNull();
	});

	test('DBを読んだ後にロックの期限が切れ、その間に編集のジョブが完了しても、古い本文で上書きされない', async () => {
		const note = await createNote({ text: 'old' }, alice);

		const appLockService = app.get(AppLockService);
		void appLockService.getSearchIndexLock;
		vi.spyOn(appLockService, 'getSearchIndexLock').mockResolvedValue(() => {});

		const { readDone, resume } = pauseAfterRead();
		const stale = service.syncNoteIndex(note.id);
		await readDone;

		await notesRepository.update(note.id, { text: 'new', updatedAt: new Date() });
		await service.syncNoteIndex(note.id);

		resume();
		await stale;

		expect(es.indexed(note.id)).toMatchObject({ text: 'new' });
	});

	test('ロックで同じノートの処理を直列にする', async () => {
		const note = await createNote({ text: 'old' }, alice);

		const { readDone, resume } = pauseAfterRead();
		const first = service.syncNoteIndex(note.id);
		await readDone;

		await notesRepository.update(note.id, { text: 'new', updatedAt: new Date() });
		const second = service.syncNoteIndex(note.id);
		// 先のジョブがロックを持っている間は、後のジョブは書き込まない
		await new Promise(r => setTimeout(r, 300));
		expect(es.indexed(note.id)).toBeNull();

		resume();
		await Promise.all([first, second]);

		expect(es.indexed(note.id)).toMatchObject({ text: 'new' });
	});

	test('requestSyncNoteIndexはノートIDだけを持つジョブを登録する', async () => {
		const queueService = app.get(QueueService);
		void queueService.createSyncNoteIndexJob;
		const createJob = vi.spyOn(queueService, 'createSyncNoteIndexJob').mockResolvedValue(undefined as never);

		await service.requestSyncNoteIndex('note-id');

		expect(createJob).toHaveBeenCalledWith('note-id');
	});

	test('fullIndexNoteは索引の対象のノートだけを登録し、新しい状態を古い状態で上書きしない', async () => {
		const target = await createNote({ text: 'target' }, alice);
		const followers = await createNote({ visibility: 'followers' }, alice);
		const ofNotIndexable = await createNote({}, notIndexable);

		await service.fullIndexNote();

		expect(es.indexed(target.id)).toMatchObject({ text: 'target' });
		expect(es.indexed(followers.id)).toBeNull();
		expect(es.indexed(ofNotIndexable.id)).toBeNull();

		// 再索引の後に編集されたノートは、編集後の内容が残る
		await notesRepository.update(target.id, { text: 'edited', updatedAt: new Date() });
		await service.syncNoteIndex(target.id);
		expect(es.indexed(target.id)).toMatchObject({ text: 'edited' });
	});
});

describe('SearchService (SQL)', () => {
	let app: TestingModule;

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
			})
			.compile();
		app.enableShutdownHooks();
	});

	afterAll(async () => {
		await app.close();
	});

	test('外部の検索索引を使わない構成では、ジョブを登録しない', async () => {
		const service = app.get(SearchService);
		const queueService = app.get(QueueService);
		void queueService.createSyncNoteIndexJob;
		const createJob = vi.spyOn(queueService, 'createSyncNoteIndexJob');

		await service.requestSyncNoteIndex('note-id');
		await service.syncNoteIndex('note-id');

		expect(createJob).not.toHaveBeenCalled();
	});
});
