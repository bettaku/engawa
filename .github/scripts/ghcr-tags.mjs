/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// GHCR のタグ操作（release-artifacts.yml から使う）
//
//   node ghcr-tags.mjs tag <tag> <sha256:digest>
//     digest の manifest をそのままのバイト列で <tag> に付ける。
//     imagetools create と違って manifest を組み直さないので、digest が変わらない。
//
//   node ghcr-tags.mjs floating <releases.json>
//     GitHub Releases（gh api --paginate --slurp の出力）から安定版を集め、
//     latest / X / X.Y が各系列の最大版を指すように付け替える（収束型）。
//
// 環境変数: GHCR_IMAGE（例: bettaku/engawa）、GHCR_USER、GHCR_TOKEN

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REGISTRY = 'https://ghcr.io';
const MANIFEST_TYPES = [
	'application/vnd.oci.image.index.v1+json',
	'application/vnd.docker.distribution.manifest.list.v2+json',
	'application/vnd.oci.image.manifest.v1+json',
	'application/vnd.docker.distribution.manifest.v2+json',
];
const STABLE_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

export function parseStable(version) {
	const m = STABLE_RE.exec(version);
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a, b) {
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}
	return 0;
}

/** 安定版の一覧から、可変タグ → 指すべき版 の対応を作る */
export function planFloating(versions) {
	const plan = new Map();
	const parsed = versions.map((v) => [v, parseStable(v)]).filter(([, p]) => p !== null);
	parsed.sort(([, a], [, b]) => compare(a, b));
	// 昇順に上書きしていくので、各タグには系列の最大版が残る
	for (const [v, [major, minor]] of parsed) {
		plan.set('latest', v);
		plan.set(`${major}`, v);
		plan.set(`${major}.${minor}`, v);
	}
	return plan;
}

/** Releases API の応答（--slurp でページの配列になっている）から安定版のタグ名を取り出す */
export function stableTagsFromReleases(pages) {
	if (!Array.isArray(pages)) throw new Error('releases JSON must be an array of pages');
	const releases = pages.flat();
	return releases.filter((r) => !r.draft && !r.prerelease && parseStable(r.tag_name) !== null).map((r) => r.tag_name);
}

export class RegistryError extends Error {}

export function createRegistry({ image, user, token, fetch = globalThis.fetch, retries = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
	let bearer = null;

	async function request(url, init = {}) {
		let lastError;
		for (let attempt = 0; attempt < retries; attempt++) {
			if (attempt > 0) await sleep(2 ** attempt * 1000);
			try {
				const res = await fetch(url, init);
				if (res.status === 429 || res.status >= 500) {
					lastError = new RegistryError(`${init.method ?? 'GET'} ${url}: HTTP ${res.status}`);
					continue;
				}
				return res;
			} catch (e) {
				lastError = e;
			}
		}
		throw lastError;
	}

	async function auth() {
		if (bearer) return bearer;
		const basic = Buffer.from(`${user}:${token}`).toString('base64');
		const res = await request(`${REGISTRY}/token?service=ghcr.io&scope=repository:${image}:pull,push`, {
			headers: { Authorization: `Basic ${basic}` },
		});
		if (!res.ok) throw new RegistryError(`token: HTTP ${res.status}`);
		bearer = (await res.json()).token;
		if (!bearer) throw new RegistryError('token: empty');
		return bearer;
	}

	async function headers(extra = {}) {
		return { Authorization: `Bearer ${await auth()}`, ...extra };
	}

	return {
		/**
		 * タグ（または digest）を照会する。
		 * - 存在する: { exists: true, digest }
		 * - 明確に存在しない（404 / MANIFEST_UNKNOWN）: { exists: false }
		 * - それ以外: RegistryError を投げる（呼び出し側はタグを一切変えずに失敗させる）
		 */
		async resolve(ref) {
			const res = await request(`${REGISTRY}/v2/${image}/manifests/${ref}`, {
				method: 'HEAD',
				headers: await headers({ Accept: MANIFEST_TYPES.join(', ') }),
			});
			if (res.status === 404) return { exists: false };
			if (!res.ok) throw new RegistryError(`HEAD ${ref}: HTTP ${res.status}`);
			const digest = res.headers.get('docker-content-digest');
			if (!digest || !DIGEST_RE.test(digest)) throw new RegistryError(`HEAD ${ref}: missing digest`);
			return { exists: true, digest };
		},

		/** digest の manifest をバイト列のまま tag に PUT する */
		async tag(tag, digest) {
			if (!DIGEST_RE.test(digest)) throw new RegistryError(`invalid digest: ${digest}`);
			const get = await request(`${REGISTRY}/v2/${image}/manifests/${digest}`, {
				headers: await headers({ Accept: MANIFEST_TYPES.join(', ') }),
			});
			if (!get.ok) throw new RegistryError(`GET ${digest}: HTTP ${get.status}`);
			const contentType = get.headers.get('content-type');
			const body = Buffer.from(await get.arrayBuffer());
			const put = await request(`${REGISTRY}/v2/${image}/manifests/${tag}`, {
				method: 'PUT',
				headers: await headers({ 'Content-Type': contentType }),
				body,
			});
			if (!put.ok) throw new RegistryError(`PUT ${tag}: HTTP ${put.status}`);
			const pushed = put.headers.get('docker-content-digest');
			if (pushed && pushed !== digest) throw new RegistryError(`PUT ${tag}: digest changed (${pushed} != ${digest})`);
		},
	};
}

/**
 * 可変タグを収束させる。照会がすべて終わるまで更新しない。
 * @returns 付け替えた [tag, version, digest] の一覧
 */
export async function syncFloating(registry, stableTags, log = console.log) {
	const candidates = [];
	for (const v of stableTags) {
		const r = await registry.resolve(v);
		if (r.exists) candidates.push([v, r.digest]);
		else log(`skip ${v}: not found in registry`);
	}
	const digestOf = new Map(candidates);
	const plan = planFloating(candidates.map(([v]) => v));

	const current = new Map();
	for (const tag of plan.keys()) {
		const r = await registry.resolve(tag);
		current.set(tag, r.exists ? r.digest : null);
	}

	const changed = [];
	for (const [tag, v] of plan) {
		const digest = digestOf.get(v);
		if (current.get(tag) === digest) continue;
		await registry.tag(tag, digest);
		changed.push([tag, v, digest]);
		log(`${tag} -> ${v} (${digest})`);
	}
	if (changed.length === 0) log('floating tags are up to date');
	return changed;
}

async function main(argv) {
	const image = process.env.GHCR_IMAGE;
	const user = process.env.GHCR_USER;
	const token = process.env.GHCR_TOKEN;
	if (!image || !user || !token) throw new Error('GHCR_IMAGE, GHCR_USER and GHCR_TOKEN are required');
	const registry = createRegistry({ image, user, token });

	const [cmd, ...args] = argv;
	if (cmd === 'tag') {
		const [tag, digest] = args;
		if (!tag || !digest) throw new Error('usage: tag <tag> <digest>');
		await registry.tag(tag, digest);
		const r = await registry.resolve(tag);
		if (!r.exists || r.digest !== digest) throw new RegistryError(`${tag} does not point to ${digest} after tagging`);
		console.log(`${tag} -> ${digest}`);
	} else if (cmd === 'floating') {
		const [file] = args;
		if (!file) throw new Error('usage: floating <releases.json>');
		const tags = stableTagsFromReleases(JSON.parse(await readFile(file, 'utf8')));
		if (tags.length === 0) {
			console.log('no stable releases; nothing to do');
			return;
		}
		await syncFloating(registry, tags);
	} else {
		throw new Error(`unknown command: ${cmd}`);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2)).catch((e) => {
		console.error(e instanceof Error ? e.message : e);
		process.exit(1);
	});
}
