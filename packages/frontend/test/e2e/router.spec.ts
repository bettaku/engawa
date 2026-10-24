/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from './fixtures.js';

test.describe('Router transition', () => {
	test.describe('Redirect', () => {
		test.beforeEach(async ({ resetState, registerUser, login, skipUserSetupWizard }) => {
			await resetState();

			// インスタンス初期セットアップ
			await registerUser('admin', 'pass', true);

			// ユーザー作成
			const alice = await registerUser('alice', 'alice1234');

			// アカウント初期設定ウィザードはスキップ済みにしておく
			await skipUserSetupWizard(alice);

			await login('alice', 'alice1234');
		});

		test('redirect to user profile', async ({ page }) => {
			// テストのためだけに用意されたリダイレクト用ルートに飛ぶ
			await page.goto('/redirect-test');

			// プロフィールページのURLであることを確認する
			await expect(page).toHaveURL(/\/@alice/);
		});
	});
});
