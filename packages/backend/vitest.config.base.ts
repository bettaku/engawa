/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://vitest.dev/config/
 */

import { fileURLToPath } from 'node:url';
import type { ViteUserConfig } from 'vitest/config';

export const baseConfig = {
	resolve: {
		alias: {
			// tsconfig の paths は Vite が自動で読み込まないので明示的に指定する。
			// `@/foo/bar.js` はまず `src/foo/bar.js` に解決され、そのあと Vite の
			// TypeScript 向けの解決によって `src/foo/bar.ts` が読み込まれる。
			'@/': fileURLToPath(new URL('./src/', import.meta.url)),
		},
	},

	test: {
		// describe/test/expect などをインポートなしでも使えるようにする
		globals: true,

		environment: 'node',

		testTimeout: 60000,
		hookTimeout: 60000,

		// jest の restoreMocks 相当
		restoreMocks: true,

		// NestJS の DI コンテナや TypeORM のコネクションを抱えるテストが多く
		// メモリ使用量が大きいため、テストファイルごとにプロセスを作り直す。
		// (GitHub Actions のランナーは 2GB あたりで落ちる)
		pool: 'forks',
		maxWorkers: 1,
		isolate: true,
		maxConcurrency: 32,
		logHeapUsage: true,

		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage',
			reporter: ['text', 'json', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
		},
	},
} as const satisfies ViteUserConfig;
