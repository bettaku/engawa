module.exports = class AddAuthorizedFetch1745746335102 {
    name = 'AddAuthorizedFetch1745746335102'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN "enableAuthorizedFetch" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN "enableBotProtectionForAuthorizedFetch" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableAuthorizedFetch"`);
				await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableBotProtectionForAuthorizedFetch"`);
    }
}
