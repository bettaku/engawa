/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

export function configPath(env = process.env) {
	return resolve(fileURLToPath(new URL('../.config/', import.meta.url)),
		env.CHERRYPICK_CONFIG_YML || (env.NODE_ENV === 'test' ? 'test.yml' : 'default.yml'));
}

export async function developmentHost(env = process.env) {
	const config = load(await readFile(configPath(env), 'utf8'));
	const url = config?.url ?? (env.CHERRYPICK_URL || undefined);
	return url === undefined ? undefined : new URL(url).hostname;
}
