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
				await this.migratePage(queryRunner, page);
			}
			lastId = pages[pages.length - 1].id;
		}
	}

	/**
	 * 読み取った内容のままのときだけ書き戻す。その間にページが編集されていたら（更新が0件）、読み直して変換し直す
	 */
	async migratePage(queryRunner, page) {
		let current = page;
		for (let i = 0; i < 10; i++) {
			if (!Array.isArray(current.content)) return;
			const original = JSON.stringify(current.content);
			if (!migrate(current.content)) return;
			const [, affected] = await queryRunner.query(
				`UPDATE "page" SET "content" = $1 WHERE "id" = $2 AND "content" = $3::jsonb`,
				[JSON.stringify(current.content), current.id, original],
			);
			if (affected > 0) return;
			const rows = await queryRunner.query(`SELECT "id", "content" FROM "page" WHERE "id" = $1`, [current.id]);
			if (rows.length === 0) return;
			current = rows[0];
		}
		throw new Error(`Failed to migrate page ${page.id}: it kept being updated during the migration`);
	}

	async down() {
		// 変換前の形式は現行のフロントエンドが扱わないので、戻さない
	}
}
