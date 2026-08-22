/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixMigrationTests202608221787416420356 {
    name = 'FixMigrationTests202608221787416420356'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TYPE "public"."note_searchableby_enum" RENAME TO "note_searchableby_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."note_searchableby_enum" AS ENUM('public', 'followers', 'reacted', 'limited')`);
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum" USING "searchableBy"::"text"::"public"."note_searchableby_enum"`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum" USING "searchableBy"::"text"::"public"."note_searchableby_enum"`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" SET DEFAULT 'public'`);
        await queryRunner.query(`DROP TYPE "public"."note_searchableby_enum_old"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`CREATE TYPE "public"."note_searchableby_enum_old" AS ENUM('circle', 'followers', 'limited', 'public', 'reacted')`);
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum_old" USING "searchableBy"::"text"::"public"."note_searchableby_enum_old"`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum_old" USING "searchableBy"::"text"::"public"."note_searchableby_enum_old"`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" SET DEFAULT 'public'`);
        await queryRunner.query(`DROP TYPE "public"."note_searchableby_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."note_searchableby_enum_old" RENAME TO "note_searchableby_enum"`);
    }
}
