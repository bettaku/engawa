/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SetNoteDraftEventMetadataNullable1775658150486 {
    name = 'SetNoteDraftEventMetadataNullable1775658150486'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "eventMetadata" DROP NOT NULL`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "eventMetadata" SET NOT NULL`);
    }
}
