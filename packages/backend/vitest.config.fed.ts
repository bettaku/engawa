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
		include: [
			'test-federation/test/**/*.test.ts',
		],
	},
});
