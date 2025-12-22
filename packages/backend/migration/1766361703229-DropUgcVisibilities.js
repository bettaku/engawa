export class DropUgcVisibilities1766361703229 {
    name = 'DropUgcVisibilities1766361703229'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "ugcVisibilityForVisitor"`);
    }

    async down(queryRunner) {
    }
}
