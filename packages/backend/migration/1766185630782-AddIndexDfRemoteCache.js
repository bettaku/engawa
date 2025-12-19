export class AddIndexDfRemoteCache1766185630782 {
    name = 'AddIndexDfRemoteCache1766185630782'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_06491459e0de1dd8ee1b86ee4d7368a2" ON "drive_file" ("user_host", "is_link", "id") WHERE "drive_file"."user_host" IS NOT NULL AND "is_link" = false;`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_06491459e0de1dd8ee1b86ee4d7368a2";`);
    }
}
