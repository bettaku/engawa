/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddUserIsSystem1739973243292 {
    name = 'AddUserIsSystem1739973243292'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "isSystem" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isSystem"`);
    }
}
