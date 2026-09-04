/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ADMIN_SETUP_PASSWORD, byE2e, expect, test } from './fixtures.js';
import type { CreatedUser } from './fixtures.js';

test.describe('Before setup instance', () => {
	test.beforeEach(async ({ resetState }) => {
		await resetState();
	});

	test('successfully loads', async ({ visitHome }) => {
		await visitHome();
	});

	test('setup instance', async ({ page, visitHome }) => {
		await visitHome();

		const signup = page.waitForResponse(res => res.url().includes('/api/admin/accounts/create') && res.request().method() === 'POST');

		await byE2e(page, 'admin-initial-password').locator('input').fill(ADMIN_SETUP_PASSWORD);
		await byE2e(page, 'admin-username').locator('input').fill('admin');
		await byE2e(page, 'admin-password').locator('input').fill('admin1234');
		await byE2e(page, 'admin-ok').click();

		await signup;

		const updateMeta = page.waitForResponse(res => res.url().includes('/api/admin/update-meta') && res.request().method() === 'POST');

		await byE2e(page, 'next').click();
		await byE2e(page, 'server-name').locator('input').fill('Testskey');
		await byE2e(page, 'server-setup-wizard-apply').click();

		await updateMeta;
	});
});

test.describe('After setup instance', () => {
	test.beforeEach(async ({ resetState, registerUser }) => {
		await resetState();

		// インスタンス初期セットアップ
		await registerUser('admin', 'pass', true);
	});

	test('successfully loads', async ({ visitHome }) => {
		await visitHome();
	});

	test('signup', async ({ page, visitHome }) => {
		await visitHome();

		const signup = page.waitForResponse(res => res.url().includes('/api/signup') && res.request().method() === 'POST');

		await byE2e(page, 'signup').click();
		await expect(byE2e(page, 'signup-rules-continue')).toBeDisabled();
		await byE2e(page, 'signup-rules-notes-agree', 'switch-toggle').click();
		await byE2e(page, 'modal-dialog-ok').click();
		await expect(byE2e(page, 'signup-rules-continue')).toBeEnabled();
		await byE2e(page, 'signup-rules-continue').click();

		await expect(byE2e(page, 'signup-submit')).toBeDisabled();
		await byE2e(page, 'signup-username').locator('input').fill('alice');
		await expect(byE2e(page, 'signup-submit')).toBeDisabled();
		await byE2e(page, 'signup-password').locator('input').fill('alice1234');
		await expect(byE2e(page, 'signup-submit')).toBeDisabled();
		await byE2e(page, 'signup-password-retype').locator('input').fill('alice1234');
		await expect(byE2e(page, 'signup-submit')).toBeDisabled();
		await byE2e(page, 'signup-invitation-code').locator('input').fill('test-invitation-code');
		await expect(byE2e(page, 'signup-submit')).toBeEnabled();
		await byE2e(page, 'signup-submit').click();

		await signup;
	});

	test('signup with duplicated username', async ({ page, registerUser, visitHome }) => {
		await registerUser('alice', 'alice1234');

		await visitHome();

		// ユーザー名が重複している場合の挙動確認
		await byE2e(page, 'signup').click();
		await expect(byE2e(page, 'signup-rules-continue')).toBeDisabled();
		await byE2e(page, 'signup-rules-notes-agree', 'switch-toggle').click();
		await byE2e(page, 'modal-dialog-ok').click();
		await expect(byE2e(page, 'signup-rules-continue')).toBeEnabled();
		await byE2e(page, 'signup-rules-continue').click();

		await byE2e(page, 'signup-username').locator('input').fill('alice');
		await byE2e(page, 'signup-password').locator('input').fill('alice1234');
		await byE2e(page, 'signup-password-retype').locator('input').fill('alice1234');
		await expect(byE2e(page, 'signup-submit')).toBeDisabled();
	});
});

test.describe('After user signup', () => {
	let admin: CreatedUser;
	let alice: CreatedUser;

	test.beforeEach(async ({ resetState, registerUser }) => {
		await resetState();

		// インスタンス初期セットアップ
		admin = await registerUser('admin', 'pass', true);

		// ユーザー作成
		alice = await registerUser('alice', 'alice1234');
	});

	test('successfully loads', async ({ visitHome }) => {
		await visitHome();
	});

	test('signin', async ({ login }) => {
		await login('alice', 'alice1234');
	});

	test('suspend', async ({ page, request, visitHome }) => {
		const res = await request.post('/api/admin/suspend-user', {
			data: {
				i: admin.token,
				userId: alice.id,
			},
		});
		expect(res.ok()).toBe(true);

		await visitHome();

		await byE2e(page, 'signin').click();

		await expect(byE2e(page, 'signin-page-input')).toBeVisible();
		await byE2e(page, 'signin-username').locator('input').fill('alice');
		await byE2e(page, 'signin-username').locator('input').press('Enter');

		await expect(page.getByText(/アカウントが凍結されています|This account has been suspended due to/i).first()).toBeVisible();
	});
});

test.describe('After user signed in', () => {
	test.beforeEach(async ({ resetState, registerUser, login }) => {
		await resetState();

		// インスタンス初期セットアップ
		await registerUser('admin', 'pass', true);

		// ユーザー作成
		await registerUser('alice', 'alice1234');

		await login('alice', 'alice1234');
	});

	test('successfully loads', async ({ page }) => {
		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		await expect(byE2e(page, 'user-setup-continue')).toBeVisible({ timeout: 30_000 });
	});

	test('account setup wizard', async ({ page }) => {
		const continueButton = byE2e(page, 'user-setup-continue');

		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		await expect(continueButton).toBeVisible({ timeout: 30_000 });
		await continueButton.click();

		await byE2e(page, 'user-setup-user-name').locator('input').fill('ありす');
		await byE2e(page, 'user-setup-user-description').locator('textarea').fill('ほげ');
		// TODO: アイコン設定テスト

		await continueButton.click();

		// プライバシー設定
		await continueButton.click();

		// フォントサイズ設定
		await continueButton.click();

		// ぼかし効果設定
		await continueButton.click();

		// MFMとアニメーション画像設定
		await continueButton.click();

		// フォローはスキップ
		await continueButton.click();

		// プッシュ通知設定はスキップ
		await continueButton.click();

		// 完了ページ（チュートリアル開始ボタンとは別のセレクターで閉じる）
		await expect(byE2e(page, 'user-setup-start-tutorial')).toBeVisible();
		await byE2e(page, 'user-setup-complete').click();
	});
});

test.describe('After user setup', () => {
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

	test('note', async ({ page }) => {
		await expect(byE2e(page, 'open-post-form')).toBeVisible();
		await byE2e(page, 'open-post-form').click();
		await byE2e(page, 'post-form-text').fill('Hello, CherryPick!');
		await byE2e(page, 'open-post-form-submit').click();

		await expect(page.getByText('Hello, CherryPick!').first()).toBeVisible({ timeout: 15_000 });
	});

	test('open note form with hotkey', async ({ page }) => {
		// Wait until the page loads
		await expect(byE2e(page, 'open-post-form')).toBeVisible();

		// `code` を差し替えて発火させ、QWERTY以外のキーボードでもホットキーが効くことを確認する。
		// ホットキーのハンドラー登録が終わる前に発火すると取りこぼすので、開くまで投げ直す
		await expect(async () => {
			await page.evaluate(() => {
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyL', bubbles: true }));
			});

			// See if the form is opened
			await expect(byE2e(page, 'post-form-text')).toBeVisible({ timeout: 1_000 });
		}).toPass({ timeout: 30_000 });

		// Close it
		await page.evaluate(() => {
			(document.activeElement ?? document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
		});

		// See if the form is closed
		await expect(byE2e(page, 'post-form-text')).toBeHidden();
	});
});

// TODO: 投稿フォームの公開範囲指定のテスト
// TODO: 投稿フォームのファイル添付のテスト
// TODO: 投稿フォームのハッシュタグ保持フィールドのテスト
