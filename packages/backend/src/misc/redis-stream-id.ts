/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Redis Stream ID（`<ms>-<seq>`）。`ms` と `seq` はどちらも符号なし64ビット整数で、
 * Redis は `ms` → `seq` の順に数値として比較する。文字列として比較すると、
 * 同じミリ秒で `seq` の桁数が違うときに順序を誤る（例: `"1-9" > "1-10"`）。
 */
export type RedisStreamId = {
	ms: bigint;
	seq: bigint;
};

const STREAM_ID_REGEXP = /^(\d{1,20})-(\d{1,20})$/;
const UINT64_MAX = (1n << 64n) - 1n;

/**
 * `<ms>-<seq>` 形式の文字列を解析する。形式が違う、または64ビットに収まらない場合は `null` を返す。
 */
export function parseRedisStreamId(id: string): RedisStreamId | null {
	const match = STREAM_ID_REGEXP.exec(id);
	if (match == null) return null;

	const ms = BigInt(match[1]);
	const seq = BigInt(match[2]);
	if (ms > UINT64_MAX || seq > UINT64_MAX) return null;

	return { ms, seq };
}

/**
 * 2つの Redis Stream ID を Redis と同じ規則（`ms` → `seq` の数値順）で比較する。
 * a < b なら負、a = b なら 0、a > b なら正を返す。
 */
export function compareRedisStreamId(a: RedisStreamId, b: RedisStreamId): number {
	if (a.ms !== b.ms) return a.ms < b.ms ? -1 : 1;
	if (a.seq !== b.seq) return a.seq < b.seq ? -1 : 1;
	return 0;
}

/**
 * IDの解析結果（`IdService.parseFull`）から、通知のStreamに書き込む Stream ID を作る。
 * `date` はIDの時刻部分（ミリ秒）、`additional` は時刻以外の部分を数値にしたもの。
 */
export function redisStreamIdFromParsedId(parsed: { date: number; additional: bigint; }): string {
	return `${parsed.date}-${parsed.additional}`;
}
