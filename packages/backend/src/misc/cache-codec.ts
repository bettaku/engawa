/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * Redisに保存するキャッシュの値の形（pre-rust-tech-debt.md P2-1、v2のnamespace）。
 *
 * v1は、多くのキャッシュがTypeORMエンティティをそのまま`JSON.stringify`していた。そのため、保存される形はエンティティの
 * 定義（列の追加、リレーション、秘密の列）に暗黙に依存していた。v2では、キャッシュごとに保存する列を明示する。
 *
 * - 保存する列は`objectCodec`に列挙する。列挙の漏れと、Date型の列の扱いの誤りは型検査で見つかる。
 * - 読み込んだ値が期待する形でなければ`undefined`を返し、キャッシュミスとして扱う（DBから読み直す）。
 *   形を変えたときに古い値を誤って使わないようにするためで、例外にはしない。
 *
 * 一覧は docs/rust-migration/redis-keys.md を参照。
 */

/** JSONにできる値との相互変換 */
export interface JsonCodec<T> {
	encode(value: T): unknown;
	/** 期待する形でなければ`undefined` */
	decode(json: unknown): T | undefined;
}

/** `RedisKVCache`・`RedisSingleCache`の`toRedisConverter`・`fromRedisConverter`を作る */
export function redisConverters<T>(codec: JsonCodec<T>): {
	toRedisConverter: (value: T) => string;
	fromRedisConverter: (value: string) => T | undefined;
} {
	return {
		toRedisConverter: (value) => JSON.stringify(codec.encode(value)),
		fromRedisConverter: (value) => {
			let json: unknown;
			try {
				json = JSON.parse(value);
			} catch {
				return undefined;
			}
			return codec.decode(json);
		},
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value != null && !Array.isArray(value);
}

/** IDの集合。文字列の配列として保存する */
export const idSetCodec: JsonCodec<Set<string>> = {
	encode: (value) => Array.from(value),
	decode: (json) => {
		if (!Array.isArray(json) || !json.every(x => typeof x === 'string')) return undefined;
		return new Set(json);
	},
};

/**
 * 列ごとの保存の仕方。Date型（`Date | null`を含む）の列は`'date'`（ISO 8601の文字列で保存する）、ほかは`'value'`（JSONの値のまま）。
 * すべての列を列挙させるので、エンティティに列が増えたら、ここを直すまで型検査が失敗する。
 */
export type ColumnKinds<T> = {
	[K in keyof T]-?: NonNullable<T[K]> extends Date ? 'date' : 'value';
};

/** 列挙した列だけを保存する */
export function objectCodec<T extends object>(columns: ColumnKinds<T>): JsonCodec<T> {
	const entries = Object.entries(columns) as [keyof T & string, 'date' | 'value'][];
	return {
		encode: (value) => {
			const out: Record<string, unknown> = {};
			for (const [key, kind] of entries) {
				const v = value[key] as unknown;
				out[key] = kind === 'date' && v instanceof Date ? v.toISOString() : v;
			}
			return out;
		},
		decode: (json) => {
			if (!isPlainObject(json)) return undefined;
			const out: Record<string, unknown> = {};
			for (const [key, kind] of entries) {
				if (!Object.hasOwn(json, key)) return undefined;
				const v = json[key];
				if (kind === 'date' && v != null) {
					if (typeof v !== 'string') return undefined;
					const date = new Date(v);
					if (Number.isNaN(date.getTime())) return undefined;
					out[key] = date;
				} else {
					out[key] = v;
				}
			}
			return out as T;
		},
	};
}

/** 列挙した列だけを取り出す。キャッシュに入れる前に、メモリ層にも余計な列（秘密の列など）を持たせないために使う */
export function pickColumns<T extends object>(columns: ColumnKinds<T>, value: T): T {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(columns)) {
		out[key] = (value as Record<string, unknown>)[key];
	}
	return out as T;
}

/** `null`も保存する（「存在しない」ことのキャッシュ） */
export function nullableCodec<T>(codec: JsonCodec<T>): JsonCodec<T | null> {
	return {
		encode: (value) => value == null ? null : codec.encode(value),
		decode: (json) => json === null ? null : codec.decode(json),
	};
}

export function arrayCodec<T>(codec: JsonCodec<T>): JsonCodec<T[]> {
	return {
		encode: (value) => value.map(x => codec.encode(x)),
		decode: (json) => {
			if (!Array.isArray(json)) return undefined;
			const out: T[] = [];
			for (const x of json) {
				const decoded = codec.decode(x);
				if (decoded === undefined) return undefined;
				out.push(decoded);
			}
			return out;
		},
	};
}
