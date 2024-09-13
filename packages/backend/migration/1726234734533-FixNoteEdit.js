export class FixNoteEdit1726234734533 {
    name = 'FixNoteEdit1726234734533'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "noteEditHistory" TYPE varchar(5120)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "noteEditHistory" TYPE varchar(3000)`);
    }
}
