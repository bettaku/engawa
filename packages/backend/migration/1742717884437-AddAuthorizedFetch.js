/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAuthorizedFetch1742717884437 {
    name = 'AddAuthorizedFetch1742717884437'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "enableAuthorizedFetch" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableAuthorizedFetch"`);
    }
}
