/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddCircleSearchableBy1777029630008 {
    name = 'AddCircleSearchableBy1777029630008'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TYPE "note_searchableby_enum" ADD VALUE 'circle'`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        // PostgreSQL does not support removing enum values directly.
        // Update any existing 'circle' rows to 'limited' before downgrading.
        await queryRunner.query(`UPDATE "note" SET "searchableBy" = 'limited' WHERE "searchableBy" = 'circle'`);
        await queryRunner.query(`UPDATE "note_draft" SET "searchableBy" = 'limited' WHERE "searchableBy" = 'circle'`);
    }
}
