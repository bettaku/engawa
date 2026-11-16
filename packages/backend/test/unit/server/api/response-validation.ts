/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type { Schema } from '@/misc/json-schema.js';
import { ResponseValidator } from '@/server/api/response-validation.js';
import endpoints from '@/server/api/endpoints.js';

function ep(res?: Schema) {
	return { name: 'test/endpoint', meta: { res } };
}

describe('ResponseValidator', () => {
	const objectRes = {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', optional: false, nullable: false, format: 'misskey:id' },
			createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
			name: { type: 'string', optional: false, nullable: true },
			note: { type: 'string', optional: true, nullable: false },
		},
	} as const satisfies Schema;

	test('定義どおりの応答は違反にならない', () => {
		const validator = new ResponseValidator();
		expect(validator.validate(ep(objectRes), { id: 'abc123', createdAt: '2026-01-01T00:00:00.000Z', name: null })).toBeNull();
	});

	test('Dateと値がundefinedのプロパティは、JSONにした後の形で検証する', () => {
		const validator = new ResponseValidator();
		expect(validator.validate(ep(objectRes), { id: 'abc123', createdAt: new Date(0), name: 'a', note: undefined })).toBeNull();
	});

	test('必須プロパティの欠落と型の不一致を報告する', () => {
		const validator = new ResponseValidator();
		const violation = validator.validate(ep(objectRes), { id: 1, createdAt: '2026-01-01T00:00:00.000Z' });
		expect(violation?.kind).toBe('schema-mismatch');
		expect(violation?.errors.map(e => e.instancePath)).toEqual(expect.arrayContaining(['', '/id']));
	});

	test('nullableでないプロパティのnullを報告する', () => {
		const validator = new ResponseValidator();
		const violation = validator.validate(ep(objectRes), { id: 'abc123', createdAt: null, name: null });
		expect(violation?.errors.map(e => e.instancePath)).toEqual(['/createdAt']);
	});

	test('refを解決して検証する', () => {
		const validator = new ResponseValidator();
		const res = {
			type: 'array',
			optional: false, nullable: false,
			items: { type: 'object', optional: false, nullable: false, ref: 'EmojiSimple' },
		} as const satisfies Schema;

		expect(validator.validate(ep(res), [{ aliases: [], name: 'a', category: null, url: 'https://example.com/a.png' }])).toBeNull();
		expect(validator.validate(ep(res), [{ name: 'a' }])?.kind).toBe('schema-mismatch');
	});

	test('resがないのに値を返した場合を報告する', () => {
		const validator = new ResponseValidator();
		expect(validator.validate(ep(), undefined)).toBeNull();
		expect(validator.validate(ep(), 204)?.kind).toBe('unexpected-body');
		expect(validator.validate(ep(), { affected: 1 })?.kind).toBe('unexpected-body');
	});

	test('resがあるのに値を返さなかった場合を報告する', () => {
		const validator = new ResponseValidator();
		expect(validator.validate(ep(objectRes), undefined)?.kind).toBe('missing-body');
		expect(validator.validate(ep({ ...objectRes, nullable: true }), null)).toBeNull();
	});

	test('応答を書き換えない', () => {
		const validator = new ResponseValidator();
		const response = { id: 'abc123', createdAt: new Date(0), name: null, extra: 1 };
		const snapshot = { ...response };
		validator.validate(ep(objectRes), response);
		expect(response).toStrictEqual(snapshot);
	});

	test('dedupeは配列の添字だけが違う違反を1件にまとめる', () => {
		const validator = new ResponseValidator();
		const res = { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } } as const satisfies Schema;

		const first = validator.validate(ep(res), [1, 2]);
		expect(first).not.toBeNull();
		if (first == null) return;
		expect(validator.dedupe(first)?.errors).toHaveLength(1);

		const second = validator.validate(ep(res), [3]);
		expect(second).not.toBeNull();
		if (second == null) return;
		expect(validator.dedupe(second)).toBeNull();
	});

	test('すべてのエンドポイントのresをコンパイルできる', () => {
		const validator = new ResponseValidator();
		const failures = endpoints
			.filter(e => e.meta.res != null)
			// 値は何でもよい。invalid-schemaにならないことだけを確認する
			.map(e => validator.validate(e, {}))
			.filter(v => v?.kind === 'invalid-schema')
			.map(v => `${v?.endpoint}: ${v?.errors[0]?.message}`);

		expect(failures).toStrictEqual([]);
	});
});
