/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddIndexDfRemoteCache1766185630782 {
    name = 'AddIndexDfRemoteCache1766185630782'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_06491459e0de1dd8ee1b86ee4d7368a2" ON "drive_file" ("userHost", "isLink", "id") WHERE "drive_file"."userHost" IS NOT NULL AND "isLink" = false;`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_06491459e0de1dd8ee1b86ee4d7368a2";`);
    }
}
