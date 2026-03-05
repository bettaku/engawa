/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DropGoogleAnalytics1766182962234 {
    name = 'DropGoogleAnalytics1766182962234'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "googleAnalyticsMeasurementId"`);
    }

    async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "googleAnalyticsMeasurementId" character varying(64)`);
    }
}
