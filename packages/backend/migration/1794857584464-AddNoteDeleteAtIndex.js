/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isConcurrentIndexMigrationEnabled } from "./js/migration-config.js";

export class AddNoteDeleteAtIndex1794857584464 {
	name = 'AddNoteDeleteAtIndex1794857584464';
	transaction = isConcurrentIndexMigrationEnabled() ? false : undefined;

	async up(queryRunner) {
		if (isConcurrentIndexMigrationEnabled()) {
			const hasValidIndex = await queryRunner.query(`SELECT indisvalid FROM pg_index INNER JOIN pg_class ON pg_index.indexrelid = pg_class.oid WHERE pg_class.relname = 'IDX_note_deleteAt'`);
			if (hasValidIndex.length === 0 || hasValidIndex[0].indisvalid !== true) {
				await queryRunner.query(`DROP INDEX IF EXISTS "IDX_note_deleteAt"`);
				await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_note_deleteAt" ON "note" ("deleteAt") WHERE "deleteAt" IS NOT NULL`);
			}
		} else {
			await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_note_deleteAt" ON "note" ("deleteAt") WHERE "deleteAt" IS NOT NULL`);
		}
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_note_deleteAt"`);
	}
}
