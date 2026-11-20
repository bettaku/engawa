/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * IDの順序に関する前提（docs/rust-migration/id-ordering.md）を固定するテスト。
 * タイムライン、ページング、自動削除（`id < gen(date)`）、通知の既読位置は、これらの前提に依存している。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Config } from '@/config.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { compareRedisStreamId, parseRedisStreamId, redisStreamIdFromParsedId } from '@/misc/redis-stream-id.js';
import type { DataSource } from 'typeorm';

const UINT64_MAX = (1n << 64n) - 1n;

type MethodSpec = {
	method: string;
	length: number;
	regexp: RegExp;
	/** IDの時刻部分の分解能（ミリ秒） */
	resolution: number;
	/** 時刻以外の部分を Stream ID の seq にしたとき、異なるIDが同じ値になりうるか */
	seqMayCollide: boolean;
};

const METHODS: MethodSpec[] = [
	{ method: 'aid', length: 10, regexp: /^[0-9a-z]{10}$/, resolution: 1, seqMayCollide: false },
	{ method: 'aidx', length: 16, regexp: /^[0-9a-z]{16}$/, resolution: 1, seqMayCollide: false },
	{ method: 'meid', length: 24, regexp: /^[0-9a-f]{24}$/, resolution: 1, seqMayCollide: false },
	{ method: 'meidg', length: 24, regexp: /^g[0-9a-f]{23}$/, resolution: 1, seqMayCollide: false },
	{ method: 'ulid', length: 26, regexp: /^[0-9A-HJKMNP-TV-Z]{26}$/, resolution: 1, seqMayCollide: true },
	{ method: 'objectid', length: 24, regexp: /^[0-9a-f]{24}$/, resolution: 1000, seqMayCollide: false },
];

// 2000年以降の過去の時刻（gen は未来の時刻を現在時刻に丸めるため、未来は含めない）
const TIMES = [
	946684800001, // 2000-01-01T00:00:00.001Z
	1262304000000, // 2010-01-01
	1700000000000,
	1700000000001,
	1700000000999,
	1700000001000,
	1767225600000, // 2026-01-01
];

function sign(n: number): number {
	return n < 0 ? -1 : n > 0 ? 1 : 0;
}

function jsCompare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function idService(method: string): IdService {
	return new IdService({ id: method } as Config);
}

describe('ID ordering', () => {
	describe.each(METHODS)('$method', ({ method, length, regexp, resolution, seqMayCollide }) => {
		const service = idService(method);

		function streamIdOf(id: string) {
			const parsed = parseRedisStreamId(redisStreamIdFromParsedId(service.parseFull(id)));
			if (parsed == null) throw new Error(`invalid stream id for ${id}`);
			return parsed;
		}

		function genMany(): string[] {
			const ids: string[] = [];
			for (const t of TIMES) {
				// 同じ時刻のIDを複数作り、時刻以外の部分での順序も確かめる
				for (let i = 0; i < 50; i++) ids.push(service.gen(t));
			}
			return ids;
		}

		test('固定長で、ASCIIの英数字だけからなる', () => {
			for (const id of genMany()) {
				expect(id).toHaveLength(length);
				expect(id).toMatch(regexp);
			}
		});

		test('時刻部分を復元できる（分解能で切り捨て）', () => {
			for (const t of TIMES) {
				const parsed = service.parseFull(service.gen(t));
				expect(parsed.date).toBe(Math.floor(t / resolution) * resolution);
				expect(service.parse(service.gen(t)).date.getTime()).toBe(parsed.date);
			}
		});

		test('分解能を超えて時刻が違えば、文字列として時刻順に並ぶ', () => {
			for (const t1 of TIMES) {
				for (const t2 of TIMES) {
					if (Math.floor(t1 / resolution) >= Math.floor(t2 / resolution)) continue;
					expect(service.gen(t1) < service.gen(t2)).toBe(true);
				}
			}
		});

		test('自動削除の境界: 時刻 date より前（分解能単位）に作ったIDは gen(date) より小さい', () => {
			for (const date of TIMES) {
				const boundary = service.gen(date);
				for (const t of TIMES) {
					if (Math.floor(t / resolution) >= Math.floor(date / resolution)) continue;
					for (let i = 0; i < 10; i++) expect(service.gen(t) < boundary).toBe(true);
				}
			}
		});

		test('未来の時刻を指定すると現在時刻で作る', () => {
			const before = Date.now();
			const id = service.gen(before + 1000 * 60 * 60 * 24 * 365);
			const after = Date.now();
			const date = service.parseFull(id).date;
			expect(date).toBeGreaterThanOrEqual(Math.floor(before / resolution) * resolution);
			expect(date).toBeLessThanOrEqual(after);
		});

		test('JSの文字列比較は、バイト列の比較（C照合順序）と一致する', () => {
			const ids = genMany();
			for (let i = 1; i < ids.length; i++) {
				const a = ids[i - 1];
				const b = ids[i];
				expect(sign(jsCompare(a, b))).toBe(sign(Buffer.compare(Buffer.from(a), Buffer.from(b))));
			}
		});

		test('通知の Stream ID への変換は順序を保ち、seq は64ビットに収まる', () => {
			const ids = genMany();
			for (const id of ids) {
				expect(service.parseFull(id).additional).toBeLessThanOrEqual(UINT64_MAX);
				expect(service.parseFull(id).additional).toBeGreaterThanOrEqual(0n);
			}
			for (let i = 0; i < ids.length; i++) {
				for (let j = i + 1; j < Math.min(ids.length, i + 60); j++) {
					const a = ids[i];
					const b = ids[j];
					const byStream = sign(compareRedisStreamId(streamIdOf(a), streamIdOf(b)));
					if (byStream === 0) {
						// 上位64ビットだけを使う方式では、異なるIDが同じ Stream ID になりうる（XADDが失敗し、IDを作り直す）
						if (!seqMayCollide) expect(a).toBe(b);
					} else {
						expect(byStream).toBe(sign(jsCompare(a, b)));
					}
				}
			}
		});
	});

	describe('PostgreSQL', () => {
		let app: TestingModule;
		let db: DataSource;

		beforeAll(async () => {
			app = await Test.createTestingModule({ imports: [GlobalModule] }).compile();
			db = app.get(DI.db);
		});

		afterAll(async () => {
			await app.close();
		});

		test.each(METHODS.map(m => m.method))('%s: varchar列のORDER BYと比較演算子が、JSの文字列比較と一致する', async (method) => {
			const service = idService(method);
			const ids = TIMES.flatMap(t => Array.from({ length: 20 }, () => service.gen(t)));
			const shuffled = [...ids].sort(() => Math.random() - 0.5);

			const rows: { id: string }[] = await db.query(
				'SELECT x AS id FROM unnest($1::varchar(32)[]) AS x ORDER BY x',
				[shuffled],
			);
			expect(rows.map(r => r.id)).toEqual([...ids].sort(jsCompare));

			const pivot = ids[Math.floor(ids.length / 2)];
			const less: { id: string }[] = await db.query(
				'SELECT x AS id FROM unnest($1::varchar(32)[]) AS x WHERE x < $2::varchar(32)',
				[shuffled, pivot],
			);
			expect(less.map(r => r.id).sort(jsCompare)).toEqual(ids.filter(id => id < pivot).sort(jsCompare));
		});
	});
});
