export class AddSearchableBy1725875666723 {
    name = 'AddSearchableBy1725875666723'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TYPE "note_searchableBy_enum" AS ENUM('public', 'followers', 'reacted', 'limited')`);
				await queryRunner.query(`ALTER TABLE "note" ADD "searchableBy" "note_searchableBy_enum" NOT NULL DEFAULT 'public'`);
    }

    async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "searchableBy"`);
			await queryRunner.query(`DROP TYPE "note_searchableBy_enum"`);
    }
}
