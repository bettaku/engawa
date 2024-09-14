export class AcceptChatMessages1726306498002 {
    name = 'AcceptChatMessages1726306498002'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "acceptChatMessages" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "acceptChatMessages"`);
    }
}
