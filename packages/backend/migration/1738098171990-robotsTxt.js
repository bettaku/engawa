/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RobotsTxt1738098171990 {
    name = 'RobotsTxt1738098171990'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "robotsTxt" character varying(2048)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "robotsTxt"`);
    }
}
