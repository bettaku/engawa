/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// アップデートの確認先を CherryPick（kokonect-link/cherrypick）から engawa（bettaku/engawa）に変えたので、
// CherryPick のリリースを「スキップ」した記録（例: 4.16.0）は意味を失う。
// 残っていると、数字の上では engawa 1.0.0 以降より大きいため、更新の通知がずっと出なくなる。
export class ResetSkippedCherryPickVersion1792819276918 {
    name = 'ResetSkippedCherryPickVersion1792819276918'

    async up(queryRunner) {
        await queryRunner.query(`UPDATE "meta" SET "skipCherryPickVersion" = NULL, "skipVersion" = false`);
    }

    async down(queryRunner) {
        // 消したスキップの記録は戻せない
    }
}
