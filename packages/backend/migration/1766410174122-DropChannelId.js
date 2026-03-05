/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DropChannelId1766410174122 {
    name = 'DropChannelId1766410174122'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" DROP CONSTRAINT "FK_999da2bcc7efadbfe0e92d3bc19"`);
        await queryRunner.query(`ALTER TABLE "channel" DROP CONSTRAINT "FK_823bae55bd81b3be6e05cff4383"`);
        await queryRunner.query(`ALTER TABLE "channel_favorite" DROP CONSTRAINT "FK_8302bd27226605ece14842fb25a"`);
        await queryRunner.query(`ALTER TABLE "channel_favorite" DROP CONSTRAINT "FK_d3ca0db011b75ac2a940a2337d2"`);
        await queryRunner.query(`ALTER TABLE "channel_following" DROP CONSTRAINT "FK_6d8084ec9496e7334a4602707e1"`);
        await queryRunner.query(`ALTER TABLE "channel_following" DROP CONSTRAINT "FK_0e43068c3f92cab197c3d3cd86e"`);
        await queryRunner.query(`ALTER TABLE "channel_note_pining" DROP CONSTRAINT "FK_10b19ef67d297ea9de325cd4502"`);
        await queryRunner.query(`ALTER TABLE "channel_note_pining" DROP CONSTRAINT "FK_8125f950afd3093acb10d2db8a8"`);
        await queryRunner.query(`ALTER TABLE "note" DROP CONSTRAINT "FK_f22169eb10657bded6d875ac8f9"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "channel";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "channel_favorite"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "channel_following"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "channel_note_pining"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN IF EXISTS "channelId"`);
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN IF EXISTS "channelId"`);
        await queryRunner.query(`ALTER TABLE "poll" DROP COLUMN IF EXISTS "channelId"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" CREATE CONSTRAINT "FK_999da2bcc7efadbfe0e92d3bc19"`);
        await queryRunner.query(`ALTER TABLE "channel" DROP CONSTRAINT "FK_823bae55bd81b3be6e05cff4383"`);
        await queryRunner.query(`ALTER TABLE "channel_favorite" DROP CONSTRAINT "FK_8302bd27226605ece14842fb25a"`);
        await queryRunner.query(`ALTER TABLE "channel_favorite" DROP CONSTRAINT "FK_d3ca0db011b75ac2a940a2337d2"`);
        await queryRunner.query(`ALTER TABLE "channel_following" DROP CONSTRAINT "FK_6d8084ec9496e7334a4602707e1"`);
        await queryRunner.query(`ALTER TABLE "channel_following" DROP CONSTRAINT "FK_0e43068c3f92cab197c3d3cd86e"`);
        await queryRunner.query(`ALTER TABLE "channel_note_pining" DROP CONSTRAINT "FK_10b19ef67d297ea9de325cd4502"`);
        await queryRunner.query(`ALTER TABLE "channel_note_pining" DROP CONSTRAINT "FK_8125f950afd3093acb10d2db8a8"`);
        await queryRunner.query(`ALTER TABLE "note" DROP CONSTRAINT "FK_f22169eb10657bded6d875ac8f9"`);
    }
}
