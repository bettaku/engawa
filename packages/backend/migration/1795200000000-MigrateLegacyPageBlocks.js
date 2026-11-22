/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// src/misc/page-content.ts の migrateLegacyPageBlocks と同じ変換。マイグレーションはsrcを読み込めないので複製する
function migrate(xs) {
	let changed = false;
	for (const x of xs) {
		if (typeof x !== 'object' || x == null) continue;
		if (x.type === 'input') {
			if (x.inputType === 'text') {
				x.type = 'textInput';
				changed = true;
			}
			if (x.inputType === 'number') {
				x.type = 'numberInput';
				if (x.default) x.default = parseInt(String(x.default), 10);
				changed = true;
			}
		}
		if (Array.isArray(x.children)) {
			if (migrate(x.children)) changed = true;
		}
	}
	return changed;
}

// pre-rust-tech-debt.md P3-3: ページの旧形式のブロックを変換する。以前はpackの中で変換してDBへ書き戻していた
export class MigrateLegacyPageBlocks1795200000000 {
	name = 'MigrateLegacyPageBlocks1795200000000';

	async up(queryRunner) {
		// jsonbを文字列にしたときの形（`"type": "input"`）で候補を絞り、変換はJSで行う
		let lastId = '';
		for (;;) {
			const pages = await queryRunner.query(
				`SELECT "id", "content" FROM "page" WHERE "id" > $1 AND "content"::text LIKE '%"type": "input"%' ORDER BY "id" ASC LIMIT 100`,
				[lastId],
			);
			if (pages.length === 0) break;
			for (const page of pages) {
				if (Array.isArray(page.content) && migrate(page.content)) {
					await queryRunner.query(`UPDATE "page" SET "content" = $1 WHERE "id" = $2`, [JSON.stringify(page.content), page.id]);
				}
			}
			lastId = pages[pages.length - 1].id;
		}
	}

	async down() {
		// 変換前の形式は現行のフロントエンドが扱わないので、戻さない
	}
}
