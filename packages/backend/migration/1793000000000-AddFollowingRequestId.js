/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddFollowingRequestId1793000000000 {
	name = 'AddFollowingRequestId1793000000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "following" ADD "requestId" character varying(512)`);
		await queryRunner.query(`COMMENT ON COLUMN "following"."requestId" IS 'id of Follow Activity.'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "following" DROP COLUMN "requestId"`);
	}
}
