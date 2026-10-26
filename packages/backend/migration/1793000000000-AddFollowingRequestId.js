/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddFollowingRequestId1793000000000 {
	name = 'AddFollowingRequestId1793000000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "following" ADD "requestId" character varying(512)`);
		await queryRunner.query(`COMMENT ON COLUMN "following"."requestId" IS 'id of Follow Activity.'`);
		await queryRunner.query(`CREATE INDEX "IDX_2831d60e203984101bb63db0b0" ON "following" ("requestId") `);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_2831d60e203984101bb63db0b0"`);
		await queryRunner.query(`ALTER TABLE "following" DROP COLUMN "requestId"`);
	}
}
