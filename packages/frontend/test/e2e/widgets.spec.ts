/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import locales from '../../../../locales/index.js';
import { byE2e, expect, test } from './fixtures.js';

// `playwright.config.ts` で `locale: 'en-US'` を指定しているため、UIのラベルは英語になる
const widgetLabels = locales['en-US']._widgets;

const WIDGETS = [
	'memo',
	'notifications',
	'timeline',
	'calendar',
	'rss',
	'trends',
	'clock',
	'activity',
	'photos',
	'digitalClock',
	'postForm',
	'slideshow',
	'serverMetric',
	'onlineUsers',
	'jobQueue',
	'button',
	'aiscript',
	'aichan',
] as const satisfies readonly (keyof typeof widgetLabels)[];

// NOTE: 連合関連のウィジェット (federation / instanceCloud) はテスト用インスタンスが
// `federation: none` で動いているためウィジェット追加の一覧に出てこない。よってここでは扱わない。

/** ホームのデフォルトウィジェットの数 */
const DEFAULT_WIDGET_COUNT = 3;

test.describe('After user signed in', () => {
	test.use({ viewport: { width: 1536, height: 960 } });

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

	test('widget edit toggle is visible', async ({ page }) => {
		await expect(byE2e(page, 'widget-edit')).toBeVisible();
	});

	test('widget select should be visible in edit mode', async ({ page }) => {
		await byE2e(page, 'widget-edit').click();
		await expect(byE2e(page, 'widget-select')).toBeVisible();
	});

	test('first widget should be removed', async ({ page }) => {
		await byE2e(page, 'widget-edit').click();
		await expect(byE2e(page, 'customize-container')).toHaveCount(DEFAULT_WIDGET_COUNT);

		const firstWidget = byE2e(page, 'customize-container').first();
		await byE2e(firstWidget, 'customize-container-remove').click();
		await expect(byE2e(page, 'customize-container')).toHaveCount(DEFAULT_WIDGET_COUNT - 1);
	});

	for (const widgetName of WIDGETS) {
		test(`${widgetName} widget should get added`, async ({ page }) => {
			const widget = byE2e(page, `mkw-${widgetName}`);

			await byE2e(page, 'widget-edit').click();

			// デフォルトのウィジェットが出揃ってから数えないと、追加後の枚数がぶれる
			await expect(byE2e(page, 'customize-container')).toHaveCount(DEFAULT_WIDGET_COUNT);
			const before = await widget.count();

			// MkSelectはネイティブの<select>ではなくポップアップメニューを開くので、項目をラベルで選ぶ
			await byE2e(page, 'widget-select').locator('[tabindex="0"]').click();
			const menu = page.getByRole('menu').last();
			await expect(menu).toBeVisible();
			await menu.getByRole('menuitem', { name: widgetLabels[widgetName], exact: true }).click();

			await byE2e(page, 'widget-add').click();

			await expect(widget).toHaveCount(before + 1);
		});
	}
});
