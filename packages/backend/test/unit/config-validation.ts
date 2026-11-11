/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it, afterAll } from 'vitest';
import { load } from 'js-yaml';
import { configPath, parseConfigSource } from '../../src/config/parse.js';
import { createValidators, standardSchema } from '../../src/config/schema.js';
import { convertRedisOptions } from '../../src/config.js';
import { configPath as buildPath, developmentHost } from '../../../../scripts/config-path.mjs';
import cases from '../fixtures/config/cases.json' with { type: 'json' };

const fixtures = fileURLToPath(new URL('../fixtures/config/', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'engawa-config-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const env = { CHERRYPICK_CONFIG_VALIDATION: 'error' };
const base = { url: 'https://example.test', port: 3000, id: 'aid', db: { host: 'db', port: 5432, db: 'db', user: 'user' }, redis: { host: 'redis', port: 6379 } };
const path = join(dir, 'config.yml');
function check(overrides: object) {
	writeFileSync(path, JSON.stringify({ ...base, ...overrides }));
	return parseConfigSource(path, env);
}

describe('configuration validation', () => {
	const internal = createValidators();
	const artifact = JSON.parse(readFileSync(new URL('../../config.schema.json', import.meta.url), 'utf8'));
	const published = new Ajv2020({ strictSchema: false }).addSchema(artifact, 'config');

	it('keeps the published JSON schema in sync', () => {
		expect(artifact).toEqual(standardSchema());
		expect(JSON.stringify(artifact)).not.toContain('"nullable":');
	});

	it.each(cases)('validates both stages of $file', c => {
		const file = join(fixtures, c.file);
		const input = load(readFileSync(file, 'utf8'));
		const { source, diagnostics } = parseConfigSource(file, { ...env, ...c.env });
		expect(internal.input(input)).toBe(c.input);
		expect(published.validate('config#/$defs/input', input)).toBe(c.input);
		expect(internal.effective(source)).toBe(c.effective);
		expect(published.validate('config#/$defs/effective', source)).toBe(c.effective);
		expect(diagnostics.every(d => d.level !== 'error')).toBe(c.input && c.effective);
		expect(source).toMatchObject(c.values);
	});

	it('accepts nullable defaults but rejects enum violations in both schemas', () => {
		for (const provider of [null, 'sqlPgroonga', 'other']) {
			const value = { ...base, fulltextSearch: { provider }, maxFileSize: null };
			expect(internal.input(value)).toBe(provider !== 'other');
			expect(published.validate('config#/$defs/input', value)).toBe(provider !== 'other');
		}
	});

	it('keeps the legacy port conversion in warn and off modes', () => {
		const file = join(fixtures, 'invalid/port.yml');
		const legacy = { PORT: '3000suffix' };
		expect(parseConfigSource(file, legacy)).toMatchObject({ source: { port: 3000 }, diagnostics: [{ path: '/port' }] });
		expect(parseConfigSource(file, legacy, 'off')).toMatchObject({ source: { port: 3000 }, diagnostics: [] });
	});

	it.each(['vueIntegration', 'browserTracingIntegration', 'replayIntegration'])('preserves absent, null and explicit %s options', key => {
		for (const integration of [{}, { [key]: null }, { [key]: { enabled: true } }]) {
			const sentryForFrontend = { options: { dsn: 'dsn', extra: null }, ...integration };
			const result = check({ sentryForFrontend });
			expect(result.diagnostics).toEqual([]);
			expect(result.source.sentryForFrontend).toEqual(sentryForFrontend);
		}
	});

	it('allows driver options but warns about typos in Redis keys', () => {
		const result = check({ redis: { ...base.redis, connectTimeout: 500, tls: { ca: 'example' }, pass: 'secret', prefix: 'app', prot: 6379 } });
		expect(result.diagnostics).toMatchObject([{ path: '/redis/prot', level: 'warning' }]);
		expect(result.source.redis).toMatchObject({ connectTimeout: 500, tls: { ca: 'example' }, pass: 'secret', prefix: 'app' });
		expect(check({ redis: { ...base.redis, connectTimeout: 'abc' } }).diagnostics)
			.toContainEqual(expect.objectContaining({ path: '/redis/connectTimeout', level: 'error' }));
	});

	it('accepts either a Redis socket path or host and port', () => {
		expect(check({ redis: { path: '/run/redis.sock' } }).diagnostics).toEqual([]);
		expect(published.validate('config#/$defs/input', { ...base, redis: { path: '/run/redis.sock' } })).toBe(true);
		expect(check({ redis: { port: 6379 } }).diagnostics).toContainEqual(expect.objectContaining({ path: '/redis/host', level: 'error' }));
	});

	it('keeps explicit ioredis password and keyPrefix options', () => {
		expect(convertRedisOptions({ host: 'redis', port: 6379 }, 'example.test')).toMatchObject({ prefix: 'example.test', keyPrefix: 'example.test:' });
		expect(convertRedisOptions({ host: 'redis', port: 6379, password: 'secret', keyPrefix: 'app:' }, 'example.test'))
			.toMatchObject({ password: 'secret', keyPrefix: 'app:' });
		expect(convertRedisOptions({ host: 'redis', port: 6379, pass: 'pass', password: 'secret' }, 'example.test'))
			.toMatchObject({ password: 'pass' });
	});

	it('limits Meilisearch string ports to the valid range', () => {
		const meilisearch = { host: 'host', apiKey: 'key', index: 'idx' };
		for (const [port, valid] of [['7700', true], ['65535', true], ['0', false], ['65536', false]] as const) {
			const errors = check({ meilisearch: { ...meilisearch, port } }).diagnostics.filter(d => d.level === 'error');
			expect(errors.length === 0).toBe(valid);
		}
	});

	it('requires connection settings for the selected search engine', () => {
		for (const provider of ['meilisearch', 'elasticsearch']) {
			expect(check({ fulltextSearch: { provider } }).diagnostics)
				.toContainEqual(expect.objectContaining({ path: '/' + provider, level: 'error' }));
			expect(check({ fulltextSearch: { provider }, [provider]: null }).diagnostics)
				.toContainEqual(expect.objectContaining({ path: '/' + provider, level: 'error' }));
		}
		expect(check({ fulltextSearch: null }).diagnostics).toEqual([]);
		expect(published.validate('config#/$defs/input', { ...base, fulltextSearch: null })).toBe(true);
		expect(published.validate('config#/$defs/input', { ...base, fulltextSearch: { provider: 'elasticsearch' } })).toBe(false);
	});

	it('treats a null outgoingAddressFamily as unset', () => {
		expect(check({ outgoingAddressFamily: null }).diagnostics).toEqual([]);
		expect(published.validate('config#/$defs/input', { ...base, outgoingAddressFamily: null })).toBe(true);
	});

	it('rejects non-HTTP URLs and unknown validation modes', () => {
		expect(check({ url: 'file:///tmp/site' }).diagnostics)
			.toContainEqual(expect.objectContaining({ path: '/url', level: 'error' }));
		expect(() => parseConfigSource(path, { CHERRYPICK_CONFIG_VALIDATION: 'erorr' })).toThrow('CHERRYPICK_CONFIG_VALIDATION');
	});

	it('reports deprecated and unknown options as warnings with escaped JSON pointers', () => {
		const { diagnostics } = check({ 'old/key~': 1, signToActivityPubGet: true, outgoingAddressFamily: 'dual', fulltextSearch: { provider: 'meilisearch' }, meilisearch: { host: 'host', port: 7700, apiKey: 'key', index: 'idx' } });
		expect(diagnostics.map(d => d.path).sort()).toEqual(['/fulltextSearch/provider', '/meilisearch', '/old~1key~0', '/outgoingAddressFamily', '/signToActivityPubGet']);
		expect(diagnostics.every(d => d.level === 'warning')).toBe(true);
	});

	it('masks nested credentials, malformed containers and YAML syntax errors', () => {
		const marker = 'private-value';
		const { diagnostics } = check({ db: { ...base.db, pass: [marker] }, redis: marker, sentryForFrontend: { options: { dsn: [marker] } } });
		expect(diagnostics).toContainEqual(expect.objectContaining({ path: '/db/pass', actual: '<redacted>' }));
		expect(JSON.stringify(diagnostics)).not.toContain(marker);
		writeFileSync(path, 'setupPassword: [' + marker);
		expect(() => parseConfigSource(path, env)).toThrow('Invalid YAML syntax.');
	});

	it('validates trustProxy and search scope unions', () => {
		for (const trustProxy of [false, 'loopback', ['127.0.0.1'], 2]) expect(check({ trustProxy }).diagnostics).toEqual([]);
		expect(check({ trustProxy: {} }).diagnostics.length).toBeGreaterThan(0);
		for (const scope of ['local', 'global', ['test'], 42]) {
			const { diagnostics } = check({ elasticsearch: { host: 'host', port: 9200, index: 'idx', user: 'u', pass: '', scope } });
			expect(diagnostics.length === 0).toBe(scope !== 42);
		}
	});

	it('uses matching build-time and runtime paths and URL precedence', async () => {
		for (const settings of [{}, { NODE_ENV: 'test' }, { CHERRYPICK_CONFIG_YML: 'custom.yml' }, { CHERRYPICK_CONFIG_YML: path }]) {
			expect(configPath(settings)).toBe(buildPath(settings));
		}
		const settings = { CHERRYPICK_CONFIG_YML: path, CHERRYPICK_URL: 'https://env.test' };
		check({ url: null });
		expect(await developmentHost(settings)).toBe(new URL(parseConfigSource(path, settings).source.url ?? '').hostname);
		check({ url: '' });
		expect(parseConfigSource(path, settings).diagnostics).toContainEqual(expect.objectContaining({ path: '/url' }));
		await expect(developmentHost(settings)).rejects.toThrow();
	});
});
