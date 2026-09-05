import { defineConfig, mergeConfig } from 'vitest/config';
import { getConfig } from './vite.config.js';

export default mergeConfig(getConfig(), defineConfig({
	test: {
		include: ['./test/unit/**/*.test.ts'],
		environment: 'happy-dom',
		setupFiles: ['./test/unit/setup.unit.ts'],
		deps: {
			optimizer: {
				client: {
					include: [
						'browser-image-resizer',
					],
				}
			}
		},
		includeSource: ['src/**/*.ts'],
	},
}));

