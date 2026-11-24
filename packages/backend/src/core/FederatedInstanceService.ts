/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { InstancesRepository } from '@/models/_.js';
import type { MiInstance } from '@/models/Instance.js';
import { MemoryKVCache, RedisKVCache } from '@/misc/cache.js';
import { type ColumnKinds, nullableCodec, objectCodec, redisConverters } from '@/misc/cache-codec.js';

/** `federatedInstance`のキャッシュに保存する列（P2-1）。すべての列を保存する */
const INSTANCE_CACHE_COLUMNS: ColumnKinds<MiInstance> = {
	id: 'value',
	firstRetrievedAt: 'date',
	host: 'value',
	usersCount: 'value',
	notesCount: 'value',
	followingCount: 'value',
	followersCount: 'value',
	latestRequestReceivedAt: 'date',
	isNotResponding: 'value',
	notRespondingSince: 'date',
	suspensionState: 'value',
	quarantineLimited: 'value',
	softwareName: 'value',
	softwareVersion: 'value',
	openRegistrations: 'value',
	name: 'value',
	description: 'value',
	maintainerName: 'value',
	maintainerEmail: 'value',
	iconUrl: 'value',
	faviconUrl: 'value',
	themeColor: 'value',
	infoUpdatedAt: 'date',
	moderationNote: 'value',
};

const instanceCacheCodec = nullableCodec(objectCodec<MiInstance>(INSTANCE_CACHE_COLUMNS));
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { CacheInvalidationService } from '@/core/CacheInvalidationService.js';

/** 連合サーバーの最終受信時刻（zset、P3-2）。付録Aのキー台帳を参照 */
export const INSTANCE_REQUEST_RECEIVED_AT_KEY = 'instanceRequestReceivedAt';
/** 自動停止を解除する連合サーバー（set、P3-2） */
export const INSTANCE_UNSUSPEND_REQUESTED_KEY = 'instanceUnsuspendRequested';
const FLUSH_CHUNK_SIZE = 1000;

@Injectable()
export class FederatedInstanceService implements OnApplicationShutdown {
	public federatedInstanceCache: RedisKVCache<MiInstance | null>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private utilityService: UtilityService,
		private idService: IdService,
		private cacheInvalidationService: CacheInvalidationService,
	) {
		this.federatedInstanceCache = new RedisKVCache<MiInstance | null>(this.redisClient, 'federatedInstance', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60 * 3, // 3m
			fetcher: (key) => this.instancesRepository.findOneBy({ host: key }),
			...redisConverters(instanceCacheCodec),
			invalidation: this.cacheInvalidationService,
		});
	}

	@bindThis
	public async fetchOrRegister(host: string): Promise<MiInstance> {
		host = this.utilityService.toPuny(host);

		const cached = await this.federatedInstanceCache.get(host);
		if (cached) return cached;

		const index = await this.instancesRepository.findOneBy({ host });

		if (index == null) {
			const i = await this.instancesRepository.insertOne({
				id: this.idService.gen(),
				host,
				firstRetrievedAt: new Date(),
			});

			this.federatedInstanceCache.set(host, i);
			return i;
		} else {
			this.federatedInstanceCache.set(host, index);
			return index;
		}
	}

	@bindThis
	public async fetch(host: string): Promise<MiInstance | null> {
		host = this.utilityService.toPuny(host);

		const cached = await this.federatedInstanceCache.get(host);
		if (cached !== undefined) return cached;

		const index = await this.instancesRepository.findOneBy({ host });

		if (index == null) {
			this.federatedInstanceCache.set(host, null);
			return null;
		} else {
			this.federatedInstanceCache.set(host, index);
			return index;
		}
	}

	@bindThis
	public async update(id: MiInstance['id'], data: Partial<MiInstance>): Promise<void> {
		const result = await this.instancesRepository.createQueryBuilder().update()
			.set(data)
			.where('id = :id', { id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});

		this.federatedInstanceCache.set(result.host, result);
	}

	/**
	 * 連合サーバーからリクエストを受け取ったことを記録する（inboxの処理）。DBへは`flushRequestReceived`がまとめて書く（P3-2）。
	 *
	 * - `instanceRequestReceivedAt`（zset）: メンバーはサーバーのID、スコアは最終受信時刻（ミリ秒）。`ZADD GT`で最大値を保つ
	 * - `instanceUnsuspendRequested`（set）: 応答なしで自動停止していたので、停止を解除するサーバーのID
	 *
	 * 以前はプロセスのメモリ（`CollapsedQueue`）に5分間溜めていた。Redisに置くのは、どのプロセス（Rust版を含む）が受信しても
	 * 同じところに集約し、プロセスの停止で失われないようにするためである。flushの後、DBに書く前に停止すると失われるが、
	 * 次の受信で回復する値なので許容する。
	 */
	@bindThis
	public async recordRequestReceived(instance: Pick<MiInstance, 'id' | 'suspensionState'>, receivedAt: Date = new Date()): Promise<void> {
		const multi = this.redisClient.multi()
			.zadd(INSTANCE_REQUEST_RECEIVED_AT_KEY, 'GT', receivedAt.getTime(), instance.id);
		if (instance.suspensionState === 'autoSuspendedForNotResponding') {
			multi.sadd(INSTANCE_UNSUSPEND_REQUESTED_KEY, instance.id);
		}
		await multi.exec();
	}

	/**
	 * `recordRequestReceived`で集約した値を取り出してDBへ書く（定期ジョブ`flushInstanceRequestReceived`）。
	 *
	 * 取り出しと削除は1つのトランザクション（MULTI）で行うので、その間の受信は次のflushに回る。
	 * 自動停止の解除は、DBの時点で自動停止のままのサーバーだけに行う（集約している間に管理者が停止したものは解除しない）。
	 *
	 * @returns 更新したサーバーの数
	 */
	@bindThis
	public async flushRequestReceived(): Promise<number> {
		const results = await this.redisClient.multi()
			.zrange(INSTANCE_REQUEST_RECEIVED_AT_KEY, 0, -1, 'WITHSCORES')
			.del(INSTANCE_REQUEST_RECEIVED_AT_KEY)
			.smembers(INSTANCE_UNSUSPEND_REQUESTED_KEY)
			.del(INSTANCE_UNSUSPEND_REQUESTED_KEY)
			.exec();
		if (results == null) throw new Error('redis transaction aborted');
		for (const [err] of results) {
			if (err) throw err;
		}

		const receivedAt = results[0][1] as string[];
		const unsuspend = new Set(results[2][1] as string[]);

		const entries: { id: MiInstance['id']; receivedAt: Date; unsuspend: boolean; }[] = [];
		for (let i = 0; i < receivedAt.length; i += 2) {
			const id = receivedAt[i];
			entries.push({ id, receivedAt: new Date(Number(receivedAt[i + 1])), unsuspend: unsuspend.has(id) });
		}

		let updated = 0;
		for (let i = 0; i < entries.length; i += FLUSH_CHUNK_SIZE) {
			const chunk = entries.slice(i, i + FLUSH_CHUNK_SIZE);
			const [rows] = await this.instancesRepository.query(
				`UPDATE "instance" AS "i" SET
					"latestRequestReceivedAt" = GREATEST("i"."latestRequestReceivedAt", "v"."receivedAt"),
					"isNotResponding" = false,
					"suspensionState" = CASE
						WHEN "v"."unsuspend" AND "i"."suspensionState" = 'autoSuspendedForNotResponding' THEN 'none'
						ELSE "i"."suspensionState"
					END
				FROM unnest($1::varchar[], $2::timestamptz[], $3::boolean[]) AS "v"("id", "receivedAt", "unsuspend")
				WHERE "i"."id" = "v"."id"
				RETURNING "i".*`,
				[chunk.map(e => e.id), chunk.map(e => e.receivedAt.toISOString()), chunk.map(e => e.unsuspend)],
			) as [MiInstance[], number];

			// キャッシュの書き込みも待つ（待たないと、ジョブの完了後やRedisの切断後に拒否される）
			await Promise.all(rows.map(row => this.federatedInstanceCache.set(row.host, row)));
			updated += rows.length;
		}

		return updated;
	}

	@bindThis
	public dispose(): void {
		this.federatedInstanceCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
