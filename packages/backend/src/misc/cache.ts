/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { bindThis } from '@/decorators.js';

/**
 * Redisに保存するキャッシュの値の形式の版（namespace）。
 *
 * - 1: `kvcache:<name>:<key>`、`singlecache:<name>`。値は呼び出し側の変換関数（多くはエンティティのJSON）
 * - 2: `kvcache:v2:<name>:<key>`、`singlecache:v2:<name>`。値はキャッシュごとに定義したDTO（予定）
 *
 * 版を切り替える期間は、新旧の版のプロセスが同じキーを共有する。どちらの版のプロセスが値を更新・削除しても、
 * もう一方の版のプロセスが古い値を読まないように、書き込み・削除のたびに**すべての版の**キーを消す。
 * この処理を先に配布してから（第1リリース）、読み書きする版を切り替える（第2リリース）。
 * 手順は docs/rust-migration/redis-keys.md を参照。
 */
export const CACHE_KEY_VERSIONS = [1, 2] as const;
export type CacheKeyVersion = typeof CACHE_KEY_VERSIONS[number];

/** 読み書きに使う版。第2リリースで2にする */
export const CURRENT_CACHE_KEY_VERSION: CacheKeyVersion = 1;

/**
 * 版付けのキー。`version`が`null`のキャッシュは版を持たない（認証状態などDBから再生成できないもの）。
 */
export function kvCacheKey(name: string, key: string, version: CacheKeyVersion | null): string {
	return version == null || version === 1 ? `kvcache:${name}:${key}` : `kvcache:v${version}:${name}:${key}`;
}

export function singleCacheKey(name: string, version: CacheKeyVersion | null): string {
	return version == null || version === 1 ? `singlecache:${name}` : `singlecache:v${version}:${name}`;
}

/**
 * MULTIを実行し、どれかのコマンドが失敗していたら例外を投げる。
 * ioredisのexecは、個々のコマンドの失敗を結果の配列に入れて返すだけなので確認する
 */
async function execOrThrow(multi: Redis.ChainableCommander): Promise<void> {
	const results = await multi.exec();
	if (results == null) throw new Error('Redis transaction was aborted');
	for (const [err] of results) {
		if (err) throw err;
	}
}

/**
 * RedisのTTL（秒）。1秒未満に丸まる寿命はSET ... EXが拒否するので、作成時に拒否する
 */
function ttlSeconds(lifetime: number): number | null {
	if (lifetime === Infinity) return null;
	const seconds = Math.round(lifetime / 1000);
	if (!Number.isSafeInteger(seconds) || seconds < 1) {
		throw new Error(`Cache lifetime must be at least 1 second: ${lifetime}ms`);
	}
	return seconds;
}

export class RedisKVCache<T> {
	private readonly lifetime: number;
	private readonly memoryCache: MemoryKVCache<T>;
	private readonly fetcher: (key: string) => Promise<T>;
	private readonly toRedisConverter: (value: T) => string;
	private readonly fromRedisConverter: (value: string) => T | undefined;
	private readonly version: CacheKeyVersion | null;

	constructor(
		private redisClient: Redis.Redis,
		private name: string,
		opts: {
			lifetime: RedisKVCache<T>['lifetime'];
			memoryCacheLifetime: number;
			fetcher: RedisKVCache<T>['fetcher'];
			toRedisConverter: RedisKVCache<T>['toRedisConverter'];
			fromRedisConverter: RedisKVCache<T>['fromRedisConverter'];
			/**
			 * 読み書きするキーの版。省略すると`CURRENT_CACHE_KEY_VERSION`。
			 * `null`にすると版を持たず、ほかの版のキーを消さない（DBから再生成できない値。P2-1の対象外）
			 */
			version?: CacheKeyVersion | null;
		},
	) {
		this.lifetime = opts.lifetime;
		this.memoryCache = new MemoryKVCache(opts.memoryCacheLifetime);
		this.fetcher = opts.fetcher;
		this.toRedisConverter = opts.toRedisConverter;
		this.fromRedisConverter = opts.fromRedisConverter;
		this.version = opts.version === undefined ? CURRENT_CACHE_KEY_VERSION : opts.version;
		ttlSeconds(this.lifetime);
	}

	/** 読み書きするキー */
	private keyOf(key: string): string {
		return kvCacheKey(this.name, key, this.version);
	}

	/** 値を変えたときに消す、ほかの版のキー */
	private otherKeysOf(key: string): string[] {
		if (this.version == null) return [];
		return CACHE_KEY_VERSIONS.filter(v => v !== this.version).map(v => kvCacheKey(this.name, key, v));
	}

	/**
	 * 値を書き込み、ほかの版のキーを消す（値が変わったとき）
	 */
	@bindThis
	public async set(key: string, value: T): Promise<void> {
		await this.write(key, value, true);
	}

	/**
	 * @param invalidateOthers ほかの版のキーも消すか。DBから読んだ値で埋めるだけのとき（キャッシュミス）は、
	 *   値は変わっていないので消さない（版の異なるプロセスが互いのキャッシュを消し合わないように）
	 */
	private async write(key: string, value: T, invalidateOthers: boolean): Promise<void> {
		this.memoryCache.set(key, value);
		const multi = this.redisClient.multi();
		const ttl = ttlSeconds(this.lifetime);
		if (ttl == null) {
			multi.set(this.keyOf(key), this.toRedisConverter(value));
		} else {
			multi.set(this.keyOf(key), this.toRedisConverter(value), 'EX', ttl);
		}
		const others = invalidateOthers ? this.otherKeysOf(key) : [];
		if (others.length > 0) multi.del(...others);
		await execOrThrow(multi);
	}

	@bindThis
	public async get(key: string): Promise<T | undefined> {
		const memoryCached = this.memoryCache.get(key);
		if (memoryCached !== undefined) return memoryCached;

		const cached = await this.redisClient.get(this.keyOf(key));
		if (cached == null) return undefined;

		const value = this.fromRedisConverter(cached);
		if (value !== undefined) {
			this.memoryCache.set(key, value);
		}

		return value;
	}

	@bindThis
	public async delete(key: string): Promise<void> {
		this.memoryCache.delete(key);
		await this.redisClient.del(this.keyOf(key), ...this.otherKeysOf(key));
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * This awaits the call to Redis to ensure that the write succeeded, which is important for a few reasons:
	 *   * Other code uses this to synchronize changes between worker processes. A failed write can internally de-sync the cluster.
	 *   * Without an `await`, consecutive calls could race. An unlucky race could result in the older write overwriting the newer value.
	 *   * Not awaiting here makes the entire cache non-consistent. The prevents many possible uses.
	 */
	@bindThis
	public async fetch(key: string): Promise<T> {
		const cachedValue = await this.get(key);
		if (cachedValue !== undefined) {
			// Cache HIT
			return cachedValue;
		}

		// Cache MISS
		const value = await this.fetcher(key);
		await this.write(key, value, false);
		return value;
	}

	@bindThis
	public async refresh(key: string) {
		const value = await this.fetcher(key);
		await this.set(key, value);

		// TODO: イベント発行して他プロセスのメモリキャッシュも更新できるようにする
	}

	@bindThis
	public gc() {
		this.memoryCache.gc();
	}

	@bindThis
	public dispose() {
		this.memoryCache.dispose();
	}
}

export class RedisSingleCache<T> {
	private readonly lifetime: number;
	private readonly memoryCache: MemorySingleCache<T>;
	private readonly fetcher: () => Promise<T>;
	private readonly toRedisConverter: (value: T) => string;
	private readonly fromRedisConverter: (value: string) => T | undefined;

	private readonly version: CacheKeyVersion | null;

	constructor(
		private redisClient: Redis.Redis,
		private name: string,
		opts: {
			lifetime: number;
			memoryCacheLifetime: number;
			fetcher: RedisSingleCache<T>['fetcher'];
			toRedisConverter: RedisSingleCache<T>['toRedisConverter'];
			fromRedisConverter: RedisSingleCache<T>['fromRedisConverter'];
			/** `RedisKVCache`の`version`と同じ */
			version?: CacheKeyVersion | null;
		},
	) {
		this.lifetime = opts.lifetime;
		this.memoryCache = new MemorySingleCache(opts.memoryCacheLifetime);
		this.fetcher = opts.fetcher;
		this.toRedisConverter = opts.toRedisConverter;
		this.fromRedisConverter = opts.fromRedisConverter;
		this.version = opts.version === undefined ? CURRENT_CACHE_KEY_VERSION : opts.version;
		ttlSeconds(this.lifetime);
	}

	private get key(): string {
		return singleCacheKey(this.name, this.version);
	}

	private get otherKeys(): string[] {
		if (this.version == null) return [];
		return CACHE_KEY_VERSIONS.filter(v => v !== this.version).map(v => singleCacheKey(this.name, v));
	}

	@bindThis
	public async set(value: T): Promise<void> {
		await this.write(value, true);
	}

	/** `RedisKVCache`の`write`と同じ */
	private async write(value: T, invalidateOthers: boolean): Promise<void> {
		this.memoryCache.set(value);
		const multi = this.redisClient.multi();
		const ttl = ttlSeconds(this.lifetime);
		if (ttl == null) {
			multi.set(this.key, this.toRedisConverter(value));
		} else {
			multi.set(this.key, this.toRedisConverter(value), 'EX', ttl);
		}
		const others = invalidateOthers ? this.otherKeys : [];
		if (others.length > 0) multi.del(...others);
		await execOrThrow(multi);
	}

	@bindThis
	public async get(): Promise<T | undefined> {
		const memoryCached = this.memoryCache.get();
		if (memoryCached !== undefined) return memoryCached;

		const cached = await this.redisClient.get(this.key);
		if (cached == null) return undefined;

		const value = this.fromRedisConverter(cached);
		if (value !== undefined) {
			this.memoryCache.set(value);
		}

		return value;
	}

	@bindThis
	public async delete(): Promise<void> {
		this.memoryCache.delete();
		await this.redisClient.del(this.key, ...this.otherKeys);
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * This awaits the call to Redis to ensure that the write succeeded, which is important for a few reasons:
	 *   * Other code uses this to synchronize changes between worker processes. A failed write can internally de-sync the cluster.
	 *   * Without an `await`, consecutive calls could race. An unlucky race could result in the older write overwriting the newer value.
	 *   * Not awaiting here makes the entire cache non-consistent. The prevents many possible uses.
	 */
	@bindThis
	public async fetch(): Promise<T> {
		const cachedValue = await this.get();
		if (cachedValue !== undefined) {
			// Cache HIT
			return cachedValue;
		}

		// Cache MISS
		const value = await this.fetcher();
		await this.write(value, false);
		return value;
	}

	@bindThis
	public async refresh() {
		const value = await this.fetcher();
		await this.set(value);

		// TODO: イベント発行して他プロセスのメモリキャッシュも更新できるようにする
	}
}

// TODO: メモリ節約のためあまり参照されないキーを定期的に削除できるようにする？

export class MemoryKVCache<T> {
	private readonly cache = new Map<string, { date: number; value: T; }>();
	private readonly gcIntervalHandle = setInterval(() => this.gc(), 1000 * 60 * 3); // 3m

	constructor(
		private readonly lifetime: number,
	) {}

	@bindThis
	/**
	 * Mapにキャッシュをセットします
	 * @deprecated これを直接呼び出すべきではない。InternalEventなどで変更を全てのプロセス/マシンに通知するべき
	 */
	public set(key: string, value: T): void {
		this.cache.set(key, {
			date: Date.now(),
			value,
		});
	}

	@bindThis
	public get(key: string): T | undefined {
		const cached = this.cache.get(key);
		if (cached == null) return undefined;
		if ((Date.now() - cached.date) > this.lifetime) {
			this.cache.delete(key);
			return undefined;
		}
		return cached.value;
	}

	@bindThis
	public delete(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetch(key: string, fetcher: () => Promise<T>, validator?: (cachedValue: T) => boolean): Promise<T> {
		const cachedValue = this.get(key);
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		this.set(key, value);
		return value;
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetchMaybe(key: string, fetcher: () => Promise<T | undefined>, validator?: (cachedValue: T) => boolean): Promise<T | undefined> {
		const cachedValue = this.get(key);
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		if (value !== undefined) {
			this.set(key, value);
		}
		return value;
	}

	@bindThis
	public gc(): void {
		const now = Date.now();

		for (const [key, { date }] of this.cache.entries()) {
			// The map is ordered from oldest to youngest.
			// We can stop once we find an entry that's still active, because all following entries must *also* be active.
			const age = now - date;
			if (age < this.lifetime) break;

			this.cache.delete(key);
		}
	}

	@bindThis
	public dispose(): void {
		clearInterval(this.gcIntervalHandle);
	}

	public get entries() {
		return this.cache.entries();
	}
}

export class MemorySingleCache<T> {
	private cachedAt: number | null = null;
	private value: T | undefined;

	constructor(
		private lifetime: number,
	) {}

	@bindThis
	public set(value: T): void {
		this.cachedAt = Date.now();
		this.value = value;
	}

	@bindThis
	public get(): T | undefined {
		if (this.cachedAt == null) return undefined;
		if ((Date.now() - this.cachedAt) > this.lifetime) {
			this.value = undefined;
			this.cachedAt = null;
			return undefined;
		}
		return this.value;
	}

	@bindThis
	public delete() {
		this.value = undefined;
		this.cachedAt = null;
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetch(fetcher: () => Promise<T>, validator?: (cachedValue: T) => boolean): Promise<T> {
		const cachedValue = this.get();
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		this.set(value);
		return value;
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetchMaybe(fetcher: () => Promise<T | undefined>, validator?: (cachedValue: T) => boolean): Promise<T | undefined> {
		const cachedValue = this.get();
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		if (value !== undefined) {
			this.set(value);
		}
		return value;
	}
}
