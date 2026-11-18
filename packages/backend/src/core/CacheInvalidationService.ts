/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { CacheInvalidationBus } from '@/misc/cache.js';
import { onRedisReconnected } from '@/misc/redis-reconnected.js';

/**
 * キャッシュの無効化を、内部イベント`cacheInvalidated`で全プロセスに伝える。
 *
 * - `RedisKVCache`・`RedisSingleCache`は、値を書き込む・削除するときにイベントを発行する。
 *   受け取ったプロセスは、該当するキーをメモリ層から消す（自分が発行したイベントは無視する）
 * - Pub/Subの接続が切れてつなぎ直したときは、切れている間のイベントを受け取れていないので、
 *   登録されたキャッシュのメモリ層をすべて捨てる（ほかのメモリ上のキャッシュは各サービスが`onRedisReconnected`で捨てる）
 */
@Injectable()
export class CacheInvalidationService implements CacheInvalidationBus, OnApplicationShutdown {
	/** このプロセス（DIコンテナ）が発行したイベントを見分けるためのID */
	private readonly origin = randomUUID();
	private readonly listeners = new Map<string, Set<(key: string | null) => void>>();
	private readonly offReconnected: () => void;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		private globalEventService: GlobalEventService,
	) {
		this.redisForSub.on('message', this.onMessage);
		this.offReconnected = onRedisReconnected(this.redisForSub, this.onReconnected);
	}

	@bindThis
	public publish(cache: string, key: string | null): void {
		this.globalEventService.publishInternalEvent('cacheInvalidated', { cache, key, origin: this.origin });
	}

	@bindThis
	public subscribe(cache: string, listener: (key: string | null) => void): () => void {
		let set = this.listeners.get(cache);
		if (set == null) {
			set = new Set();
			this.listeners.set(cache, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	}

	@bindThis
	private onMessage(_: string, data: string): void {
		let obj: { channel?: string; message?: GlobalEvents['internal']['payload'] };
		try {
			obj = JSON.parse(data);
		} catch {
			return;
		}
		if (obj.channel !== 'internal' || obj.message?.type !== 'cacheInvalidated') return;

		const { cache, key, origin } = obj.message.body;
		if (origin === this.origin) return;

		for (const listener of this.listeners.get(cache) ?? []) {
			listener(key);
		}
	}

	@bindThis
	private onReconnected(): void {
		for (const set of this.listeners.values()) {
			for (const listener of set) {
				listener(null);
			}
		}
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
		this.offReconnected();
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}
