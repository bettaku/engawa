/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { MiNote } from '@/models/Note.js';
import { MiUser } from '@/models/_.js';
import type { NotesRepository, UsersRepository, FollowingsRepository, DriveFilesRepository } from '@/models/_.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { CacheService } from '@/core/CacheService.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import type { Index, Meilisearch } from 'meilisearch';
import { Client as ElasticSearch } from '@elastic/elasticsearch';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { noteMapping, noteSettings } from '@/models/elasticsearch/note.js';
import { userMapping, userSettings } from '@/models/elasticsearch/user.js';

type K = string;
type V = string | number | boolean;
type Q =
	{ op: '=', k: K, v: V } |
	{ op: '!=', k: K, v: V } |
	{ op: '>', k: K, v: number } |
	{ op: '<', k: K, v: number } |
	{ op: '>=', k: K, v: number } |
	{ op: '<=', k: K, v: number } |
	{ op: 'is null', k: K} |
	{ op: 'is not null', k: K} |
	{ op: 'and', qs: Q[] } |
	{ op: 'or', qs: Q[] } |
	{ op: 'not', q: Q };

function compileValue(value: V): string {
	if (typeof value === 'string') {
		return `'${value}'`; // TODO: escape
	} else if (typeof value === 'number') {
		return value.toString();
	} else if (typeof value === 'boolean') {
		return value.toString();
	}
	throw new Error('unrecognized value');
}

function compileQuery(q: Q): string {
	switch (q.op) {
		case '=': return `(${q.k} = ${compileValue(q.v)})`;
		case '!=': return `(${q.k} != ${compileValue(q.v)})`;
		case '>': return `(${q.k} > ${compileValue(q.v)})`;
		case '<': return `(${q.k} < ${compileValue(q.v)})`;
		case '>=': return `(${q.k} >= ${compileValue(q.v)})`;
		case '<=': return `(${q.k} <= ${compileValue(q.v)})`;
		case 'and': return q.qs.length === 0 ? '' : `(${ q.qs.map(_q => compileQuery(_q)).join(' AND ') })`;
		case 'or': return q.qs.length === 0 ? '' : `(${ q.qs.map(_q => compileQuery(_q)).join(' OR ') })`;
		case 'is null': return `(${q.k} IS NULL)`;
		case 'is not null': return `(${q.k} IS NOT NULL)`;
		case 'not': return `(NOT ${compileQuery(q.q)})`;
		default: throw new Error('unrecognized query operator');
	}
}

@Injectable()
export class SearchService {
	private readonly meilisearchIndexScope: 'local' | 'global' | string[] = 'local';
	private meilisearchNoteIndex: Index | null = null;
	private meilisearchLocale: string[] = ['jpn', 'eng'];

	private readonly elasticsearchIndexScope: 'local' | 'global' | string[] = 'local';
	private elasticsearchNoteIndex: string | null = null;
	private elasticsearchUserIndex: string | null = null;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.meilisearch)
		private meilisearch: Meilisearch | null,

		@Inject(DI.elasticsearch)
		private elasticsearch: ElasticSearch | null,

		private cacheService: CacheService,
		private queryService: QueryService,
		private idService: IdService,
	) {
		if (meilisearch) {
			this.meilisearchNoteIndex = meilisearch.index(`${config.meilisearch!.index}---notes`);
			this.meilisearchNoteIndex.updateSettings({
				searchableAttributes: [
					'text',
					'cw',
				],
				sortableAttributes: [
					'createdAt',
				],
				filterableAttributes: [
					'createdAt',
					'userId',
					'userHost',
					'channelId',
					'tags',
					'fileIds',
				],
				typoTolerance: {
					enabled: false,
				},
				pagination: {
					maxTotalHits: 10000,
				},
			});
		} else if (elasticsearch) {
			const NoteIndex = `${config.elasticsearch!.index}---notes`;
			const UserIndex = `${config.elasticsearch!.index}---users`;
			this.elasticsearchNoteIndex = NoteIndex;
			this.elasticsearchUserIndex = UserIndex;

			this.elasticsearch?.indices.exists({
				index: NoteIndex,
			}).then((indexExists) => {
				if (!indexExists) [
					this.elasticsearch?.indices.create({
						index: NoteIndex,
						mappings: {
							properties: noteMapping.properties,
						},
						settings: noteSettings.settings,
					})?.catch((e) => {
						console.error(e);
					})
				];
			}).catch((e) => {
				console.error(e);
			});

			this.elasticsearch?.indices.exists({
				index: UserIndex,
			}).then((indexExists) => {
				if (!indexExists) [
					this.elasticsearch?.indices.create({
						index: UserIndex,
						mappings: {
							properties: userMapping.properties,
						},
						settings: userSettings.settings,
					})
				];
			});
		}

		if (config.meilisearch?.scope) {
			this.meilisearchIndexScope = config.meilisearch.scope;
		}

		if (config.meilisearch?.locale) {
			this.meilisearchLocale = config.meilisearch.locale;
		}

		if (config.elasticsearch?.scope) {
			this.elasticsearchIndexScope = config.elasticsearch.scope;
		}
	}

	@bindThis
	public async indexNote(note: MiNote): Promise<void> {
		if (note.text == null && note.cw == null) return;
		if (!['home', 'public'].includes(note.visibility)) return;

		if (this.meilisearch) {
			switch (this.meilisearchIndexScope) {
				case 'global':
					break;
				case 'local':
					if (note.userHost == null) break;
					return;
				default: {
					if (note.userHost == null) break;
					if (this.meilisearchIndexScope.includes(note.userHost)) break;
					return;
				}
			}

			await this.meilisearchNoteIndex?.addDocuments([{
				id: note.id,
				createdAt: this.idService.parse(note.id).date.getTime(),
				userId: note.userId,
				userHost: note.userHost,
				channelId: note.channelId,
				text: note.text,
				cw: note.cw,
				tags: note.tags,
				fileIds: note.fileIds,
			}], {
				primaryKey: 'id',
			});
		} else if (this.elasticsearch) {
			const Quote = isRenote(note) && isQuote(note);

			const isBot = note.user?.isBot;

			const document = {
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
				isQuote: Quote,
				searchableBy: note.searchableBy,
				isBot: isBot,
			};

			switch (this.elasticsearchIndexScope) {
				case 'global':
					break;
				case 'local':
					if (note.userHost == null) break;
					return;
				default: {
					if (note.userHost == null) break;
					if (this.elasticsearchIndexScope.includes(note.userHost)) break;
					return;
				}
			}

			await this.elasticsearch.index({
				index: this.elasticsearchNoteIndex as string,
				id: note.id,
				document: document,
			}).catch((e) => {
				console.error(e);
			});
		}
	}

	@bindThis
	public async indexUser(user: MiUser): Promise<void> {
		if (this.elasticsearch) {
			const document = {
				name: user.name,
				usernameLower: user.usernameLower,
				updateAt: user.updatedAt,
				isSuspended: user.isSuspended,
				isIndexable: user.isIndexable,
				isBot: user.isBot,
				isCat: user.isCat,
			};

			await this.elasticsearch.index({
				index: this.elasticsearchUserIndex as string,
				id: user.id,
				document: document,
			});
		}
	}

	@bindThis
	public async fullIndexNote(): Promise<void> {
		if (!this.elasticsearch) return;

		const notesCount = await this.notesRepository.createQueryBuilder('note').getCount();
		const limit = 100;
		let latestId = '';
		for (let i = 0; i < notesCount; i += limit) {
			const notes = await this.notesRepository.createQueryBuilder('note')
				.where('note.id > :latestId', { latestId })
				.orderBy('note.id', 'ASC')
				.limit(limit)
				.getMany();

			notes.forEach(note => {
				this.indexNote(note);
				latestId = note.id;
			});
		}
	}

	@bindThis
	public async fullIndexUser(): Promise<void> {
		if (!this.elasticsearch) return;

		const usersCount = await this.usersRepository.createQueryBuilder('user').getCount();
		const limit = 100;
		let latestId = '';
		for (let i = 0; i < usersCount; i += limit) {
			const users = await this.usersRepository.createQueryBuilder('user')
				.where('user.id > :latestId', { latestId })
				.orderBy('user.id', 'ASC')
				.limit(limit)
				.getMany();

			users.forEach(user => {
				this.indexUser(user);
				latestId = user.id;
			});
		};
	}

	@bindThis
	public async unindexNote(note: MiNote): Promise<void> {
		if (!['home', 'public'].includes(note.visibility)) return;

		if (this.meilisearch) {
			this.meilisearchNoteIndex!.deleteDocument(note.id);
		} else if (this.elasticsearch) {
			this.elasticsearch.delete({
				index: this.elasticsearchNoteIndex as string,
				id: note.id,
			}).catch((e) => {
				console.error(e);
			});
		}
	}

	@bindThis
	public async unindexUser(user: MiUser): Promise<void> {
		if (this.elasticsearch) {
			this.elasticsearch.delete({
				index: this.elasticsearchUserIndex as string,
				id: user.id,
			}).catch((e) => {
				console.error(e);
			});
		}
	}

	@bindThis
	public async reindexNote(): Promise<void> {
		if (this.elasticsearch) {
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
	}

	@bindThis
	public async reindexUser(): Promise<void> {
		if (this.elasticsearch) {
			await this.elasticsearch.indices.delete({
				index: this.elasticsearchUserIndex as string,
			}).catch((e) => {
				console.error(e);
			});

			await this.elasticsearch.indices.create({
				index: this.elasticsearchUserIndex as string,
				mappings: {
					properties: userMapping.properties,
				},
				settings: userSettings.settings,
			});

			await this.fullIndexUser().catch((e) => {
				console.error(e);
			});
		}
	}

	@bindThis
	public async searchNote(q: string, me: MiUser | null, opts: {
		userId?: MiNote['userId'] | null;
		channelId?: MiNote['channelId'] | null;
		host?: string | null;
		fileOption?: string | null;
		excludeNsfw?: boolean;
		excludeBot?: boolean;
		orderBy?: string | null;
	}, pagination: {
		untilId?: MiNote['id'];
		sinceId?: MiNote['id'];
		limit?: number;
	}): Promise<MiNote[]> {
		if (this.meilisearch) {
			const filter: Q = {
				op: 'and',
				qs: [],
			};
			if (pagination.untilId) filter.qs.push({ op: '<', k: 'createdAt', v: this.idService.parse(pagination.untilId).date.getTime() });
			if (pagination.sinceId) filter.qs.push({ op: '>', k: 'createdAt', v: this.idService.parse(pagination.sinceId).date.getTime() });
			if (opts.userId) filter.qs.push({ op: '=', k: 'userId', v: opts.userId });
			if (opts.channelId) filter.qs.push({ op: '=', k: 'channelId', v: opts.channelId });
			if (opts.host) {
				if (opts.host === '.') {
					filter.qs.push({ op: 'is null', k: 'userHost' });
				} else {
					filter.qs.push({ op: '=', k: 'userHost', v: opts.host });
				}
			}

			const res = await this.meilisearchNoteIndex!.search(q, {
				sort: [`createdAt:${opts.orderBy ? opts.orderBy : 'desc'}`],
				matchingStrategy: 'all',
				attributesToRetrieve: ['id', 'createdAt'],
				filter: compileQuery(filter),
				limit: pagination.limit,
				locales: this.meilisearchLocale,
			});

			const [
				userIdsWhoMeMuting,
				userIdsWhoBlockingMe,
			] = me ? await Promise.all([
				this.cacheService.userMutingsCache.fetch(me.id),
				this.cacheService.userBlockedCache.fetch(me.id),
			]) : [new Set<string>(), new Set<string>()];

			const notes = (await this.notesRepository.findBy({
				id: In(res.hits.map(x => x.id)),
			})).filter(note => {
				if (me && isUserRelated(note, userIdsWhoBlockingMe)) return false;
				if (me && isUserRelated(note, userIdsWhoMeMuting)) return false;
				return true;
			});

			return notes.sort((a, b) => a.id > b.id ? -1 : 1);
		} else if (this.elasticsearch) {
			const esFilter: any = {
				bool: {
					must: [],
					must_not: [],
					should: [],
				},
			};

			if (pagination.untilId) esFilter.bool.must.push({ range: { createdAt: { lt: this.idService.parse(pagination.untilId).date.getTime() } } });
			if (pagination.sinceId) esFilter.bool.must.push({ range: { createdAt: { gt: this.idService.parse(pagination.sinceId).date.getTime() } } });
			if (opts.userId) esFilter.bool.must.push({ term: { userId: opts.userId } });
			if (opts.host) {
				if (opts.host === '.') {
					esFilter.bool.must_not.push({ exists: { field: 'userHost' } });
				} else if (opts.host) {
					esFilter.bool.must.push({ term: { userHost: opts.host } });
				}
			};

			if (opts.fileOption) {
				if (opts.fileOption === 'fileOnly') {
					esFilter.bool.must.push({ exists: { field: 'fileIds' } });
				} else if (opts.fileOption === 'noFile') {
					esFilter.bool.must_not.push({ exists: { field: 'fileIds' } });
				}
			}

			if (opts.excludeBot) {
				const botIds = await this.usersRepository.createQueryBuilder('user')
					.where('user.isBot = true')
					.select('user.id')
					.limit(100)
					.getMany();

				esFilter.bool.must_not.push({ terms: { userId: botIds.map(b => b.id) } });
			}

			if (q !== '') {
				const orQueries = q.split(',').map(q => q.trim());
				const shouldQueries = orQueries.filter(q => !q.startsWith("not:"));
				const sensitiveFileIds = await this.driveFilesRepository.createQueryBuilder('drive_file')
					.where('drive_file."isSensitive" = TRUE')
					.select('drive_file.id')
					.limit(100)
					.getMany();
				if (opts.excludeNsfw) {
					esFilter.bool.must.push({
						bool: {
							should: shouldQueries.flatMap(q => [
								{ wildcard: { 'text': `*${q}*` } },
								{ simple_query_string: { fields: ['text'], 'query': q, default_operator: 'and' } },
							]),
							minimum_should_match: 1,
						},
					});
					esFilter.bool.must_not.push({ terms: { fileIds: sensitiveFileIds.map(f => f.id) } });
				} else {
					esFilter.bool.must.push({
						bool: {
							should: shouldQueries.flatMap(q => [
								{ wildcard: { 'text': `*${q}*` } },
								{ simple_query_string: { fields: ['text'], 'query': q, default_operator: 'and' } },
								{ wildcard: { 'cw': `*${q}*` } },
								{ simple_query_string: { fields: ['cw'], 'query': q, default_operator: 'and' } },
							]),
							minimum_should_match: 1,
						}
					});
				}
			};

			const followerIds = await this.followingsRepository.createQueryBuilder('following')
				.andWhere('following."followeeId" = :meId', { meId: me?.id })
				.innerJoinAndSelect('following.follower', 'follower')
				.limit(100)
				.getMany();

			esFilter.bool.must.push({
				bool: {
					should: [
						{ term: { searchableBy: 'public' } },
						{
							bool: {
								must: [
									{ term: { searchableBy: 'limited' } },
									{ term: { userId: me?.id } },
								],
							}
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
										}
									}
								],
							}
						},
					],
					minimum_should_match: 1,
				}
			});

			const res = await this.elasticsearch.search({
				index: this.elasticsearchNoteIndex as string,
				query: esFilter,
				sort: [{ createdAt: { order: 'desc' } }],
				_source: ['id', 'createdAt'],
				size: pagination.limit,
			});

			const noteIds = res.hits.hits.map((hit: any) => hit._id);

			const [
				userIdsWhoBlockingMe,
				userIdsWhoMeMuting,
			] = me ? await Promise.all([
				this.cacheService.userBlockedCache.fetch(me.id),
				this.cacheService.userMutingsCache.fetch(me.id),
			]) : [new Set<string>(), new Set<string>()];
			const notes = (await this.notesRepository.findBy({
				id: In(noteIds),
			})).filter(note => {
				if (me && isUserRelated(note, userIdsWhoBlockingMe)) return false;
				if (me && isUserRelated(note, userIdsWhoMeMuting)) return false;
				return true;
			});

			return notes.sort((a, b) => a.id > b.id ? -1 : 1);
		} else {
			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), pagination.sinceId, pagination.untilId);

			if (opts.userId) {
				query.andWhere('note.userId = :userId', { userId: opts.userId });
			} else if (opts.channelId) {
				query.andWhere('note.channelId = :channelId', { channelId: opts.channelId });
			}

			query
				.andWhere('note.text ILIKE :q', { q: `%${ sqlLikeEscape(q) }%` })
				.andWhere(new Brackets(qb => {
					qb.andWhere('note.searchableBy = :public', { public: 'public' })
						.orWhere(new Brackets(qb2 => {
							qb2.where('note.searchableBy = :followers AND (note."userId" IN (SELECT "followeeId" FROM following WHERE following."followerId" = :meId) OR note."userId" = :meId)', { followers: 'followers', meId: me?.id })
								.orWhere('note.searchableBy = :limited AND note."userId" = :meId', { limited: 'limited', meId: me?.id })
								.orWhere('note.searchableBy = :reacted AND (note."userId" IN (SELECT "userId" FROM note_reaction) OR note."userId" = :meId)', { reacted: 'reacted', meId: me?.id });
						}));
				}))
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser');

			if (opts.host) {
				if (opts.host === '.') {
					query.andWhere('user.host IS NULL');
				} else {
					query.andWhere('user.host = :host', { host: opts.host });
				}
			}

			if (opts.fileOption) {
				if (opts.fileOption === 'fileOnly') {
					query.andWhere('note."fileIds" != \'{}\' ');
				} else if (opts.fileOption === 'noFile') {
					query.andWhere('note."fileIds" = \'{}\'');
				}
			}

			if (opts.excludeNsfw) {
				query.andWhere('note."cw" IS NULL');
				query.andWhere('0 = (SELECT COUNT(*) FROM drive_file df WHERE df.id = ANY(note."fileIds") AND df."isSensitive" = true)');
			} else {
				query.orWhere('note."cw" ILIKE :q', { q: `%${ sqlLikeEscape(q) }%` });
			}

			if (opts.excludeBot) {
				query.innerJoinAndSelect('note.user', 'user', 'user.isIndexable = true AND user.isBot = false');
			} else {
				query.innerJoinAndSelect('note.user', 'user', 'user.isIndexable = true');
			}

			this.queryService.generateVisibilityQuery(query, me);
			if (me) this.queryService.generateMutedUserQuery(query, me);
			if (me) this.queryService.generateBlockedUserQuery(query, me);

			return await query.limit(pagination.limit).getMany();
		}
	}
}
