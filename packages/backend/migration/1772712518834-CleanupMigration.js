export class CleanupMigration1772712518834 {
    name = 'CleanupMigration1772712518834'

    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_renote_muting_muteeId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_renote_muting_muterId"`);

        await queryRunner.query(`ALTER TABLE "poll_vote" DROP CONSTRAINT IF EXISTS "FK_poll_vote_poll"`);

        // note_searchableBy_enumの再作成
        await queryRunner.query(`ALTER TYPE "note_searchableBy_enum" RENAME TO "note_searchableby_enum_old"`);
        await queryRunner.query(`CREATE TYPE "note_searchableby_enum" AS ENUM('public', 'followers', 'reacted', 'limited')`);
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum" USING "searchableBy"::"text"::"public"."note_searchableby_enum"`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum" USING "searchableBy"::"text"::"public"."note_searchableby_enum"`);
        await queryRunner.query(`ALTER TABLE "note_draft" SET DEFAULT 'public'`);
        await queryRunner.query(`DROP TYPE "public"."note_searchableby_enum_old"`);
    }

    async down(queryRunner) {
    }
}
