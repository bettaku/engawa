/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { writeFileSync, existsSync } from 'node:fs';
import { execa } from 'execa';

async function main() {
	if (!process.argv.includes('--no-build')) {
		await execa('pnpm', ['run', 'build'], {
			stdout: process.stdout,
			stderr: process.stderr,
		});
	}

	if (!existsSync('./built')) {
		throw new Error('`built` directory does not exist.');
	}

	/** @type {import('../src/config.js')} */
	const { loadConfig } = await import('../built/config.js');

	/** @type {import('../src/server/api/openapi/gen-spec.js')} */
	const { genOpenapiSpec } = await import('../built/server/api/openapi/gen-spec.js');

	const config = loadConfig();
	const spec = genOpenapiSpec(config, true);

	writeFileSync('./built/api.json', JSON.stringify(spec), 'utf-8');

	// コミットする api.json（P2-6、§8-2）。APIの契約の変更をレビューで見えるようにする。
	// 設定と版に依存しない値にして、どの環境で生成しても同じ内容にする
	if (process.argv.includes('--committed')) {
		const committed = {
			...spec,
			info: { ...spec.info, version: 'unversioned' },
			servers: [{ url: 'https://example.com/api' }],
		};
		writeFileSync('./api.json', JSON.stringify(committed, null, '\t') + '\n', 'utf-8');
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
