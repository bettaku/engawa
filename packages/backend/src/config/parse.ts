/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { createValidators, schema } from './schema.js';
import type { ValidateFunction } from 'ajv';
import type { ConfigInput } from './types.js';

export function configPath(env = process.env) {
	return resolve(
		fileURLToPath(new URL('../../../../.config/', import.meta.url)),
		env.CHERRYPICK_CONFIG_YML ||
			(env.NODE_ENV === 'test' ? 'test.yml' : 'default.yml'),
	);
}

export type Diagnostic = {
	level: 'error' | 'warning';
	path: string;
	message: string;
	actual?: string;
};
export const formatDiagnostic = (d: Diagnostic) =>
	`${d.path || '(root)'} ${d.message}${d.actual === undefined ? '' : ` (got ${d.actual})`}`;
export class ConfigValidationError extends Error {
	constructor(public readonly diagnostics: Diagnostic[]) {
		super(diagnostics.map(formatDiagnostic).join('\n'));
	}
}

const record = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const escapeKey = (key: string) =>
	key.replaceAll('~', '~0').replaceAll('/', '~1');

type Field = {
	type?: string;
	enum?: readonly unknown[];
	$ref?: string;
	anyOf?: readonly unknown[];
	properties?: Record<string, Field>;
	items?: Field;
	description?: string;
	'x-deprecation'?: string;
	'x-null-as-unset'?: boolean;
	'x-secret'?: boolean;
};

function prepare(
	value: unknown,
	field: Field,
	path: string,
	warnings: Diagnostic[],
): unknown {
	const deprecated = field['x-deprecation'];
	if (
		deprecated ||
		(path === '/fulltextSearch/provider' && value === 'meilisearch')
	) {
		const message =
			deprecated === 'no-effect'
				? 'This option has no effect.'
				: deprecated === 'migration-only'
					? 'Used only during migration. Use the admin settings afterwards.'
					: (field.description ??
						'Scheduled for removal (https://github.com/bettaku/engawa/issues/325)');
		warnings.push({ level: 'warning', path, message });
	}
	if (path === '/id' && typeof value === 'string') return value.toLowerCase();
	if (!record(value) || !field.properties) return value;
	const result = { ...value };
	for (const [key, child] of Object.entries(field.properties)) {
		if (!Object.hasOwn(result, key)) continue;
		if (result[key] === null && child['x-null-as-unset']) delete result[key];
		else result[key] = prepare(
			result[key],
			child,
			path + '/' + escapeKey(key),
			warnings,
		);
	}
	return result;
}

function displayValue(value: unknown, field?: Field) {
	if (field?.['x-secret']) return '<redacted>';
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	// Numeric and enum settings cannot contain connection strings. Limit the
	// rendered value even when the operator accidentally supplies a long string.
	if (field?.type === 'integer' || field?.type === 'boolean' || field?.enum) {
		if (['number', 'boolean', 'string'].includes(typeof value)) return JSON.stringify(value).slice(0, 80);
	}
	return typeof value;
}

function validate(
	check: ValidateFunction,
	value: unknown,
	diagnostics: Diagnostic[],
) {
	if (check(value)) return;
	for (const e of check.errors ?? []) {
		if (e.keyword === 'if') continue;
		const unknownKey = e.keyword === 'additionalProperties';
		const key = unknownKey
			? e.params.additionalProperty
			: e.params.missingProperty;
		const path =
			key === undefined
				? e.instancePath
				: e.instancePath + '/' + escapeKey(key);
		let actual: unknown = value;
		let field: Field | undefined = schema.$defs.input;
		for (const part of path.split('/').slice(1)) {
			const name = part.replaceAll('~1', '/').replaceAll('~0', '~');
			actual =
				record(actual) || Array.isArray(actual)
					? Reflect.get(actual, name)
					: undefined;
			field =
				field?.items ??
				(field?.properties && Object.hasOwn(field.properties, name)
					? field.properties[name]
					: undefined);
		}
		// Never echo unknown values, containers, URL credentials or malformed secrets.
		const safeValue = displayValue(actual, field);
		diagnostics.push({
			level: unknownKey ? 'warning' : 'error',
			path,
			message: unknownKey
				? 'Unknown configuration key.'
				: (e.message ?? 'Invalid value.'),
			actual: safeValue,
		});
	}
}

let validators: ReturnType<typeof createValidators> | undefined;

function applyEnv(value: unknown, env: NodeJS.ProcessEnv, strict: boolean) {
	if (!record(value)) return value;
	const result = { ...value };
	if (result.url == null && env.CHERRYPICK_URL) result.url = env.CHERRYPICK_URL;
	if (result.port == null && env.PORT !== undefined) {
		result.port =
			strict && !/^\d+$/.test(env.PORT) ? env.PORT : parseInt(env.PORT, 10);
	}
	if (record(result.db)) {
		const db = { ...result.db };
		for (const [key, variable] of Object.entries({
			db: 'DATABASE_DB',
			user: 'DATABASE_USER',
			pass: 'DATABASE_PASSWORD',
		})) {
			if (db[key] == null && env[variable]) db[key] = env[variable];
		}
		result.db = db;
	}
	return result;
}

export function parseConfigSource(
	path: string,
	env = process.env,
	mode = env.CHERRYPICK_CONFIG_VALIDATION ?? 'warn',
) {
	const data = readFileSync(path, 'utf8');
	let raw: unknown;
	try {
		raw = load(data);
	} catch {
		// js-yaml's error includes the source line, which may contain credentials.
		throw new ConfigValidationError([
			{ level: 'error', path: '', message: 'Invalid YAML syntax.' },
		]);
	}
	const diagnostics: Diagnostic[] = [];
	let source = applyEnv(raw, env, false);
	if (mode !== 'off') {
		validators ??= createValidators();
		const input = prepare(raw, schema.$defs.input, '', diagnostics);
		validate(validators.input, input, diagnostics);
		const effective = applyEnv(input, env, true);
		validate(validators.effective, effective, diagnostics);
		if (
			record(effective) &&
			typeof effective.url === 'string' &&
			!URL.canParse(effective.url)
		) {
			diagnostics.push({
				level: 'error',
				path: '/url',
				message: 'Invalid URL.',
			});
		}
		if (mode === 'error') source = effective;
	}
	return {
		source: source as ConfigInput,
		rawUrl: record(raw) ? raw.url : undefined,
		diagnostics: [
			...new Map(diagnostics.map((d) => [JSON.stringify(d), d])).values(),
		],
	};
}
