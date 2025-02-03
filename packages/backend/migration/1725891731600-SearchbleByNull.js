/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, noridev, cherrypick-project, esurio
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SearchbleByNull1725891731600 {
    name = 'SearchbleByNull1725891731600'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" DROP NOT NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" SET NOT NULL`);
    }
}
