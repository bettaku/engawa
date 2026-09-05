/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
	testDir: './test/e2e/',
	// DBを共有するため並列実行はできない
	fullyParallel: false,
	workers: 1,
	forbidOnly: isCI,
	retries: isCI ? 2 : 0,
	timeout: 60_000,
	reporter: isCI ? [['list'], ['html', { outputFolder: './test/e2e/report/', open: 'never' }]] : 'list',
	expect: {
		timeout: 10_000,
	},
	outputDir: './test/e2e/artifacts/',
	use: {
		locale: 'en-US',
		baseURL: process.env.CHERRYPICK_URL ?? 'http://localhost:61812',
		headless: true,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		video: 'off',
	},
	projects: [{
		name: 'chromium',
		use: {
			browserName: 'chromium',
		},
	}, {
		name: 'firefox',
		use: {
			browserName: 'firefox',
		},
	}, {
		name: 'webkit',
		use: {
			browserName: 'webkit',
		},
	}],
});
