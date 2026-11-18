/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddReactionBakeLedger1795000000000 {
	name = 'AddReactionBakeLedger1795000000000';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "reaction_bake_ledger" ("batchId" character varying(64) NOT NULL, "appliedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_e94fdf6971b75bebaf8ed0212cd" PRIMARY KEY ("batchId"))`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "reaction_bake_ledger"`);
	}
}
