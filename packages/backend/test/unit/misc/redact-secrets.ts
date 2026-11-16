/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { redactSecrets, scrubSecrets } from '@/misc/redact-secrets.js';

describe('redactSecrets', () => {
	test('機密キーの値を伏せ、それ以外は残す', () => {
		const { redacted, secrets } = redactSecrets({
			i: 'native-token-value',
			password: 'hunter2-password',
			newPassword: 'next-password',
			token: 'totp-123456',
			text: 'hello',
			limit: 10,
		});

		expect(redacted).toStrictEqual({
			i: '[REDACTED]',
			password: '[REDACTED]',
			newPassword: '[REDACTED]',
			token: '[REDACTED]',
			text: 'hello',
			limit: 10,
		});
		expect(secrets).toEqual(expect.arrayContaining(['native-token-value', 'hunter2-password', 'next-password', 'totp-123456']));
		expect(secrets).not.toContain('hello');
	});

	test('入れ子のオブジェクトと配列の中も伏せる', () => {
		const { redacted, secrets } = redactSecrets({
			credential: { id: 'cred-id-value', response: { signature: 'sig-value' } },
			items: [{ secret: 'nested-secret' }, { name: 'visible' }],
		});

		expect(redacted).toStrictEqual({
			credential: '[REDACTED]',
			items: [{ secret: '[REDACTED]' }, { name: 'visible' }],
		});
		expect(secrets).toEqual(expect.arrayContaining(['cred-id-value', 'sig-value', 'nested-secret']));
	});

	test('nullやundefinedの値はそのままにする', () => {
		const { redacted, secrets } = redactSecrets({ password: null, token: undefined });
		expect(redacted).toStrictEqual({ password: null, token: undefined });
		expect(secrets).toStrictEqual([]);
	});

	test('元のオブジェクトを書き換えない', () => {
		const original = { password: 'hunter2-password' };
		redactSecrets(original);
		expect(original.password).toBe('hunter2-password');
	});

	test('オブジェクト以外はそのまま返す', () => {
		expect(redactSecrets(undefined).redacted).toBeUndefined();
		expect(redactSecrets('plain').redacted).toBe('plain');
	});
});

describe('scrubSecrets', () => {
	test('自由文に現れた機密値を伏せる', () => {
		const { secrets } = redactSecrets({ password: 'hunter2-password' });
		expect(scrubSecrets('incorrect password: hunter2-password (at check)', secrets))
			.toBe('incorrect password: [REDACTED] (at check)');
	});

	test('ある機密値が別の機密値に含まれていても取りこぼさない', () => {
		const { secrets } = redactSecrets({ password: 'abcd', token: 'abcd-efgh' });
		expect(scrubSecrets('abcd-efgh / abcd', secrets)).toBe('[REDACTED] / [REDACTED]');
	});

	test('文字列でなければそのまま返す', () => {
		expect(scrubSecrets(undefined, ['secret'])).toBeUndefined();
	});
});
