export class DropGoogleAnalytics1766182962234 {
    name = 'DropGoogleAnalytics1766182962234'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "googleAnalyticsMeasurementId"`);
    }

    async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "googleAnalyticsMeasurementId" character varying(64)`);
    }
}
