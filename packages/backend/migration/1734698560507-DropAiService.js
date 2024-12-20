export class DropAiService1734698560507 {
    name = 'DropAiService1734698560507'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "sensitiveMediaDetection"`);
				await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "sensitiveMediaDetectionSensitivity"`);
				await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "setSensitiveFlagAutomatically"`);
				await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableSensitiveMediaDetectionForVideos"`);
    }

    async down(queryRunner) {
    }
}
