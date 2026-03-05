/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddSearchableByForNoteDrafts1766357899292 {
    name = 'AddSearchableByForNoteDrafts1766357899292'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_draft" ADD COLUMN "searchableBy" "note_searchableBy_enum" DEFAULT 'public' `);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "searchableBy"`);
    }
}
