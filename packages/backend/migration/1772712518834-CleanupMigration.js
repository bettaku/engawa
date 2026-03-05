export class CleanupMigration1772712518834 {
    name = 'CleanupMigration1772712518834'

    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_renote_muting_muteeId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_renote_muting_muterId"`);
        await queryRunner.query(`ALTER TYPE "note_searchableBy_enum" RENAME TO "note_searchableby_enum"`);
    }

    async down(queryRunner) {
    }
}
