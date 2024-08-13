const { MigrationInterface, QueryRunner } = require("typeorm");

module.exports = class AddBubbleInstancies1723473047301 {
    name = 'AddBubbleInstancies1723473047301'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "bubbleInstancies" text array NOT NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "bubbleInstancies"`);
    }
}
