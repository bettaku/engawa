import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import sharedConfig from '../shared/eslint.config.js';

export default [
	...sharedConfig,
	{
		ignores: ['**/node_modules', 'built', '@types/**/*', 'migration', 'src/models/elasticsearch/*'],
	},
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.json', './test/tsconfig.json', './test-federation/tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'import/order': ['warn', {
				groups: [
					'builtin',
					'external',
					'internal',
					'parent',
					'sibling',
					'index',
					'object',
					'type',
				],
				pathGroups: [{
					pattern: '@/**',
					group: 'external',
					position: 'after',
				}],
			}],
			'no-restricted-globals': ['error', {
				name: '__dirname',
				message: 'Not in ESModule. Use `import.meta.url` instead.',
			}, {
				name: '__filename',
				message: 'Not in ESModule. Use `import.meta.url` instead.',
			}],
		},
	},
	{
		// 環境変数はconfig/で検証してから使う（P3-4）
		files: ['src/**/*.ts'],
		ignores: ['src/config/**', 'src/boot/config-check.ts', 'src/**/*.test.ts'],
		rules: {
			'no-restricted-properties': ['error', {
				object: 'process',
				property: 'env',
				message: 'Read config.runtime (DI) or loadEnvironment() instead. Register new variables in src/config/schema.ts.',
			}],
		},
	},
];
