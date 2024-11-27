export class NoteReferenced1732707357797 {
    name = 'NoteReferenced1732707357797'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "note_referenced" (
						"id" character varying(32) NOT NULL,
						"userId" character varying(32) NOT NULL,
						"noteId" character varying(32) NOT NULL,
						"referencedNoteId" character varying(32)  array NOT NULL,
						CONSTRAINT "PK_note_referenced_id" PRIMARY KEY ("id"),
						CONSTRAINT "FK_note_referenced_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
						CONSTRAINT "FK_note_referenced_noteId" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE
					) `
				);
				await queryRunner.query(`CREATE UNIQUE INDEX "IDX_note_referenced" ON "note_referenced" ("userId", "noteId", "referencedNoteId")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "IDX_note_referenced"`);
				await queryRunner.query(`DROP TABLE "note_referenced"`);
    }
}
