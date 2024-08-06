export class CreateScheduledNoteCreation1722954278805 {
    name = 'CreateScheduledNoteCreation1722954278805'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD COLUMN "scheduledAt" TIMESTAMP WITH TIME ZONE`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "scheduledAt"`);
    }
}
