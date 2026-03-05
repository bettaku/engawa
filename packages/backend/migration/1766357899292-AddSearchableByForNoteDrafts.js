export class AddSearchableByForNoteDrafts1766357899292 {
    name = 'AddSearchableByForNoteDrafts1766357899292'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_draft" ADD COLUMN "searchableBy" "note_searchableby_enum" DEFAULT 'public' `);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "searchableBy"`);
    }
}
