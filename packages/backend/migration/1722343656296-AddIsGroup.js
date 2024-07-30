export class AddIsGroup1722343656296 {
    name = 'AddIsGroup1722343656296'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "isGroup" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isGroup"`);
    }
}
