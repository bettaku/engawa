export class RevertNoteEdit1726316959280 {
    name = 'RevertNoteEdit1726316959280'

		async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "noteEditHistory" TYPE varchar(3000)`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "noteEditHistory" TYPE varchar(5120)`);
	}
}
