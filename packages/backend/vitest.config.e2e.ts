/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.base.js';

export default defineConfig({
	...baseConfig,
	test: {
		...baseConfig.test,
		// built/ 以下は swc でビルド済みの JS なので、Vite の変換パイプラインを
		// 通さずに Node のネイティブ ESM として読み込ませる。
		// (変換を通すとモジュールの実体が二重になり、DI が壊れる)
		server: {
			deps: {
				external: [/\/built(-test)?\//],
			},
		},
		globalSetup: ['./built-test/entry.js'],
		setupFiles: ['./test/vitest.setup.ts'],
		include: [
			'test/e2e/**/*.ts',
		],
	},
});
