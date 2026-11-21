/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { toSqlVarcharArray } from '@/core/chart/core.js';

describe('toSqlVarcharArray', () => {
	test('値を16進数にして渡し、SQLとして解釈される文字を残さない', () => {
		const sql = toSqlVarcharArray(['a', '\'}\'::varchar[]); DROP TABLE "user"; --', '"x"', '\\', '{', ',']);

		// 式に現れるのは、関数名・16進数・区切りだけ
		expect(sql).toMatch(/^ARRAY\[(convert_from\(decode\('[0-9a-f]*', 'hex'\), 'UTF8'\)(, )?)+\]::varchar\[\]$/);
		expect(sql).not.toContain('DROP');
		expect(sql).not.toContain('"');
	});

	test('16進数から元の値に戻せる', () => {
		const items = ['203.0.113.7', '2001:db8::1', '\'quoted\'', '日本語'];
		const sql = toSqlVarcharArray(items);
		const decoded = [...sql.matchAll(/decode\('([0-9a-f]*)', 'hex'\)/g)].map(m => Buffer.from(m[1], 'hex').toString('utf8'));
		expect(decoded).toStrictEqual(items);
	});

	test('NUL文字を取り除く', () => {
		const sql = toSqlVarcharArray(['a\0b']);
		expect(sql).toBe('ARRAY[convert_from(decode(\'6162\', \'hex\'), \'UTF8\')]::varchar[]');
	});
});
