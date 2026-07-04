/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddChatRoomUriHost1783194302667 {
    name = 'AddChatRoomUriHost1783194302667'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "uri" character varying(512)`);
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "host" character varying(128)`);
        await queryRunner.query(`COMMENT ON COLUMN "chat_room"."uri" IS 'The federation URI of the room. it will be null when the room is local.'`);
        await queryRunner.query(`COMMENT ON COLUMN "chat_room"."host" IS '[Denormalized] The host of the room. it will be null when the room is local.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_room_uri" ON "chat_room" ("uri")`);
        await queryRunner.query(`CREATE INDEX "IDX_chat_room_host" ON "chat_room" ("host")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_host"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_uri"`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "host"`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "uri"`);
    }
}
