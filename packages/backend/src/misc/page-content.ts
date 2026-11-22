/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * ページの旧形式のブロック（`type: 'input'`と`inputType`）を、現行の形式（`textInput`・`numberInput`）に変換する。
 * 以前はpackの中で変換してDBへ書き戻していた（P3-3）。保存済みの行はマイグレーション（`MigrateLegacyPageBlocks`）で変換し、
 * 新たに保存する内容は書き込みの側で変換するので、packは変換しない。
 * 引数の配列を直接書き換え、同じ配列を返す。
 */
export function migrateLegacyPageBlocks<T extends unknown[]>(content: T): T {
	for (const x of content) {
		if (typeof x !== 'object' || x == null) continue;
		const block = x as Record<string, unknown>;
		if (block.type === 'input') {
			if (block.inputType === 'text') {
				block.type = 'textInput';
			}
			if (block.inputType === 'number') {
				block.type = 'numberInput';
				if (block.default) block.default = parseInt(String(block.default), 10);
			}
		}
		if (Array.isArray(block.children)) {
			migrateLegacyPageBlocks(block.children);
		}
	}
	return content;
}
