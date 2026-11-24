/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { arrayCodec, idSetCodec, nullableCodec, objectCodec, redisConverters, type ColumnKinds } from '@/misc/cache-codec.js';
import { CACHED_USER_PROFILE_COLUMNS, toCachedUserProfile, type CachedUserProfile } from '@/core/CacheService.js';
import type { MiUserProfile } from '@/models/UserProfile.js';

type Row = { id: string; createdAt: Date; deletedAt: Date | null; tags: string[]; note: string | null; };

const ROW_COLUMNS: ColumnKinds<Row> = {
	id: 'value',
	createdAt: 'date',
	deletedAt: 'date',
	tags: 'value',
	note: 'value',
};

describe('キャッシュの値の形（P2-1）', () => {
	const row = { id: 'a', createdAt: new Date('2026-01-02T03:04:05.678Z'), deletedAt: null, tags: ['x'], note: null };

	test('列挙した列だけを保存し、Date型の列を戻す', () => {
		const { toRedisConverter, fromRedisConverter } = redisConverters(objectCodec<Row>(ROW_COLUMNS));
		const raw = toRedisConverter({ ...row, secret: 'must-not-be-stored' } as Row);

		expect(JSON.parse(raw)).toEqual({ id: 'a', createdAt: '2026-01-02T03:04:05.678Z', deletedAt: null, tags: ['x'], note: null });
		expect(fromRedisConverter(raw)).toEqual(row);
		expect(fromRedisConverter(raw)?.createdAt).toBeInstanceOf(Date);
	});

	test.each([
		['JSONでない', 'not json'],
		['オブジェクトでない', '[]'],
		['列が欠けている（古い形）', JSON.stringify({ id: 'a', createdAt: '2026-01-02T03:04:05.678Z' })],
		['日付が文字列でない', JSON.stringify({ id: 'a', createdAt: 1, deletedAt: null, tags: [], note: null })],
		['日付として読めない', JSON.stringify({ id: 'a', createdAt: 'yesterday', deletedAt: null, tags: [], note: null })],
	])('期待する形でない値（%s）は、キャッシュミスとして扱う', (_, raw) => {
		const { fromRedisConverter } = redisConverters(objectCodec<Row>(ROW_COLUMNS));
		expect(fromRedisConverter(raw)).toBeUndefined();
	});

	test('IDの集合は文字列の配列で保存する', () => {
		const { toRedisConverter, fromRedisConverter } = redisConverters(idSetCodec);
		expect(toRedisConverter(new Set(['a', 'b']))).toBe('["a","b"]');
		expect(fromRedisConverter('["a","b"]')).toEqual(new Set(['a', 'b']));
		expect(fromRedisConverter('[1]')).toBeUndefined();
		expect(fromRedisConverter('{}')).toBeUndefined();
	});

	test('nullは「存在しない」ことのキャッシュとして保存する', () => {
		const { toRedisConverter, fromRedisConverter } = redisConverters(nullableCodec(objectCodec<Row>(ROW_COLUMNS)));
		expect(toRedisConverter(null)).toBe('null');
		expect(fromRedisConverter('null')).toBeNull();
	});

	test('配列は、要素が1つでも期待する形でなければキャッシュミスにする', () => {
		const { toRedisConverter, fromRedisConverter } = redisConverters(arrayCodec(objectCodec<Row>(ROW_COLUMNS)));
		const raw = toRedisConverter([row, row]);
		expect(fromRedisConverter(raw)).toEqual([row, row]);
		expect(fromRedisConverter(JSON.stringify([JSON.parse(raw)[0], { id: 'b' }]))).toBeUndefined();
	});

	test('userProfileのキャッシュは、秘密の列を保存しない', () => {
		const profile = {
			userId: 'u1',
			userHost: null,
			mutedInstances: ['muted.example.com'],
			followedMessage: 'hello',
			notificationRecieveConfig: {},
			password: '$2a$08$hash',
			twoFactorSecret: 'totp-secret',
			twoFactorTempSecret: 'temp',
			twoFactorBackupSecret: ['backup'],
			emailVerifyCode: 'code',
			email: 'alice@example.com',
		} as unknown as MiUserProfile;

		const cached = toCachedUserProfile(profile);
		expect(Object.keys(cached).sort()).toEqual(Object.keys(CACHED_USER_PROFILE_COLUMNS).sort());

		const { toRedisConverter } = redisConverters(objectCodec<CachedUserProfile>(CACHED_USER_PROFILE_COLUMNS));
		const raw = toRedisConverter(profile);
		for (const secret of ['$2a$08$hash', 'totp-secret', 'temp', 'backup', 'code', 'alice@example.com']) {
			expect(raw).not.toContain(secret);
		}
	});
});
