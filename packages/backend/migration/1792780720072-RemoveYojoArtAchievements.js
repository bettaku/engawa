/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// yojo-art 由来の実績（setNameToYojo, ohayoujo1/7/30/365）は ACHIEVEMENT_TYPES から削除済み。
// 獲得済みの記録が user_profile.achievements に残っていれば取り除く。
const NAMES = `'setNameToYojo', 'ohayoujo1', 'ohayoujo7', 'ohayoujo30', 'ohayoujo365'`;

export class RemoveYojoArtAchievements1792780720072 {
    name = 'RemoveYojoArtAchievements1792780720072'

    async up(queryRunner) {
        await queryRunner.query(`
            UPDATE "user_profile" SET "achievements" = (
                SELECT COALESCE(jsonb_agg(a ORDER BY ord), '[]'::jsonb)
                FROM jsonb_array_elements("achievements") WITH ORDINALITY AS t(a, ord)
                WHERE a->>'name' NOT IN (${NAMES})
            )
            WHERE EXISTS (
                SELECT 1 FROM jsonb_array_elements("achievements") a
                WHERE a->>'name' IN (${NAMES})
            )
        `);
    }

    async down(queryRunner) {
        // 削除した記録は戻せない
    }
}
