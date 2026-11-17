/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddNoteDraftPostedAt1794940000000 {
	name = 'AddNoteDraftPostedAt1794940000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note_draft" ADD "postedNoteId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "note_draft" ADD "postedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "note_draft" ADD "postAttempts" integer NOT NULL DEFAULT 0`);
		await queryRunner.query(`CREATE INDEX "IDX_note_draft_scheduledAt_pending" ON "note_draft" ("scheduledAt") WHERE "isActuallyScheduled" = true AND "postedAt" IS NULL`);
		await queryRunner.query(`CREATE INDEX "IDX_note_draft_postedAt" ON "note_draft" ("postedAt") WHERE "postedAt" IS NOT NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_note_draft_postedAt"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_note_draft_scheduledAt_pending"`);
		await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "postAttempts"`);
		await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "postedAt"`);
		await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "postedNoteId"`);
	}
}
