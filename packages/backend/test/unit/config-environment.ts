/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { schema } from '../../src/config/schema.js';

describe('environment variables', () => {
	it('treats empty values as unset and reads CP_* flags as before', () => {
		const { options, diagnostics } = parseEnvironment({ CP_ONLY_QUEUE: '1', CP_ONLY_SERVER: '', CP_VERBOSE: 'yes' });
		expect(options).toMatchObject({ onlyQueue: true, onlyServer: false, verbose: true, quiet: false, disableClustering: false });
		expect(diagnostics).toEqual([]);
	});

	it('warns that 0 and false still enable a flag', () => {
		const { options, diagnostics } = parseEnvironment({ CP_QUIET: '0', CP_WITH_LOG_TIME: 'False' });
		expect(options).toMatchObject({ quiet: true, withLogTime: true });
		expect(diagnostics).toEqual([
			expect.objectContaining({ level: 'warning', path: '$CP_QUIET', actual: '"0"' }),
			expect.objectContaining({ level: 'warning', path: '$CP_WITH_LOG_TIME', actual: '"False"' }),
		]);
	});

	it('forces the test options when NODE_ENV=test', () => {
		const { options } = parseEnvironment({ NODE_ENV: 'test' });
		expect(options).toMatchObject({ quiet: true, disableClustering: true, noDaemons: true });
	});

	it('warns about unknown CP_* and CHERRYPICK_* variables but ignores the rest', () => {
		const { diagnostics } = parseEnvironment({ CP_ONLY_QUEU: '1', CHERRYPICK_CONFIG: 'x.yml', HOME: '/home/user', MISSKEY_FOO: '1' });
		expect(diagnostics).toEqual([
			{ level: 'warning', path: '$CP_ONLY_QUEU', message: 'Unknown environment variable.' },
			{ level: 'warning', path: '$CHERRYPICK_CONFIG', message: 'Unknown environment variable.' },
		]);
	});

	it('reports an invalid NODE_ENV and keeps treating it as non-production', () => {
		const { runtime, diagnostics } = parseEnvironment({ NODE_ENV: 'prod' });
		expect(diagnostics).toEqual([expect.objectContaining({ level: 'error', path: '$NODE_ENV', actual: '"prod"' })]);
		expect(runtime.nodeEnv).toBeUndefined();
		expect(runtime.production).toEqual({ rateLimit: false, blockPrivateAddresses: false, requireHttps: false, removeTempFiles: false });
		expect(runtime.test.skipCaptcha).toBe(false);
	});

	it('rejects malformed values without echoing free-form ones', () => {
		const { runtime, diagnostics } = parseEnvironment({ VITE_PORT: 'abc', MISSKEY_TEST_CHECK_DUPLICATED_TOTP: 'true', DATABASE_PASSWORD: 'secret', API_RES_VALIDATION_REPORT: '/tmp/report' });
		expect(diagnostics).toEqual([
			expect.objectContaining({ level: 'error', path: '$VITE_PORT', actual: '"abc"' }),
			expect.objectContaining({ level: 'error', path: '$MISSKEY_TEST_CHECK_DUPLICATED_TOTP', actual: '"true"' }),
		]);
		expect(runtime.development.vitePort).toBe(5173);
		expect(JSON.stringify(diagnostics)).not.toContain('secret');
	});

	it('accepts only ports between 1 and 65535', () => {
		for (const port of ['1', '5173', '65535']) expect(parseEnvironment({ EMBED_VITE_PORT: port }).diagnostics).toEqual([]);
		for (const port of ['0', '65536', '99999', '05173']) {
			expect(parseEnvironment({ EMBED_VITE_PORT: port }).diagnostics).toEqual([expect.objectContaining({ level: 'error', path: '$EMBED_VITE_PORT' })]);
		}
	});

	it('enables the production protections only in production', () => {
		const production = parseEnvironment({ NODE_ENV: 'production' }).runtime;
		expect(production.production).toEqual({ rateLimit: true, blockPrivateAddresses: true, requireHttps: true, removeTempFiles: true });
		expect(Object.values(production.test).filter(v => v === true)).toEqual([]);
		expect(production.development).toMatchObject({ validateApiResponses: false, allowCrossOriginFiles: false });

		const development = parseEnvironment({ NODE_ENV: 'development', VITE_PORT: '3001', API_RES_VALIDATION_REPORT: '/tmp/report' }).runtime;
		expect(development.development).toEqual({ vitePort: 3001, embedVitePort: 5174, allowCrossOriginFiles: true, validateApiResponses: true, apiResponseValidationReport: '/tmp/report' });
		expect(development.production.rateLimit).toBe(false);
	});

	it('maps the test escape hatches and their opt-outs', () => {
		expect(parseEnvironment({ NODE_ENV: 'test' }).runtime.test).toMatchObject({
			resetSchema: true,
			skipCaptcha: true,
			skipTotpVerification: true,
			skipOAuthClientIpCheck: true,
			allowHttpOAuthClient: true,
			followRemoteImmediately: false,
			webfingerUseHttp: false,
			accountMoveUnfollowDelay: 10000,
		});
		expect(parseEnvironment({ NODE_ENV: 'test', MISSKEY_TEST_CHECK_DUPLICATED_TOTP: '1', CHERRYPICK_TEST_CHECK_IP_RANGE: '1' }).runtime.test)
			.toMatchObject({ skipTotpVerification: false, skipOAuthClientIpCheck: false });
		// NODE_ENVにかかわらず効くもの
		expect(parseEnvironment({ NODE_ENV: 'production', FORCE_FOLLOW_REMOTE_USER_FOR_TESTING: 'true', CHERRYPICK_WEBFINGER_USE_HTTP: 'TRUE' }).runtime.test)
			.toMatchObject({ followRemoteImmediately: true, webfingerUseHttp: true, skipTotpVerification: false });
	});

	it('lists every variable mapped from the configuration file', () => {
		const names = Object.keys(schema.$defs.environment.properties);
		const mapped = JSON.stringify(schema.$defs.input).matchAll(/"x-env":"(\w+)"/g);
		for (const [, name] of mapped) expect(names).toContain(name);
	});
});
