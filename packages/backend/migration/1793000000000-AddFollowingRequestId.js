/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isConcurrentIndexMigrationEnabled } from "./js/migration-config.js";

export class AddFollowingRequestId1793000000000 {
	name = 'AddFollowingRequestId1793000000000';
	transaction = isConcurrentIndexMigrationEnabled() ? false : undefined;

	async up(queryRunner) {
		// Without a transaction, a failed index build leaves the column behind, so keep this re-runnable.
		await queryRunner.query(`ALTER TABLE "following" ADD COLUMN IF NOT EXISTS "requestId" character varying(512)`);
		await queryRunner.query(`COMMENT ON COLUMN "following"."requestId" IS 'id of Follow Activity.'`);

		const concurrently = isConcurrentIndexMigrationEnabled();

		if (concurrently) {
			const hasValidIndex = await queryRunner.query(`SELECT indisvalid FROM pg_index INNER JOIN pg_class ON pg_index.indexrelid = pg_class.oid WHERE pg_class.relname = 'IDX_2831d60e203984101bb63db0b0'`);
			if (hasValidIndex.length === 0 || hasValidIndex[0].indisvalid !== true) {
				await queryRunner.query(`DROP INDEX IF EXISTS "IDX_2831d60e203984101bb63db0b0"`);
				await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_2831d60e203984101bb63db0b0" ON "following" ("requestId")`);
			}
		} else {
			await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_2831d60e203984101bb63db0b0" ON "following" ("requestId")`);
		}
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_2831d60e203984101bb63db0b0"`);
		await queryRunner.query(`ALTER TABLE "following" DROP COLUMN IF EXISTS "requestId"`);
	}
}
