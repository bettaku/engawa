/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class FixChatScopeEnum1757270190346 {
    name = 'FixChatScopeEnum1757270190346'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TYPE "chat_scope_enum" AS ENUM('everyone', 'followers', 'following', 'mutual', 'none')`);
				await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "chatScope" TYPE "chat_scope_enum" USING "chatScope"::"chat_scope_enum"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "chatScope" TYPE varchar(128)`);
				await queryRunner.query(`DROP TYPE "chat_scope_enum"`);
    }
}
