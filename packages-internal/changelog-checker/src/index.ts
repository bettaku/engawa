/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as process from 'node:process';
import * as fs from 'node:fs';
import { checkNewRelease, checkNewTopic } from './checker.js';
import { parseChangeLog } from './parser.js';

function abort(message?: string) {
	if (message) {
		console.error(message);
	}

	process.exit(1);
}

function main() {
	if (!fs.existsSync('./CHANGELOG_ENGAWA-base.md') || !fs.existsSync('./CHANGELOG_ENGAWA-head.md')) {
		console.error('CHANGELOG_ENGAWA-base.md or CHANGELOG_ENGAWA-head.md is missing.');
		return;
	}

	const base = parseChangeLog('./CHANGELOG_ENGAWA-base.md');
	const head = parseChangeLog('./CHANGELOG_ENGAWA-head.md');

	const result = (base.length < head.length)
		? checkNewRelease(base, head)
		: checkNewTopic(base, head);

	if (!result.success) {
		abort(result.message);
		return;
	}
}

main();
