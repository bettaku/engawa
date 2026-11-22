/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// pre-rust-tech-debt.md P3-1: ノートの作成・更新・削除の後処理のoutboxと、Renoteを計上したかどうかの記録
export class AddNoteOutbox1795100000000 {
	name = 'AddNoteOutbox1795100000000';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "note_outbox" ("seq" BIGSERIAL NOT NULL, "type" character varying(16) NOT NULL, "noteId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "doneSteps" character varying(32) array NOT NULL DEFAULT '{}', "attempts" integer NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_479dd3c6e40560df772bb598524" PRIMARY KEY ("seq"))`);
		await queryRunner.query(`CREATE INDEX "IDX_NOTE_OUTBOX_NOTE_ID_SEQ" ON "note_outbox" ("noteId", "seq") `);
		// 列の追加だけで、既存の行は書き換えない（nullは「この列より前に作成した」を表す）
		await queryRunner.query(`ALTER TABLE "note" ADD "renoteCounted" boolean`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "renoteCounted"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_NOTE_OUTBOX_NOTE_ID_SEQ"`);
		await queryRunner.query(`DROP TABLE "note_outbox"`);
	}
}
