/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { relativeFetch, signup } from '../utils.js';
import fixture from '../fixtures/api/input-rules.json' with { type: 'json' };
import type * as misskey from 'cherrypick-js';

type Case = {
	rule: string;
	name: string;
	request: {
		method: 'GET' | 'POST' | 'MULTIPART';
		endpoint: string;
		query?: Record<string, string>;
		body?: Record<string, unknown>;
		fields?: Record<string, string>;
		auth: 'none' | 'user' | 'invalid';
	};
	expect: {
		status: number;
		error?: { code: string; id?: string; info?: Record<string, unknown> };
		length?: { path: string; value: number };
	};
};

// P2-6: 入力規則（useDefaults、未知の引数、GET・multipartでの変換、infoの形式、確認の順序）を固定する
describe('APIの入力規則', () => {
	let alice: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'input_rules' });
	}, 1000 * 60 * 2);

	test.each((fixture.cases as Case[]).map(c => [`${c.rule}: ${c.name}`, c] as const))('%s', async (_, c) => {
		const { request } = c;
		const headers: Record<string, string> = {};
		if (request.auth === 'user') headers.Authorization = `Bearer ${alice.token}`;
		if (request.auth === 'invalid') headers.Authorization = 'Bearer no-such-token';

		let res: Awaited<ReturnType<typeof relativeFetch>>;
		if (request.method === 'GET') {
			res = await relativeFetch(`api/${request.endpoint}?${new URLSearchParams(request.query ?? {})}`, { headers });
		} else if (request.method === 'POST') {
			res = await relativeFetch(`api/${request.endpoint}`, {
				method: 'POST',
				headers: { ...headers, 'Content-Type': 'application/json' },
				body: JSON.stringify(request.body ?? {}),
			});
		} else {
			const form = new FormData();
			for (const [k, v] of Object.entries(request.fields ?? {})) form.append(k, v);
			form.append('file', new Blob(['input rules']), 'input-rules.txt');
			res = await relativeFetch(`api/${request.endpoint}`, { method: 'POST', headers, body: form });
		}

		const body = res.status === 204 ? null : await res.json() as Record<string, unknown>;
		assert.strictEqual(res.status, c.expect.status, JSON.stringify(body));

		if (c.expect.error) {
			const error = (body as { error: Record<string, unknown> }).error;
			assert.strictEqual(error.code, c.expect.error.code);
			if (c.expect.error.id) assert.strictEqual(error.id, c.expect.error.id);
			if (c.expect.error.info) assert.deepStrictEqual({ ...error.info as object, ...c.expect.error.info }, error.info);
		}

		if (c.expect.length) {
			const value = c.expect.length.path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], body);
			assert.ok(Array.isArray(value));
			assert.strictEqual(value.length, c.expect.length.value);
		}
	});
});
