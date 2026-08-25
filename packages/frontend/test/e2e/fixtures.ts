/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export const ADMIN_SETUP_PASSWORD = 'example_password_please_change_this_or_you_will_get_hacked';

export type CreatedUser = {
	id: string;
	username: string;
	token: string;
};

export type Helpers = {
	/**
	 * サーバーのDBを初期状態に戻す。
	 * Playwrightはテストごとに新しいブラウザコンテキストを作るため、
	 * localStorage / indexedDB のクリアは不要。
	 */
	resetState: () => Promise<void>;

	/**
	 * APIを直接叩いてユーザーを作成する。`isAdmin` の場合はインスタンスの初期セットアップも兼ねる。
	 */
	registerUser: (username: string, password: string, isAdmin?: boolean) => Promise<CreatedUser>;

	/**
	 * トップページを開き、描画が完了するまで待つ。
	 */
	visitHome: () => Promise<void>;

	/**
	 * UIからサインインする。
	 */
	login: (username: string, password: string) => Promise<void>;

	/**
	 * アカウント初期設定ウィザードを完了済みの状態にする。
	 * ウィザードをUIから閉じると `unisonReload()` と設定の保存が競合して
	 * リロード後に再表示されることがあるため、サインイン前にレジストリを直接書き換える。
	 */
	skipUserSetupWizard: (user: CreatedUser) => Promise<void>;
};

async function resetStateImpl(request: APIRequestContext): Promise<void> {
	const res = await request.post('/api/reset-db', {
		data: {},
		timeout: 60_000,
	});
	expect(res.status(), 'failed to reset the server state').toBe(204);
}

async function registerUserImpl(request: APIRequestContext, username: string, password: string, isAdmin: boolean): Promise<CreatedUser> {
	const route = isAdmin ? '/api/admin/accounts/create' : '/api/signup';

	const res = await request.post(route, {
		data: {
			username,
			password,
			...(isAdmin ? { setupPassword: ADMIN_SETUP_PASSWORD } : {}),
		},
		timeout: 60_000,
	});
	expect(res.ok(), `failed to register ${username}: ${res.status()}`).toBe(true);

	return await res.json() as CreatedUser;
}

async function visitHomeImpl(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.locator('button').first()).toBeVisible({ timeout: 30_000 });
}

async function loginImpl(page: Page, username: string, password: string): Promise<void> {
	await visitHomeImpl(page);

	await page.locator('[data-cy-signin]').click();

	await expect(page.locator('[data-cy-signin-page-input]')).toBeVisible();
	// Enterキーで続行できるかの確認も兼ねる
	await page.locator('[data-cy-signin-username] input').fill(username);
	await page.locator('[data-cy-signin-username] input').press('Enter');

	await expect(page.locator('[data-cy-signin-page-password]')).toBeVisible({ timeout: 10_000 });

	const signin = page.waitForResponse(res => res.url().includes('/api/signin-flow') && res.request().method() === 'POST');
	// Enterキーで続行できるかの確認も兼ねる
	await page.locator('[data-cy-signin-password] input').fill(password);
	await page.locator('[data-cy-signin-password] input').press('Enter');
	await signin;

	// サインイン直後はトークンの保存とリロードが走る。
	// 完了前に次の操作へ進むと未ログイン扱いになるため、アカウントが確定するまで待つ。
	await expect.poll(
		async () => {
			try {
				return await page.evaluate(() => window.localStorage.getItem('account'));
			} catch {
				// リロード中は実行コンテキストが破棄されるので、次のポーリングまで待つ
				return null;
			}
		},
		{ message: 'the client did not persist the signed in account', timeout: 30_000 },
	).not.toBeNull();
	await expect(page.locator('button').first()).toBeVisible({ timeout: 30_000 });
}

async function skipUserSetupWizardImpl(request: APIRequestContext, user: CreatedUser): Promise<void> {
	// `store` (Pizzax) の `where: 'account'` な値はレジストリの ['client', 'base'] スコープに保存される
	const res = await request.post('/api/i/registry/set', {
		data: {
			i: user.token,
			scope: ['client', 'base'],
			key: 'accountSetupWizard',
			value: -1,
		},
	});
	expect(res.ok(), `failed to skip the account setup wizard: ${res.status()}`).toBe(true);
}

export const test = base.extend<Helpers>({
	resetState: async ({ request }, use) => {
		await use(() => resetStateImpl(request));
	},

	registerUser: async ({ request }, use) => {
		await use((username, password, isAdmin = false) => registerUserImpl(request, username, password, isAdmin));
	},

	visitHome: async ({ page }, use) => {
		await use(() => visitHomeImpl(page));
	},

	login: async ({ page }, use) => {
		await use((username, password) => loginImpl(page, username, password));
	},

	skipUserSetupWizard: async ({ request }, use) => {
		await use((user) => skipUserSetupWizardImpl(request, user));
	},
});

export { expect };
