/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddSensitiveProfile1722353293595 {
    name = 'AddSensitiveProfile1722353293595'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "isSensitive" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "isSensitive"`);
    }
}
