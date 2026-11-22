/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { migrateLegacyPageBlocks } from '@/misc/page-content.js';
import { MigrateLegacyPageBlocks1795200000000 } from '../../../migration/1795200000000-MigrateLegacyPageBlocks.js';

describe('migrateLegacyPageBlocks（P3-3）', () => {
	test('旧形式のinputを、textInput・numberInputに変換する（子のブロックも）', () => {
		const content = [
			{ type: 'input', inputType: 'text', name: 'a' },
			{ type: 'section', children: [{ type: 'input', inputType: 'number', default: '42' }] },
			{ type: 'text', text: 'x' },
		];

		expect(migrateLegacyPageBlocks(content)).toEqual([
			{ type: 'textInput', inputType: 'text', name: 'a' },
			{ type: 'section', children: [{ type: 'numberInput', inputType: 'number', default: 42 }] },
			{ type: 'text', text: 'x' },
		]);
	});

	test('マイグレーションは、旧形式を含む行だけを同じ規則で書き換える', async () => {
		const rows = [
			{ id: 'a', content: [{ type: 'input', inputType: 'text' }] },
			{ id: 'b', content: [{ type: 'input', inputType: 'unknown' }] },
		];
		const updates: unknown[][] = [];
		const queryRunner = {
			query: async (sql: string, params: unknown[]) => {
				if (sql.startsWith('SELECT')) return rows.filter(r => r.id > (params[0] as string));
				updates.push(params);
				return [];
			},
		};

		await new MigrateLegacyPageBlocks1795200000000().up(queryRunner);

		expect(updates).toEqual([[JSON.stringify([{ type: 'textInput', inputType: 'text' }]), 'a']]);
	});
});
