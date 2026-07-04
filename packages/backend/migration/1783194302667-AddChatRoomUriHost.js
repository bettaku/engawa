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
        // Backfill legacy remote rooms. Before this migration remote rooms were mirrored
        // with id = the remote room id and no origin recorded, so they are indistinguishable
        // from local rooms. Recover the origin from the (remote) owner, matching the URI
        // format the mirror was originally addressed by (`<owner base>/chat/rooms/<id>`).
        // Rooms owned by a local user (owner host null) are left as-is (treated as local).
        await queryRunner.query(`UPDATE "chat_room" cr
            SET "host" = u."host",
                "uri" = regexp_replace(u."uri", '/users/.*$', '') || '/chat/rooms/' || cr."id"
            FROM "user" u
            WHERE cr."ownerId" = u."id" AND u."host" IS NOT NULL AND u."uri" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5319641e27338da87aa00d3b1d" ON "chat_room" ("uri") `);
        await queryRunner.query(`CREATE INDEX "IDX_17a406b7e951d3485bec6922f8" ON "chat_room" ("host") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_17a406b7e951d3485bec6922f8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5319641e27338da87aa00d3b1d"`);
        await queryRunner.query(`COMMENT ON COLUMN "chat_room"."host" IS '[Denormalized] The host of the room. it will be null when the room is local.'`);
        await queryRunner.query(`COMMENT ON COLUMN "chat_room"."uri" IS 'The federation URI of the room. it will be null when the room is local.'`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "host"`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "uri"`);
    }
}
