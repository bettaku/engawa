/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, In, type SelectQueryBuilder } from 'typeorm';
import { Client as ElasticSearch, errors } from '@elastic/elasticsearch';
import { DI } from '@/di-symbols.js';
import { type Config, FulltextSearchProvider } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { MiNote } from '@/models/Note.js';
import type { DriveFilesRepository, FollowingsRepository, NotesRepository, UsersRepository } from '@/models/_.js';
import { MiUser } from '@/models/_.js';
import { CacheService } from '@/core/CacheService.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { noteMapping, noteSettings } from '@/models/elasticsearch/note.js';
import { AppLockService } from '@/core/AppLockService.js';
import { QueueService } from '@/core/QueueService.js';
import type Logger from '@/logger.js';

function isVersionConflict(e: unknown): boolean {
	return e instanceof errors.ResponseError && e.statusCode === 409;
}

function isNotFound(e: unknown): boolean {
	return e instanceof errors.ResponseError && e.statusCode === 404;
}

export type SearchOpts = {
	userId?: MiNote['userId'] | null;
	host?: string | null;
	excludeBot?: boolean;
	excludeNsfw?: boolean;
	fileOption?: string | null;
};

export type SearchPagination = {
	untilId?: MiNote['id'];
	sinceId?: MiNote['id'];
	limit: number;
};

/** 索引に入れる公開範囲 */
const INDEXABLE_VISIBILITIES: readonly MiNote['visibility'][] = ['home', 'public'];

/**
 * 索引の世代として使う、DBの現在時刻（マイクロ秒）。
 *
 * ノートの読み出しと同じ文の中で評価するので、後から読んだジョブほど大きな値になる。
 * Elasticsearchの外部バージョンに使い、古い状態の書き込み（ロックの期限切れ後に再開したジョブなど）を拒否させる。
 * `updatedAt`ではなく読み出しの時刻を使うのは、ユーザーの`isIndexable`の変更や削除のように、
 * ノートの`updatedAt`が変わらない変化も、後から読んだ状態として反映させるため。
 */
const GENERATION_SQL = 'FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000000)::bigint';

type NoteIndexDocument = {
	text: string | null;
	cw: string | null;
	visibility: MiNote['visibility'];
	createdAt: number;
	userId: MiNote['userId'];
	userHost: MiNote['userHost'];
	tags: MiNote['tags'];
	replyId: MiNote['replyId'];
	renoteId: MiNote['renoteId'];
	fileIds: MiNote['fileIds'];
	isQuote: boolean;
	searchableBy: MiNote['searchableBy'];
	isBot: boolean;
};

@Injectable()
export class SearchService {
	private readonly elasticsearchIndexScope: 'local' | 'global' | string[] = 'local';
	private elasticsearchNoteIndex: string | null = null;

	private readonly provider: FulltextSearchProvider;
	private readonly logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.elasticsearch)
		private elasticsearch: ElasticSearch | null,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private cacheService: CacheService,
		private queryService: QueryService,
		private idService: IdService,
		private loggerService: LoggerService,
		private appLockService: AppLockService,
		private queueService: QueueService,
	) {
		this.logger = this.loggerService.getLogger('SearchService');

		if (elasticsearch) {
			this.elasticsearchNoteIndex = `${config.elasticsearch!.index}---notes`;
			const NoteIndex = this.elasticsearchNoteIndex;

			this.elasticsearch?.indices.exists({
				index: this.elasticsearchNoteIndex,
			}).then((indexExists) => {
				if (!indexExists) this.elasticsearch?.indices.create({
					index: NoteIndex,
					mappings: {
						properties: noteMapping.properties,
					},
					settings: noteSettings.settings,
				}).catch((e) => {
					console.error(e);
				});
			}).catch((e) => {
				this.logger.error('Failed to check the note index', { error: e });
			});
		}

		if (config.elasticsearch?.scope) {
			this.elasticsearchIndexScope = config.elasticsearch.scope;
		}

		this.provider = config.fulltextSearch?.provider ?? 'sqlLike';
		this.logger.info(`-- Provider: ${this.provider}`);
	}

	/** 外部の検索索引を使うかどうか */
	private get usesExternalIndex(): boolean {
		return this.provider === 'elasticsearch' && this.elasticsearch != null;
	}

	/**
	 * ノートの作成・編集・削除の後に呼ぶ。索引の更新はジョブ（`syncNoteIndex`）で行う。
	 *
	 * 呼び出し時点のノートの内容は使わず、ジョブの実行時点のDBの状態を索引に反映する。
	 * 外部の検索索引を使わない構成では何もしない。
	 */
	@bindThis
	public async requestSyncNoteIndex(noteId: MiNote['id']): Promise<void> {
		if (!this.usesExternalIndex) return;

		await this.queueService.createSyncNoteIndexJob(noteId);
	}

	/**
	 * ノートの索引を、実行時点のDBの状態に合わせる（`syncNoteIndex`ジョブの処理）。
	 *
	 * - ノートが存在し、索引の対象ならupsertする
	 * - ノートが存在しない、または対象外ならIDで削除する
	 *
	 * ノート単位のロックで同じノートの処理を直列にしたうえで、Elasticsearchの外部バージョンで古い書き込みを拒否させる。
	 * 同じノートのジョブが重なっても、後からDBを読んだジョブの内容が残る。
	 */
	@bindThis
	public async syncNoteIndex(noteId: MiNote['id']): Promise<void> {
		if (!this.usesExternalIndex) return;

		const unlock = await this.appLockService.getSearchIndexLock(noteId);
		try {
			const { note, generation } = await this.readNoteForIndex(noteId);

			if (note != null && this.isIndexTarget(note)) {
				await this.writeNoteDocument(note, generation);
			} else {
				await this.deleteNoteDocument(noteId, generation);
			}
		} finally {
			unlock();
		}
	}

	/**
	 * ノートとユーザーを読み、同じ文の中で世代を取る。
	 */
	@bindThis
	private async readNoteForIndex(noteId: MiNote['id']): Promise<{ note: MiNote | null; generation: number }> {
		const { entities, raw } = await this.notesRepository.createQueryBuilder('note')
			.innerJoinAndSelect('note.user', 'user')
			.addSelect(GENERATION_SQL, 'search_index_generation')
			.where('note.id = :noteId', { noteId })
			.getRawAndEntities<{ search_index_generation: string }>();

		if (entities.length > 0 && raw.length > 0) {
			return { note: entities[0], generation: Number(raw[0].search_index_generation) };
		}

		// ノートが存在しない。IDは再利用されないので、存在しないことを確認した後に取った世代でよい
		const rows: { generation: string }[] = await this.notesRepository.query(`SELECT ${GENERATION_SQL} AS generation`);
		return { note: null, generation: Number(rows[0].generation) };
	}

	/**
	 * 索引の対象かどうか。`note.user`を読み込んでおくこと。
	 */
	@bindThis
	public isIndexTarget(note: MiNote): boolean {
		if (note.text == null && note.cw == null) return false;
		if (!INDEXABLE_VISIBILITIES.includes(note.visibility)) return false;
		if (note.user == null || !note.user.isIndexable) return false;

		switch (this.elasticsearchIndexScope) {
			case 'global':
				return true;
			case 'local':
				return note.userHost == null;
			default:
				return note.userHost == null || this.elasticsearchIndexScope.includes(note.userHost);
		}
	}

	@bindThis
	private toDocument(note: MiNote): NoteIndexDocument {
		return {
			text: note.text,
			cw: note.cw,
			visibility: note.visibility,
			createdAt: this.idService.parse(note.id).date.getTime(),
			userId: note.userId,
			userHost: note.userHost,
			tags: note.tags,
			replyId: note.replyId,
			renoteId: note.renoteId,
			fileIds: note.fileIds,
			isQuote: isRenote(note) && isQuote(note),
			searchableBy: note.searchableBy,
			isBot: note.user?.isBot ?? false,
		};
	}

	@bindThis
	private async writeNoteDocument(note: MiNote, generation: number): Promise<void> {
		if (this.elasticsearch == null || this.elasticsearchNoteIndex == null) return;

		try {
			await this.elasticsearch.index({
				index: this.elasticsearchNoteIndex,
				id: note.id,
				version: generation,
				version_type: 'external',
				document: this.toDocument(note),
			});
		} catch (e) {
			// 後から読んだ状態がすでに書かれている。このジョブの内容は古いので捨てる
			if (isVersionConflict(e)) return;
			throw e;
		}
	}

	@bindThis
	private async deleteNoteDocument(noteId: MiNote['id'], generation: number): Promise<void> {
		if (this.elasticsearch == null || this.elasticsearchNoteIndex == null) return;

		try {
			await this.elasticsearch.delete({
				index: this.elasticsearchNoteIndex,
				id: noteId,
				version: generation,
				version_type: 'external',
			});
		} catch (e) {
			if (isVersionConflict(e)) return;
			// 索引に入っていなかった
			if (isNotFound(e)) return;
			throw e;
		}
	}

	/**
	 * すべてのノートを索引に登録し直す。索引の対象外のノートは登録しない。
	 */
	@bindThis
	public async fullIndexNote(): Promise<void> {
		if (this.elasticsearch == null || this.elasticsearchNoteIndex == null) return;

		const limit = 100;
		let latestId = '';
		while (true) {
			const { entities, raw } = await this.notesRepository.createQueryBuilder('note')
				.innerJoinAndSelect('note.user', 'user')
				.addSelect(GENERATION_SQL, 'search_index_generation')
				.where('note.id > :latestId', { latestId })
				.orderBy('note.id', 'ASC')
				.limit(limit)
				.getRawAndEntities<{ note_id: string; search_index_generation: string }>();

			if (entities.length === 0) break;
			latestId = entities[entities.length - 1].id;

			const generations = new Map(raw.map(r => [r.note_id, Number(r.search_index_generation)]));
			const operations = entities
				.filter(note => this.isIndexTarget(note) && generations.has(note.id))
				.flatMap(note => [
					{
						index: {
							_index: this.elasticsearchNoteIndex as string,
							_id: note.id,
							version: generations.get(note.id),
							version_type: 'external' as const,
						},
					},
					this.toDocument(note),
				]);
			if (operations.length === 0) continue;

			const res = await this.elasticsearch.bulk({ operations });
			if (res.errors) {
				const failed = res.items.filter(item => item.index?.error != null && item.index.status !== 409);
				if (failed.length > 0) {
					this.logger.warn(`Failed to index ${failed.length} notes`, { error: failed[0].index?.error });
				}
			}
		}
	}

	/**
	 * 索引を作り直す。修正前に索引へ入った削除済みのノートや対象外のノートも、これで取り除かれる。
	 */
	@bindThis
	public async reindexNote(): Promise<void> {
		if (!this.elasticsearch) return;
		await this.elasticsearch.indices.delete({
			index: this.elasticsearchNoteIndex as string,
		}).catch((e) => {
			console.error(e);
		});

		await this.elasticsearch.indices.create({
			index: this.elasticsearchNoteIndex as string,
			mappings: {
				properties: noteMapping.properties,
			},
			settings: noteSettings.settings,
		});

		await this.fullIndexNote().catch((e) => {
			console.error(e);
		});
	}

	@bindThis
	public async searchNote(q: string, me: MiUser | null, opts: SearchOpts, pagination: SearchPagination): Promise<MiNote[]> {
		switch (this.provider) {
			case 'sqlLike':
			case 'sqlPgroonga': {
				return this.searchNoteByLike(q, me, opts, pagination);
			}
			case 'elasticsearch': {
				return this.searchNoteByElasticSearch(q, me, opts, pagination);
			}
			default: {
				const typeCheck: never = this.provider;
				return [];
			}
		}
	}

	/**
	 * ノートの searchableBy（検索を許可する範囲）を満たすものだけに絞り込む
	 */
	@bindThis
	private generateSearchableByQuery(query: SelectQueryBuilder<MiNote>, me: MiUser | null): void {
		query.andWhere(new Brackets(qb => {
			qb.where('note."searchableBy" = \'public\'');
			if (me != null) {
				qb.orWhere(new Brackets(qb2 => {
					qb2.where('note."searchableBy" = \'followers\' AND (note."userId" IN (SELECT "followeeId" FROM following WHERE following."followerId" = :searchMeId) OR note."userId" = :searchMeId)')
						.orWhere('note."searchableBy" = \'limited\' AND note."userId" = :searchMeId')
						.orWhere('note."searchableBy" = \'reacted\' AND (note."userId" IN (SELECT "userId" FROM note_reaction) OR note."userId" = :searchMeId)');
				}));
			}
		}));

		if (me != null) query.setParameter('searchMeId', me.id);
	}

	@bindThis
	private async searchNoteByLike(q: string, me: MiUser | null, opts: SearchOpts, pagination: SearchPagination): Promise<MiNote[]> {
		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), pagination.sinceId, pagination.untilId);

		if (opts.userId) {
			query.andWhere('note.userId = :userId', { userId: opts.userId });
		}

		this.generateSearchableByQuery(query, me);

		query
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser');

		if (opts.host) {
			if (opts.host === '.') {
				query.andWhere('note.userHost IS NULL');
			} else {
				query.andWhere('note.userHost = :host', { host: opts.host });
			}
		}

		// 本文とCWの一致は必ず1つの括弧にまとめる。
		// 括弧なしの OR があると、公開範囲や検索許可の条件が一部の分岐にしか掛からなくなる。
		const likeQ = `%${sqlLikeEscape(q.toLowerCase())}%`;
		query.andWhere(new Brackets(qb => {
			if (this.provider === 'sqlPgroonga') {
				qb.where('note."text" &@~ :pgroongaQ', { pgroongaQ: q });
			} else {
				qb.where('LOWER(note."text") LIKE :likeQ', { likeQ });
			}
			if (!opts.excludeNsfw) {
				qb.orWhere('LOWER(note.cw) LIKE :likeQ', { likeQ });
			}
		}));

		if (opts.excludeBot) {
			query.innerJoin('note.user', 'user')
				.andWhere('user.isIndexable = TRUE')
				.andWhere('user.isBot = FALSE');
		} else {
			query.innerJoin('note.user', 'user')
				.andWhere('user.isIndexable = TRUE');
		}

		if (opts.excludeNsfw) {
			query.andWhere('note.cw IS NULL')
				.andWhere('NOT EXISTS (SELECT 1 FROM drive_file df WHERE df.id = ANY(note.fileIds) AND df.isSensitive = TRUE)');
		}

		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBaseNoteFilteringQuery(query, me);

		return query.limit(pagination.limit).getMany();
	}

	@bindThis
	private async searchNoteByElasticSearch(q: string, me: MiUser | null, opts: SearchOpts, pagination: SearchPagination): Promise<MiNote[]> {
		const filter: any = {
			bool: {
				must: [],
				must_not: [],
				should: [],
			},
		};

		if (pagination.untilId) filter.bool.must.push({
			range: {
				createdAt: {
					lt: this.idService.parse(pagination.untilId).date.getTime(),
				},
			},
		});

		if (pagination.sinceId) filter.bool.must.push({
			range: {
				createdAt: {
					gt: this.idService.parse(pagination.sinceId).date.getTime(),
				},
			},
		});

		if (opts.userId) filter.bool.must.push({
			term: {
				userId: opts.userId,
			},
		});

		if (opts.host) {
			if (opts.host === '.') {
				filter.bool.must_not.push({
					exists: {
						field: 'userHost',
					},
				});
			} else {
				filter.bool.must.push({
					term: {
						userHost: opts.host,
					},
				});
			}
		};

		if (opts.fileOption) {
			if (opts.fileOption === 'fileOnly') {
				filter.bool.must.push({
					exists: {
						field: 'fileIds',
					},
				});
			} else if (opts.fileOption === 'noFile') {
				filter.bool.must_not.push({
					exists: {
						field: 'fileIds',
					},
				});
			}
		}

		if (opts.excludeBot) {
			const botIds = await this.usersRepository.createQueryBuilder('user')
				.where('user."isBot" = TRUE')
				.select('user.id')
				.limit(1000)
				.getMany();

			filter.bool.must_not.push({
				terms: {
					userId: botIds.map(b => b.id),
				},
			});
		}

		if (q !== '') {
			const orQueries = q.split(',').map(q => q.trim());
			const shouldQueries = orQueries.filter(q => !q.startsWith('not:'));
			const sensitiveFileIds = await this.driveFilesRepository.createQueryBuilder('drive_file')
				.where('drive_file."isSensitive" = TRUE')
				.select('drive_file.id')
				.limit(1000)
				.getMany();

			if (opts.excludeNsfw) {
				filter.bool.must.push({
					bool: {
						should: shouldQueries.flatMap(q => [
							{ wildcard: { 'text': `*${q}*` } },
							{ simple_query_string: { fields: ['text'], 'query': q, default_operator: 'and' } },
						]),
						minimum_should_match: 1,
					},
				});
				filter.bool.must_not.push({
					terms: {
						fileIds: sensitiveFileIds.map(f => f.id),
					},
				});
			} else {
				filter.bool.must.push({
					bool: {
						should: shouldQueries.flatMap(q => [
							{ wildcard: { 'text': `*${q}*` } },
							{ simple_query_string: { fields: ['text'], 'query': q, default_operator: 'and' } },
							{ wildcard: { 'cw': `*${q}*` } },
							{ simple_query_string: { fields: ['cw'], 'query': q, default_operator: 'and' } },
						]),
						minimum_should_match: 1,
					},
				});
			}
		};

		const followerIds = await this.followingsRepository.createQueryBuilder('following')
			.andWhere('following."followeeId" = :meId', { meId: me?.id })
			.innerJoinAndSelect('following.follower', 'follower')
			.limit(1000)
			.getMany();

		filter.bool.must.push({
			bool: {
				should: [
					{ term: { searchableBy: 'public' } },
					{
						bool: {
							must: [
								{ term: { searchableBy: 'limited' } },
								{ term: { userId: me?.id } },
							],
						},
					},
					{
						bool: {
							must: [
								{ term: { searchableBy: 'followers' } },
								{
									bool: {
										should: [
											{ term: { userId: me?.id } },
											{ terms: { userId: followerIds.map(f => f.follower?.id ) } },
										],
										minimum_should_match: 1,
									},
								},
							],
						},
					},
				],
				minimum_should_match: 1,
			},
		});

		const res = await this.elasticsearch?.search({
			index: this.elasticsearchNoteIndex as string,
			query: filter,
			sort: [{ createdAt: 'desc' }],
			_source: ['id', 'createdAt'],
			size: pagination.limit,
		});

		const noteIds = res?.hits.hits.map(hit => hit._id) ?? [];

		const [
			userIdWhoMeMuting,
			userIdWhoBlockingMe,
		] = me ? await Promise.all([
			this.cacheService.userMutingsCache.fetch(me.id),
			this.cacheService.userBlockedCache.fetch(me.id),
		]) : [new Set<string>(), new Set<string>()];

		const notes = (await this.notesRepository.findBy({
			id: In(noteIds),
		})).filter(note => {
			if (me && isUserRelated(note, userIdWhoBlockingMe)) return false;
			if (me && isUserRelated(note, userIdWhoMeMuting)) return false;
			return true;
		});

		return notes.sort((a, b) => a.id > b.id ? -1 : 1);
	}
}
