/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { MiMeta } from '@/models/Meta.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import { isInternalEventRef, type GlobalEvents } from '@/core/GlobalEventService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import { onRedisReconnected } from '@/misc/redis-reconnected.js';

@Injectable()
export class MetaService implements OnApplicationShutdown {
	private readonly offRedisReconnected: () => void;
	private cache: MiMeta | undefined;
	/** キャッシュを捨てる・置き換えるたびに進める。それより前に始めたDBの読み込みの結果はキャッシュしない */
	private cacheGeneration = 0;
	private intervalId: NodeJS.Timeout;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		private featuredService: FeaturedService,
		private globalEventService: GlobalEventService,
	) {
		//this.onMessage = this.onMessage.bind(this);

		if (process.env.NODE_ENV !== 'test') {
			this.intervalId = setInterval(() => {
				// キャッシュはfetchの中で更新する（読み込み中にイベントで更新されていれば更新しない）
				this.fetch(true).catch(err => {
					console.error('Failed to refresh the meta cache', err);
				});
			}, 1000 * 60 * 5);
		}

		this.redisForSub.on('message', this.onMessage);
		this.offRedisReconnected = onRedisReconnected(this.redisForSub, this.onRedisReconnected);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					if (isInternalEventRef(body)) {
						// 新本文は値を持たないので、次の取得でDBから読み直す
						this.setCache(undefined);
						break;
					}
					this.setCache({ // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
						...(body.after),
						rootUser: null, // joinなカラムは通常取ってこないので
					});
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async fetch(noCache = false): Promise<MiMeta> {
		if (!noCache && this.cache) return this.cache;

		const generation = this.cacheGeneration;
		const cacheIfNotChanged = (meta: MiMeta) => {
			if (generation === this.cacheGeneration) this.setCache(meta);
		};

		return await this.db.transaction(async transactionalEntityManager => {
			// 過去のバグでレコードが複数出来てしまっている可能性があるので新しいIDを優先する
			const metas = await transactionalEntityManager.find(MiMeta, {
				order: {
					id: 'DESC',
				},
			});

			const meta = metas[0];

			if (meta) {
				cacheIfNotChanged(meta);
				return meta;
			} else {
				// metaが空のときfetchMetaが同時に呼ばれるとここが同時に呼ばれてしまうことがあるのでフェイルセーフなupsertを使う
				const saved = await transactionalEntityManager
					.upsert(
						MiMeta,
						{
							id: 'x',
						},
						['id'],
					)
					.then((x) => transactionalEntityManager.findOneByOrFail(MiMeta, x.identifiers[0]));

				cacheIfNotChanged(saved);
				return saved;
			}
		});
	}

	@bindThis
	public async update(data: Partial<MiMeta>): Promise<MiMeta> {
		let before: MiMeta | undefined;

		const updated = await this.db.transaction(async transactionalEntityManager => {
			const metas = await transactionalEntityManager.find(MiMeta, {
				order: {
					id: 'DESC',
				},
			});

			before = metas[0];

			if (before) {
				await transactionalEntityManager.update(MiMeta, before.id, data);
			} else {
				await transactionalEntityManager.save(MiMeta, {
					...data,
					id: 'x',
				});
			}

			const afters = await transactionalEntityManager.find(MiMeta, {
				order: {
					id: 'DESC',
				},
			});

			return afters[0];
		});

		if (data.hiddenTags) {
			process.nextTick(() => {
				const hiddenTags = new Set<string>(data.hiddenTags);
				if (before) {
					for (const previousHiddenTag of before.hiddenTags) {
						hiddenTags.delete(previousHiddenTag);
					}
				}

				for (const hiddenTag of hiddenTags) {
					this.featuredService.removeHashtagsFromRanking(hiddenTag);
				}
			});
		}

		this.globalEventService.publishInternalEvent('metaUpdated', { before, after: updated });

		return updated;
	}

	/**
	 * Pub/Subをつなぎ直したとき。切れている間のイベントを受け取れていないので、イベントで更新しているキャッシュを捨てる
	 */
	@bindThis
	private onRedisReconnected(): void {
		this.setCache(undefined);
	}

	@bindThis
	private setCache(meta: MiMeta | undefined): void {
		this.cacheGeneration++;
		this.cache = meta;
	}

	@bindThis
	public dispose(): void {
		this.offRedisReconnected();
		clearInterval(this.intervalId);
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
