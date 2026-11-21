/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { compareRedisStreamId, parseRedisStreamId, redisStreamIdFromParsedId } from '@/misc/redis-stream-id.js';

function cmp(a: string, b: string): number {
	const pa = parseRedisStreamId(a);
	const pb = parseRedisStreamId(b);
	if (pa == null || pb == null) throw new Error('invalid stream id');
	return Math.sign(compareRedisStreamId(pa, pb));
}

describe('misc:redis-stream-id', () => {
	test('parse', () => {
		expect(parseRedisStreamId('1700000000000-0')).toEqual({ ms: 1700000000000n, seq: 0n });
		expect(parseRedisStreamId('18446744073709551615-18446744073709551615')).toEqual({ ms: (1n << 64n) - 1n, seq: (1n << 64n) - 1n });
	});

	test.each([
		'',
		'1700000000000',
		'1700000000000-',
		'-1',
		'1-2-3',
		'a-1',
		'1-1 ',
		'18446744073709551616-0',
		'0-18446744073709551616',
	])('parse rejects %j', (id) => {
		expect(parseRedisStreamId(id)).toBeNull();
	});

	test('compares seq numerically (not lexicographically) within the same ms', () => {
		// 文字列として比較すると "…-9" > "…-10" になってしまう
		expect(cmp('1700000000000-9', '1700000000000-10')).toBe(-1);
		expect(cmp('1700000000000-10', '1700000000000-9')).toBe(1);
		expect(cmp('1700000000000-10', '1700000000000-10')).toBe(0);
	});

	test('compares ms before seq', () => {
		expect(cmp('1700000000000-99999', '1700000000001-0')).toBe(-1);
		// ms の桁数が違う場合も数値として比較する
		expect(cmp('999999999999-0', '1000000000000-0')).toBe(-1);
	});

	test('redisStreamIdFromParsedId', () => {
		expect(redisStreamIdFromParsedId({ date: 1700000000000, additional: 12345n })).toBe('1700000000000-12345');
		expect(redisStreamIdFromParsedId({ date: 0, additional: 0n })).toBe('0-0');
	});
});
