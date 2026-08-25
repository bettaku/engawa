/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ADMIN_SETUP_PASSWORD, expect, test } from './fixtures.js';
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

		await page.locator('[data-cy-admin-initial-password] input').fill(ADMIN_SETUP_PASSWORD);
		await page.locator('[data-cy-admin-username] input').fill('admin');
		await page.locator('[data-cy-admin-password] input').fill('admin1234');
		await page.locator('[data-cy-admin-ok]').click();

		await signup;

		const updateMeta = page.waitForResponse(res => res.url().includes('/api/admin/update-meta') && res.request().method() === 'POST');

		await page.locator('[data-cy-next]').click();
		await page.locator('[data-cy-server-name] input').fill('Testskey');
		await page.locator('[data-cy-server-setup-wizard-apply]').click();

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

		await page.locator('[data-cy-signup]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeDisabled();
		await page.locator('[data-cy-signup-rules-notes-agree] [data-cy-switch-toggle]').click();
		await page.locator('[data-cy-modal-dialog-ok]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeEnabled();
		await page.locator('[data-cy-signup-rules-continue]').click();

		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-username] input').fill('alice');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-password] input').fill('alice1234');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-password-retype] input').fill('alice1234');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-invitation-code] input').fill('test-invitation-code');
		await expect(page.locator('[data-cy-signup-submit]')).toBeEnabled();
		await page.locator('[data-cy-signup-submit]').click();

		await signup;
	});

	test('signup with duplicated username', async ({ page, registerUser, visitHome }) => {
		await registerUser('alice', 'alice1234');

		await visitHome();

		// ユーザー名が重複している場合の挙動確認
		await page.locator('[data-cy-signup]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeDisabled();
		await page.locator('[data-cy-signup-rules-notes-agree] [data-cy-switch-toggle]').click();
		await page.locator('[data-cy-modal-dialog-ok]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeEnabled();
		await page.locator('[data-cy-signup-rules-continue]').click();

		await page.locator('[data-cy-signup-username] input').fill('alice');
		await page.locator('[data-cy-signup-password] input').fill('alice1234');
		await page.locator('[data-cy-signup-password-retype] input').fill('alice1234');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
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

		await page.locator('[data-cy-signin]').click();

		await expect(page.locator('[data-cy-signin-page-input]')).toBeVisible();
		await page.locator('[data-cy-signin-username] input').fill('alice');
		await page.locator('[data-cy-signin-username] input').press('Enter');

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
		await expect(page.locator('[data-cy-user-setup-continue]')).toBeVisible({ timeout: 30_000 });
	});

	test('account setup wizard', async ({ page }) => {
		const continueButton = page.locator('[data-cy-user-setup-continue]');

		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		await expect(continueButton).toBeVisible({ timeout: 30_000 });
		await continueButton.click();

		await page.locator('[data-cy-user-setup-user-name] input').fill('ありす');
		await page.locator('[data-cy-user-setup-user-description] textarea').fill('ほげ');
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

		await continueButton.click();
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
		await expect(page.locator('[data-cy-open-post-form]')).toBeVisible();
		await page.locator('[data-cy-open-post-form]').click();
		await page.locator('[data-cy-post-form-text]').fill('Hello, CherryPick!');
		await page.locator('[data-cy-open-post-form-submit]').click();

		await expect(page.getByText('Hello, CherryPick!').first()).toBeVisible({ timeout: 15_000 });
	});

	test('open note form with hotkey', async ({ page }) => {
		// Wait until the page loads
		await expect(page.locator('[data-cy-open-post-form]')).toBeVisible();

		// `code` を差し替えて発火させ、QWERTY以外のキーボードでもホットキーが効くことを確認する
		await page.evaluate(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyL', bubbles: true }));
		});

		// See if the form is opened
		await expect(page.locator('[data-cy-post-form-text]')).toBeVisible();

		// Close it
		await page.evaluate(() => {
			(document.activeElement ?? document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
		});

		// See if the form is closed
		await expect(page.locator('[data-cy-post-form-text]')).toBeHidden();
	});
});

// TODO: 投稿フォームの公開範囲指定のテスト
// TODO: 投稿フォームのファイル添付のテスト
// TODO: 投稿フォームのハッシュタグ保持フィールドのテスト
