/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// node --test .github/scripts/

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createRegistry, planFloating, RegistryError, stableTagsFromReleases, syncFloating } from './ghcr-tags.mjs';

const d = (n) => `sha256:${String(n).padStart(64, '0')}`;

/** resolve/tag だけを持つ偽レジストリ。errors に入れた ref は照会エラーにする */
function fakeRegistry(tags, { errors = [], missing = [] } = {}) {
	const calls = [];
	return {
		tags,
		calls,
		async resolve(ref) {
			if (errors.includes(ref)) throw new RegistryError(`HEAD ${ref}: HTTP 503`);
			if (missing.includes(ref) || !tags.has(ref)) return { exists: false };
			return { exists: true, digest: tags.get(ref) };
		},
		async tag(tag, digest) {
			calls.push([tag, digest]);
			tags.set(tag, digest);
		},
	};
}

const quiet = () => {};

describe('planFloating', () => {
	test('各系列の最大版を指す', () => {
		const plan = planFloating(['1.0.0', '1.2.0', '1.1.5', '2.0.0', '1.2.3', '2.0.1']);
		assert.deepEqual(Object.fromEntries(plan), {
			latest: '2.0.1',
			1: '1.2.3',
			'1.0': '1.0.0',
			'1.1': '1.1.5',
			'1.2': '1.2.3',
			2: '2.0.1',
			'2.0': '2.0.1',
		});
	});

	test('数値として比較する（1.10.0 > 1.9.0）', () => {
		assert.equal(planFloating(['1.9.0', '1.10.0']).get('latest'), '1.10.0');
	});

	test('安定版の形式でないものは無視する', () => {
		assert.deepEqual(Object.fromEntries(planFloating(['4.17.0-engawa20261022', '1.0.0-beta.0'])), {});
	});
});

describe('stableTagsFromReleases', () => {
	test('draft と prerelease を除き、30件を超えても全ページを使う', () => {
		const page1 = Array.from({ length: 30 }, (_, i) => ({ tag_name: `1.0.${i}`, draft: false, prerelease: false }));
		const page2 = [
			{ tag_name: '9.0.0', draft: false, prerelease: false },
			{ tag_name: '10.0.0', draft: true, prerelease: false },
			{ tag_name: '11.0.0-beta.0', draft: false, prerelease: true },
		];
		const tags = stableTagsFromReleases([page1, page2]);
		assert.equal(tags.length, 31);
		assert.equal(planFloating(tags).get('latest'), '9.0.0');
	});

	test('配列でなければエラー', () => {
		assert.throws(() => stableTagsFromReleases({ message: 'Bad credentials' }));
	});
});

describe('syncFloating', () => {
	test('旧版を再実行しても可変タグは巻き戻らない', async () => {
		const reg = fakeRegistry(
			new Map([
				['1.0.0', d(1)],
				['1.1.0', d(2)],
				['latest', d(2)],
				['1', d(2)],
				['1.0', d(1)],
				['1.1', d(2)],
			]),
		);
		const changed = await syncFloating(reg, ['1.0.0', '1.1.0'], quiet);
		assert.deepEqual(changed, []);
	});

	test('新しい版で latest / X / X.Y を付け替える', async () => {
		const reg = fakeRegistry(
			new Map([
				['1.0.0', d(1)],
				['1.1.0', d(2)],
				['latest', d(1)],
				['1', d(1)],
				['1.0', d(1)],
			]),
		);
		await syncFloating(reg, ['1.0.0', '1.1.0'], quiet);
		assert.equal(reg.tags.get('latest'), d(2));
		assert.equal(reg.tags.get('1'), d(2));
		assert.equal(reg.tags.get('1.1'), d(2));
		assert.equal(reg.tags.get('1.0'), d(1));
	});

	test('最新版の照会だけがエラーなら、何も変えずに失敗する', async () => {
		const reg = fakeRegistry(new Map([['1.0.0', d(1)], ['1.1.0', d(2)], ['latest', d(2)]]), { errors: ['1.1.0'] });
		await assert.rejects(syncFloating(reg, ['1.0.0', '1.1.0'], quiet), RegistryError);
		assert.deepEqual(reg.calls, []);
		assert.equal(reg.tags.get('latest'), d(2));
	});

	test('最新版がレジストリに存在しなければ、その版を除いて判定する', async () => {
		const reg = fakeRegistry(new Map([['1.0.0', d(1)]]));
		await syncFloating(reg, ['1.0.0', '1.1.0'], quiet);
		assert.equal(reg.tags.get('latest'), d(1));
		assert.equal(reg.tags.has('1.1'), false);
	});

	test('現在の可変タグの照会がエラーなら、何も変えずに失敗する', async () => {
		const reg = fakeRegistry(new Map([['1.0.0', d(1)]]), { errors: ['latest'] });
		await assert.rejects(syncFloating(reg, ['1.0.0'], quiet), RegistryError);
		assert.deepEqual(reg.calls, []);
	});
});

describe('createRegistry', () => {
	function fakeFetch(routes) {
		const seen = [];
		const fn = async (url, init = {}) => {
			const key = `${init.method ?? 'GET'} ${url.replace('https://ghcr.io', '')}`;
			seen.push(key);
			const route = routes[key];
			if (!route) throw new Error(`unexpected ${key}`);
			const r = typeof route === 'function' ? route(init) : route;
			return new Response(r.body ?? null, { status: r.status ?? 200, headers: r.headers ?? {} });
		};
		fn.seen = seen;
		return fn;
	}
	const token = { body: JSON.stringify({ token: 't' }) };
	const opts = { image: 'bettaku/engawa', user: 'u', token: 'x', sleep: async () => {} };

	test('404 は不存在、5xx はリトライ後にエラー', async () => {
		const fetch = fakeFetch({
			'GET /token?service=ghcr.io&scope=repository:bettaku/engawa:pull,push': token,
			'HEAD /v2/bettaku/engawa/manifests/1.0.0': { status: 404 },
			'HEAD /v2/bettaku/engawa/manifests/1.1.0': { status: 503 },
		});
		const reg = createRegistry({ ...opts, fetch });
		assert.deepEqual(await reg.resolve('1.0.0'), { exists: false });
		await assert.rejects(reg.resolve('1.1.0'), RegistryError);
		assert.equal(fetch.seen.filter((k) => k.endsWith('/1.1.0')).length, 3);
	});

	test('401 はリトライせずにエラー（不存在扱いにしない）', async () => {
		const fetch = fakeFetch({
			'GET /token?service=ghcr.io&scope=repository:bettaku/engawa:pull,push': token,
			'HEAD /v2/bettaku/engawa/manifests/1.0.0': { status: 401 },
		});
		await assert.rejects(createRegistry({ ...opts, fetch }).resolve('1.0.0'), RegistryError);
	});

	test('tag は取得したバイト列と Content-Type をそのまま PUT する', async () => {
		const body = '{"schemaVersion":2,"manifests":[]}';
		let put;
		const fetch = fakeFetch({
			'GET /token?service=ghcr.io&scope=repository:bettaku/engawa:pull,push': token,
			[`GET /v2/bettaku/engawa/manifests/${d(7)}`]: { body, headers: { 'content-type': 'application/vnd.oci.image.index.v1+json' } },
			'PUT /v2/bettaku/engawa/manifests/1.0.0': (init) => {
				put = init;
				return { status: 201, headers: { 'docker-content-digest': d(7) } };
			},
		});
		await createRegistry({ ...opts, fetch }).tag('1.0.0', d(7));
		assert.equal(put.headers['Content-Type'], 'application/vnd.oci.image.index.v1+json');
		assert.equal(Buffer.from(put.body).toString(), body);
	});

	test('PUT 後の digest が違えばエラー', async () => {
		const fetch = fakeFetch({
			'GET /token?service=ghcr.io&scope=repository:bettaku/engawa:pull,push': token,
			[`GET /v2/bettaku/engawa/manifests/${d(7)}`]: { body: '{}', headers: { 'content-type': 'application/vnd.oci.image.index.v1+json' } },
			'PUT /v2/bettaku/engawa/manifests/1.0.0': { status: 201, headers: { 'docker-content-digest': d(8) } },
		});
		await assert.rejects(createRegistry({ ...opts, fetch }).tag('1.0.0', d(7)), RegistryError);
	});
});
