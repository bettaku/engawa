/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RepositoryUrlToEngawa1792774939615 {
    name = 'RepositoryUrlToEngawa1792774939615'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/bettaku/engawa'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/bettaku/engawa/issues/new'`);
        // 既定値のまま使っているサーバーだけを移す（管理者が設定した値は変えない）
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/bettaku/engawa' WHERE "repositoryUrl" = 'https://github.com/kokonect-link/cherrypick'`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/bettaku/engawa/issues/new' WHERE "feedbackUrl" = 'https://github.com/kokonect-link/cherrypick/issues/new'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/kokonect-link/cherrypick/issues/new'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/kokonect-link/cherrypick'`);
        // UPDATE は戻さない（元から bettaku/engawa を設定していたサーバーと区別できないため）
    }
}
