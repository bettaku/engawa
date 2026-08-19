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
	if (!fs.existsSync('./CHANGELOG_engawa-base.md') || !fs.existsSync('./CHANGELOG_engawa-head.md')) {
		console.error('CHANGELOG_engawa-base.md or CHANGELOG_engawa-head.md is missing.');
		return;
	}

	const base = parseChangeLog('./CHANGELOG_engawa-base.md');
	const head = parseChangeLog('./CHANGELOG_engawa-head.md');

	const result = (base.length < head.length)
		? checkNewRelease(base, head)
		: checkNewTopic(base, head);

	if (!result.success) {
		abort(result.message);
		return;
	}
}

main();
