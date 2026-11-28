/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Rust移行計画 RUST-01（棚卸し）の機械抽出。
// 使い方: pnpm --filter backend build の後に `node scripts/rust-inventory/generate.mjs`
// 出力先: docs/rust-migration/inventory/*.csv
//
// ソースを正規表現で読むだけの静的な近似である。限界は docs/rust-migration/inventory/README.md を参照。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const backend = join(root, 'packages/backend');
const src = join(backend, 'src');
const outDir = join(root, 'docs/rust-migration/inventory');
mkdirSync(outDir, { recursive: true });

//#region helpers
function walk(dir, out = []) {
	for (const name of readdirSync(dir).sort()) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(p);
	}
	return out;
}

const rel = (p) => relative(root, p).replaceAll('\\', '/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const uniq = (xs) => [...new Set(xs)].sort();

function csv(file, header, rows) {
	const esc = (v) => {
		const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
		return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
	};
	const body = [header, ...rows].map(r => r.map(esc).join(',')).join('\n') + '\n';
	writeFileSync(join(outDir, file), body);
	console.log(`${file}: ${rows.length} rows`);
}

function git(...args) {
	try {
		return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
	} catch {
		return null;
	}
}
//#endregion

//#region entities and repositories
const entityTable = new Map(); // MiNote -> note
for (const f of walk(join(src, 'models'))) {
	const text = readFileSync(f, 'utf8');
	// 名前のない @Entity() は、TypeORMの既定の命名（クラス名のスネークケース）になる
	for (const m of text.matchAll(/@Entity\((?:'([^']+)')?\)[\s\S]*?export class (\w+)/g)) entityTable.set(m[2], m[1] ?? m[2].replace(/(?<=[a-z0-9])([A-Z])/g, '_$1').toLowerCase());
}
const repoEntity = new Map(); // NotesRepository -> MiNote
{
	const text = readFileSync(join(src, 'models/_.ts'), 'utf8');
	for (const m of text.matchAll(/export type (\w+Repository) =\s*Repository<(\w+)>/g)) repoEntity.set(m[1], m[2]);
}
// 型が`Repository<T>`そのもの（チャートの基底クラス）は、テーブルを実行時に決めるので「(dynamic)」とする
const tableOfRepo = (type) => entityTable.get(repoEntity.get(type)) ?? (type.replace(/Repository$/, '') || '(dynamic)');
const tableOfEntity = (e) => entityTable.get(e) ?? e;
//#endregion

//#region class and method index
const WRITE_OPS = 'insert|insertOne|update|delete|save|increment|decrement|upsert|remove|softDelete|restore|clear';
const REDIS_WRITE = /^(set|setex|setnx|del|unlink|incr|incrby|decr|expire|pexpire|hset|hdel|hincrby|sadd|srem|zadd|zrem|zremrangebyscore|zremrangebyrank|lpush|rpush|ltrim|lrem|xadd|xtrim|xdel|publish|rename|eval|evalsha|flushdb)$/i; // pipeline / multi は中身が読み取りのこともあるので含めない
const EXTERNAL = {
	HttpRequestService: 'http',
	DownloadService: 'http-download',
	ApRequestService: 'ap-http',
	EmailService: 'email',
	PushNotificationService: 'webpush',
	S3Service: 's3',
	InternalStorageService: 'local-storage',
	CaptchaService: 'captcha-http',
	VideoProcessingService: 'ffmpeg',
	ImageProcessingService: 'image',
	UrlPreviewService: 'summaly',
};

/** @type {Map<string, any>} */
const classes = new Map();
/** @type {Map<string, any>} */
const methods = new Map(); // "Class.method" -> node
const sites = []; // direct write sites
const redisUses = [];
const timers = [];
const caches = [];
const eventPublishes = [];
const handlerRegistrations = []; // this.noteOutboxService.registerHandler('created', this.handleCreated) のように、メソッドを値として渡す登録

const endpointFile = new Map(); // endpoint name -> abs path
{
	const text = readFileSync(join(src, 'server/api/endpoint-list.ts'), 'utf8');
	for (const m of text.matchAll(/export \* as '([^']+)' from '([^']+)'/g)) {
		const p = m[2].startsWith('@/') ? join(src, m[2].slice(2)) : join(src, 'server/api', m[2]);
		endpointFile.set(m[1], p.replace(/\.js$/, '.ts'));
	}
}
const fileEndpoint = new Map([...endpointFile].map(([k, v]) => [v, k]));

function analyseBody(cls, name, body, text, offset, file) {
	const node = {
		id: `${cls.name}.${name}`, cls: cls.name, name, file,
		line: lineOf(text, offset),
		calls: new Set(), sites: [], reads: new Set(), queues: new Set(), events: new Set(), externals: new Set(), redis: new Set(), caches: new Set(), redisWrites: new Set(),
	};
	const addSite = (table, op, idx, via) => {
		const s = { id: sites.length, table, op, method: node.id, file: rel(file), line: lineOf(text, offset + idx), via };
		sites.push(s);
		node.sites.push(s.id);
	};

	// this.<prop>.<method>(
	for (const m of body.matchAll(/this\s*\.\s*(#?\w+)\s*\.\s*(\w+)\s*(?:<[^<>()]*>)?\(/g)) {
		const type = cls.props.get(m[1]);
		if (type == null) {
			if (/^redis/i.test(m[1])) {
				node.redis.add(m[1]);
				if (REDIS_WRITE.test(m[2])) node.redisWrites.add(`${m[1]}.${m[2]}`);
				const arg = body.slice(m.index + m[0].length, m.index + m[0].length + 90).split('\n')[0];
				redisUses.push({ client: m[1], cmd: m[2], arg: arg.replace(/\s+/g, ' ').trim(), file: rel(file), line: lineOf(text, offset + m.index), method: node.id });
			}
			continue;
		}
		if (type.endsWith('Repository')) {
			const table = tableOfRepo(type);
			if (new RegExp(`^(${WRITE_OPS})$`).test(m[2])) addSite(table, m[2], m.index, 'repository');
			else if (m[2] === 'createQueryBuilder') {
				const stmt = body.slice(m.index, m.index + 1500).split(/;\s*\n/)[0];
				const w = stmt.match(/\.\s*(update|delete|insert|softDelete)\(/);
				if (w) addSite(table, w[1], m.index, 'queryBuilder');
				else node.reads.add(table);
			} else node.reads.add(table);
		} else if (/^(Redis|Memory)(KV|Single)Cache$/.test(type)) {
			node.caches.add(m[1]);
		} else if (/^Redis/.test(type) || /^redis/i.test(m[1])) {
			node.redis.add(m[1]);
			if (REDIS_WRITE.test(m[2])) node.redisWrites.add(`${m[1]}.${m[2]}`);
			const arg = body.slice(m.index + m[0].length, m.index + m[0].length + 90).split('\n')[0];
			redisUses.push({ client: m[1], cmd: m[2], arg: arg.replace(/\s+/g, ' ').trim(), file: rel(file), line: lineOf(text, offset + m.index), method: node.id });
		} else {
			node.calls.add(`${type}.${m[2]}`);
			if (type === 'QueueService') node.queues.add(m[2]);
			if (EXTERNAL[type]) node.externals.add(EXTERNAL[type]);
		}
	}
	// this.<prop>.<queue>.add(
	for (const m of body.matchAll(/this\s*\.\s*\w+\s*\.\s*(\w+Queue)\s*\.\s*(add|addBulk|remove)\(/g)) node.queues.add(`${m[1]}.${m[2]}`);
	// this.<method>(
	for (const m of body.matchAll(/this\s*\.\s*(#?\w+)\s*(?:<[^<>()]*>)?\(/g)) node.calls.add(`${cls.name}.${m[1]}`);
	// this.<prop>.registerHandler(<種類>, this.<method>)
	for (const m of body.matchAll(/this\s*\.\s*(\w+)\s*\.\s*registerHandler\(\s*[^,]+,\s*this\s*\.\s*(\w+)\s*\)/g)) {
		const type = cls.props.get(m[1]);
		if (type != null) handlerRegistrations.push({ registry: type, handler: `${cls.name}.${m[2]}` });
	}
	// entity manager: x.insert(MiNote, ...)
	for (const m of body.matchAll(new RegExp(`\\b\\w+\\s*\\.\\s*(${WRITE_OPS})\\(\\s*(Mi[A-Z]\\w+)`, 'g'))) addSite(tableOfEntity(m[2]), m[1], m.index, 'entityManager');
	// entity manager のクエリビルダー: em.createQueryBuilder().update(MiNote) / .delete().from(MiNote) / .insert().into(MiNote)
	for (const m of body.matchAll(/\.\s*createQueryBuilder\(\s*\)\s*\.\s*(?:(update)\(\s*(Mi[A-Z]\w+)|(delete|insert)\(\s*\)\s*\.\s*(?:from|into)\(\s*(Mi[A-Z]\w+))/g)) {
		addSite(tableOfEntity(m[2] ?? m[4]), m[1] ?? m[3], m.index, 'queryBuilder');
	}
	// raw SQL（DataSource・EntityManager・リポジトリの query）。SQLが文字列で書いてあれば、書き込みの文とテーブルを読む。
	// 文字列でない（変数で渡す）ものは、this.db のときだけ「(raw SQL)」として数える
	for (const m of body.matchAll(/(this\s*\.\s*db|\b(?:db|manager|em|transactionalEntityManager|queryRunner)|this\s*\.\s*\w+Repository)\s*\.\s*query\(\s*/g)) {
		const rest = body.slice(m.index + m[0].length, m.index + m[0].length + 600).replace(/^(?:\/\/[^\n]*\n\s*)+/, '');
		const quote = rest[0];
		if (!['\'', '"', '`'].includes(quote)) {
			if (/^this\s*\.\s*db$/.test(m[1])) addSite('(raw SQL)', 'query', m.index, 'raw');
			continue;
		}
		const end = rest.indexOf(quote, 1);
		const sql = rest.slice(1, end < 0 ? undefined : end);
		const seen = new Set();
		// 「FOR UPDATE」「DO UPDATE」は書き込み先ではない。テーブル名を式で組み立てるものは「(dynamic)」とする
		for (const w of sql.matchAll(/(?<!(?:FOR|DO)\s+)\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+("?\$\{[^}]*\}"?|"?\w+"?)/gi)) {
			const op = w[1].split(/\s+/)[0].toLowerCase();
			const table = w[2].includes('${') ? '(dynamic)' : w[2].replaceAll('"', '');
			if (seen.has(`${table}.${op}`)) continue;
			seen.add(`${table}.${op}`);
			addSite(table, op, m.index, 'raw');
		}
	}
	// events
	for (const m of body.matchAll(/\.\s*publish(\w+)\(([^)]{0,160})/g)) {
		const type = m[2].match(/['`]([\w:-]+)['`]/)?.[1] ?? '';
		const label = type ? `${m[1]}:${type}` : m[1];
		node.events.add(label);
		eventPublishes.push({ stream: m[1], type, file: rel(file), line: lineOf(text, offset + m.index), method: node.id });
	}
	// timers
	for (const m of body.matchAll(/\b(setInterval|setTimeout|setImmediate)\(|new (CollapsedQueue)\b/g)) {
		timers.push({ kind: m[1] ?? m[2], file: rel(file), line: lineOf(text, offset + m.index), method: node.id });
	}
	// caches
	for (const m of body.matchAll(/new (RedisKVCache|RedisSingleCache|MemoryKVCache|MemorySingleCache)\s*(?:<[^(]*>)?\(([^\n]*)/g)) {
		const tail = body.slice(m.index, m.index + 600);
		caches.push({
			kind: m[1],
			name: m[2].match(/'([^']+)'/)?.[1] ?? '',
			lifetime: tail.match(/lifetime:\s*([^,\n]+)/)?.[1]?.trim() ?? m[2].replace(/\).*$/, '').trim(),
			memoryLifetime: tail.match(/memoryCacheLifetime:\s*([^,\n]+)/)?.[1]?.trim() ?? '',
			file: rel(file), line: lineOf(text, offset + m.index), owner: cls.name,
		});
	}
	if (/(?<![.\w])fetch\(/.test(body.slice(body.indexOf('\n') + 1))) node.externals.add('fetch');
	methods.set(node.id, node);
	return node;
}

for (const file of walk(src)) {
	const text = readFileSync(file, 'utf8');
	const starts = [...text.matchAll(/^export (?:default )?(?:abstract )?class\s*(?!extends\b)(\w+)?[^\n]*$/gm)];
	for (const [i, m] of starts.entries()) {
		const end = starts[i + 1]?.index ?? text.length;
		const body = text.slice(m.index, end);
		const epName = fileEndpoint.get(file);
		const name = m[1] ?? (epName ? `EP:${epName}` : `anon:${rel(file)}`);
		const cls = { name, file, props: new Map(), methodNames: [] };
		for (const p of body.matchAll(/(?:private|public|protected)\s+(?:readonly\s+)?(#?\w+)\s*[?!]?:\s*([A-Z]\w+)/g)) cls.props.set(p[1], p[2]);
		classes.set(name, cls);

		const lines = body.split('\n');
		let pos = 0;
		let current = null;
		for (const line of lines) {
			if (current == null) {
				const mm = line.match(/^\t(?:(?:public|private|protected|static|async|override)\s+)*(?:get\s+|set\s+)?\*?(#?[A-Za-z_]\w*)\s*(?:<[^>\n]*>)?\(/);
				if (mm && !['if', 'for', 'while', 'switch', 'return', 'super'].includes(mm[1])) current = { name: mm[1], start: pos, oneLine: /(\{[^{}]*\}|;)\s*$/.test(line) };
			}
			pos += line.length + 1;
			// 終端: `\t}`、空の本体 `\t) {}`、1行で完結するメソッドやオーバーロード宣言
			if (current != null && (current.oneLine || line === '\t}' || /^\t\}[;,)]*$/.test(line) || /^\t\)[^{]*\{\s*\}$/.test(line))) {
				analyseBody(cls, current.name, body.slice(current.start, pos), text, m.index + current.start, file);
				cls.methodNames.push(current.name);
				current = null;
			}
		}
	}
}
//#endregion

//#region reachability
// 登録したハンドラーを呼ぶメソッド。値として渡したメソッドは呼び出しとして拾えないので、ここで辺を足す
const HANDLER_DISPATCHERS = {
	NoteOutboxService: 'NoteOutboxService.run',
};
for (const r of handlerRegistrations) {
	const dispatcher = methods.get(HANDLER_DISPATCHERS[r.registry]);
	if (dispatcher != null) dispatcher.calls.add(r.handler);
}

// 多数の入口から到達し、それ自体が広い副作用を持つ層（ハブ）。入口ごとの閉包はここで打ち切り、
// 「どのハブに触れるか」だけを記録する。ハブ自体の副作用は hubs.csv に1回だけ出す。
const HUBS = {
	pack: (c) => /EntityService$/.test(c.name),
	apResolve: (c) => rel(c.file).includes('/core/activitypub/models/') || ['RemoteUserResolveService', 'ApResolverService', 'ApDbResolverService'].includes(c.name),
	notify: (c) => c.name === 'NotificationService',
};
// メソッド単位のハブ。初回アクセス時に行を作るだけの処理で、ほぼすべての入口から到達する
const HUB_METHODS = {
	'MetaService.fetch': 'lazyInit',
	'SystemAccountService.fetch': 'lazyInit',
	'SystemAccountService.createCorrespondingUser': 'lazyInit',
};
const hubOf = (clsName, id) => {
	if (id != null && HUB_METHODS[id]) return HUB_METHODS[id];
	const c = classes.get(clsName);
	if (c == null) return null;
	for (const [k, f] of Object.entries(HUBS)) if (f(c)) return k;
	return null;
};

function reach(startIds, { cutHubs = true } = {}) {
	const seen = new Set();
	const stack = [...startIds];
	const startCls = new Set(startIds.map(id => methods.get(id)?.cls));
	const acc = { sites: new Set(), queues: new Set(), events: new Set(), externals: new Set(), redis: new Set(), redisWrites: new Set(), reads: new Set(), hubs: new Set() };
	while (stack.length > 0) {
		const id = stack.pop();
		if (seen.has(id)) continue;
		seen.add(id);
		const n = methods.get(id);
		if (n == null) continue;
		const hub = hubOf(n.cls, id);
		if (cutHubs && hub != null && !(startCls.has(n.cls) && !HUB_METHODS[id]) && !startIds.includes(id)) { acc.hubs.add(hub); continue; }
		for (const s of n.sites) acc.sites.add(s);
		for (const k of ['queues', 'events', 'externals', 'redis', 'redisWrites', 'reads']) for (const v of n[k]) acc[k].add(v);
		for (const c of n.calls) stack.push(c);
	}
	return acc;
}

function effects(startIds) {
	const core = reach(startIds);
	const fmt = (ids) => uniq([...ids].map(i => `${sites[i].table}.${sites[i].op}`));
	return {
		core,
		writes: fmt(core.sites),
		queues: uniq(core.queues),
		events: uniq(core.events),
		externals: uniq(core.externals),
		redis: uniq(core.redis),
		redisWrites: uniq(core.redisWrites),
		hubs: uniq(core.hubs),
	};
}

// 経路の確認用: INVENTORY_TRACE='EP:following/create>note.insert' のように指定すると、最短の呼び出し経路を表示する
function trace(startCls, target) {
	const parent = new Map();
	const queue = methodsOf(startCls);
	for (const id of queue) parent.set(id, null);
	while (queue.length > 0) {
		const id = queue.shift();
		const n = methods.get(id);
		if (n == null) continue;
		if (n.sites.some(s => `${sites[s].table}.${sites[s].op}` === target)) {
			const path = [];
			for (let c = id; c != null; c = parent.get(c)) path.unshift(c);
			return path;
		}
		for (const c of n.calls) if (!parent.has(c)) { parent.set(c, id); queue.push(c); }
	}
	return null;
}

const entries = []; // { kind, name, startIds, fx }
const methodsOf = (clsName) => (classes.get(clsName)?.methodNames ?? []).map(n => `${clsName}.${n}`);
//#endregion

//#region origin (どの上流に由来するか)
function upstreamEndpoints(ref) {
	const text = git('show', `${ref}:packages/backend/src/server/api/endpoint-list.ts`);
	if (text == null) return null;
	return new Set([...text.matchAll(/export \* as '([^']+)'/g)].map(m => m[1]));
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const misskeyRef = process.env.INVENTORY_MISSKEY_REF ?? pkg.basedMisskeyVersion ?? 'misskey/develop';
const cherrypickRef = process.env.INVENTORY_CHERRYPICK_REF ?? 'upstream/develop';
const misskeyEps = upstreamEndpoints(misskeyRef);
const cherrypickEps = upstreamEndpoints(cherrypickRef);
const originOf = (name) => {
	if (misskeyEps == null || cherrypickEps == null) return '?';
	if (misskeyEps.has(name)) return 'misskey';
	if (cherrypickEps.has(name)) return 'cherrypick';
	return 'engawa';
};

// 上流と同名のエンドポイントのうち、フォークが中身を変えたもの。由来の上流との差分の行数を `+追加/-削除` で返す
function endpointDiffs(ref) {
	const out = git('diff', '--numstat', ref, '--', 'packages/backend/src/server/api/endpoints');
	if (out == null) return null;
	const map = new Map();
	for (const line of out.split('\n')) {
		const [add, del, path] = line.split('\t');
		if (path) map.set(path, `+${add}/-${del}`);
	}
	return map;
}
const diffsFrom = { misskey: endpointDiffs(misskeyRef), cherrypick: endpointDiffs(cherrypickRef) };
const forkDiffOf = (origin, file) => {
	if (file == null || !(origin in diffsFrom)) return '';
	if (diffsFrom[origin] == null) return '?';
	return diffsFrom[origin].get(rel(file)) ?? '';
};
//#endregion

//#region tests referencing a name
const testFiles = ['test/e2e', 'test/unit'].flatMap(d => existsSync(join(backend, d)) ? walk(join(backend, d)) : []).map(f => ({ f, text: readFileSync(f, 'utf8') }));
const testsMentioning = (needle) => testFiles.filter(t => t.text.includes(`'${needle}'`) || t.text.includes(`"${needle}"`) || t.text.includes(`/api/${needle}`)).map(t => rel(t.f).replace('packages/backend/test/', ''));
//#endregion

//#region 1. API endpoints
const builtEndpoints = join(backend, 'built/server/api/endpoints.js');
if (!existsSync(builtEndpoints)) {
	console.error('packages/backend/built がありません。先に `pnpm --filter backend build` を実行してください。');
	process.exit(1);
}
const endpoints = (await import(pathToFileURL(builtEndpoints).href)).default;

const apiRows = [];
for (const ep of endpoints) {
	const meta = ep.meta;
	const file = endpointFile.get(ep.name);
	const startIds = methodsOf(`EP:${ep.name}`);
	const fx = effects(startIds);
	entries.push({ kind: 'api', name: ep.name, fx });
	const auth = meta.requireAdmin ? 'admin' : meta.requireModerator ? 'moderator' : meta.requireCredential ? 'user' : 'none';
	const effect = fx.writes.length > 0 || fx.queues.length > 0 ? 'write'
		: fx.redisWrites.length > 0 ? 'write(Redisのみ)'
		: (meta.kind ?? '').startsWith('write:') ? 'write(kindのみ)'
		: 'read';
	const limit = meta.limit ? [meta.limit.key && `key=${meta.limit.key}`, meta.limit.max != null && `max=${meta.limit.max}`, meta.limit.duration != null && `duration=${meta.limit.duration}`, meta.limit.minInterval != null && `minInterval=${meta.limit.minInterval}`].filter(Boolean).join(' ') : '';
	const tests = testsMentioning(ep.name);
	apiRows.push([
		ep.name, ep.name.split('/')[0], originOf(ep.name), auth, meta.kind ?? '', meta.secure ? 'yes' : '', meta.requiredRolePolicy ?? '',
		meta.allowGet ? 'yes' : '', meta.cacheSec ?? '', meta.requireFile ? 'yes' : '', meta.prohibitMoved ? 'yes' : '', limit,
		meta.res ? 'yes' : '', Object.keys(meta.errors ?? {}).length, effect,
		fx.writes, fx.queues, fx.events, fx.externals, fx.redisWrites, fx.hubs,
		tests.length, tests.slice(0, 5), file ? rel(file) : '', forkDiffOf(originOf(ep.name), file),
	]);
}
csv('api-endpoints.csv', [
	'endpoint', 'group', 'origin', 'auth', 'kind', 'secure', 'rolePolicy', 'allowGet', 'cacheSec', 'requireFile', 'prohibitMoved', 'rateLimit',
	'hasResSchema', 'errorCount', 'effect', 'writes', 'queues', 'events', 'externals', 'redisWrites', 'hubs',
	'testFileCount', 'testFiles', 'file', 'forkDiff',
], apiRows);
//#endregion

//#region 2. HTTP routes outside the endpoint table
const routeRows = [];
const prefixOf = { 'api/ApiServerService.ts': '/api', 'HealthServerService.ts': '/healthz' };
for (const file of walk(join(src, 'server'))) {
	const text = readFileSync(file, 'utf8');
	const short = relative(join(src, 'server'), file).replaceAll('\\', '/');
	for (const m of text.matchAll(/fastify\.(get|post|put|delete|patch|head|options|all)\s*(?:<[\s\S]*?>)?\(\s*([^,)\n]+)/g)) {
		let path = m[2].trim();
		const lit = path.match(/^['`]([^'`]*)['`]$/);
		path = lit ? lit[1] : `(${path})`;
		let prefix = prefixOf[short] ?? '';
		if (short === 'oauth/OAuth2ProviderService.ts') prefix = lineOf(text, m.index) >= 495 ? '/oauth/token' : '/oauth';
		routeRows.push([m[1].toUpperCase(), prefix + path, rel(file), lineOf(text, m.index)]);
	}
	for (const m of text.matchAll(/fastify\.register\(\s*(fastifyStatic|fastifyProxy)[\s\S]{0,300}?prefix:\s*([^,\n]+)/g)) {
		routeRows.push([m[1] === 'fastifyStatic' ? 'STATIC' : 'PROXY', m[2].trim().replace(/^['`]|['`]$/g, ''), rel(file), lineOf(text, m.index)]);
	}
}
csv('http-routes.csv', ['method', 'path', 'file', 'line'], routeRows);

// server classes as entry points (handlers are inline, so the whole class is one entry)
for (const cls of classes.values()) {
	const r = rel(cls.file);
	if (!r.startsWith('packages/backend/src/server/')) continue;
	if (r.includes('/api/endpoints/') || r.includes('/stream/channels/') || cls.name.startsWith('EP:')) continue;
	if (cls.methodNames.length === 0) continue;
	entries.push({ kind: 'server', name: cls.name, fx: effects(methodsOf(cls.name)), file: r });
}
//#endregion

//#region 2b. CLI commands (boot/cli.ts)
const cliRows = [];
{
	const text = readFileSync(join(src, 'boot/cli.ts'), 'utf8');
	const vars = new Map([...text.matchAll(/const (\w+) = app\.get\((\w+)\)/g)].map(m => [m[1], m[2]]));
	const switchBody = text.slice(text.indexOf('switch (command)'));
	// 続けて書いた case（フォールスルー）は1つの入口にまとめる
	const blocks = [];
	for (const part of switchBody.split(/\n\t(?=case )/).slice(1)) {
		if (blocks.length > 0 && !/\{/.test(blocks.at(-1))) blocks[blocks.length - 1] += `\n\t${part}`;
		else blocks.push(part);
	}
	for (const block of blocks) {
		const head = block.match(/^(?:case '[^']+':\s*)+/)?.[0] ?? '';
		const cmds = [...head.matchAll(/case '([^']+)':/g)].map(m => m[1]);
		if (cmds.length === 0 || cmds.includes('help')) continue;
		const local = new Map([...vars, ...[...block.matchAll(/const (\w+) = app\.get\((\w+)\)/g)].map(m => [m[1], m[2]])]);
		const calls = [
			...[...block.matchAll(/app\.get\((\w+)\)\.(\w+)\(/g)].map(m => `${m[1]}.${m[2]}`),
			...[...block.matchAll(/\b(\w+)\.(\w+)\(/g)].filter(m => local.has(m[1])).map(m => `${local.get(m[1])}.${m[2]}`),
		];
		const startIds = uniq(calls).filter(id => methods.has(id));
		const fx = effects(startIds);
		const name = cmds.join('|');
		entries.push({ kind: 'cli', name, fx });
		cliRows.push([name, startIds, fx.writes, fx.queues, fx.events, fx.redisWrites, fx.hubs]);
	}
}
csv('cli-commands.csv', ['command', 'calls', 'writes', 'queues', 'events', 'redisWrites', 'hubs'], cliRows);
//#endregion

//#region 3. streaming channels
const channelRows = [];
for (const file of walk(join(src, 'server/api/stream/channels'))) {
	const text = readFileSync(file, 'utf8');
	const clsName = text.match(/export class (\w+) extends Channel/)?.[1];
	if (clsName == null) continue;
	const fx = effects(methodsOf(clsName));
	const chName = text.match(/chName = '([^']+)'/)?.[1] ?? '';
	entries.push({ kind: 'stream', name: chName, fx });
	channelRows.push([
		chName, clsName,
		text.match(/requireCredential = (\w+)/)?.[1] ?? '', text.match(/kind = '([^']+)'/)?.[1] ?? '', text.match(/shouldShare = (\w+)/)?.[1] ?? '',
		uniq([...text.matchAll(/subscriber\.on\(\s*([^,]+),/g)].map(m => m[1].trim())),
		uniq([...text.matchAll(/case '([^']+)':/g)].map(m => m[1])),
		fx.writes, fx.events, fx.hubs, testsMentioning(chName).length, rel(file),
	]);
}
csv('stream-channels.csv', ['channel', 'class', 'requireCredential', 'kind', 'shouldShare', 'subscribes', 'clientMessages', 'writes', 'events', 'hubs', 'testFileCount', 'file'], channelRows);
//#endregion

//#region 4. queues and jobs
const qps = readFileSync(join(src, 'queue/QueueProcessorService.ts'), 'utf8');
const qs = readFileSync(join(src, 'core/QueueService.ts'), 'utf8');
const schedulers = new Map([...qs.matchAll(/name: '(\w+)',\s*(?:\/\/[^\n]*\n\s*)?pattern: '([^']+)'/g)].map(m => [m[1], m[2]]));
const queueConst = new Map([...readFileSync(join(src, 'queue/const.ts'), 'utf8').matchAll(/(\w+): '(\w+)',/g)].map(m => [m[1], m[2]]));
const adminVisible = new Set([...qs.match(/QUEUE_TYPES = \[([\s\S]*?)\]/)[1].matchAll(/'(\w+)'/g)].map(m => m[1]));
// QueueServiceのメソッドの本体。同じクラスの別メソッド（`this.ensureNotePostScheduled(`など）を経由して登録するものがあるので、その本体も連結する
const qsBodies = new Map([...qs.matchAll(/\n\t(?:public |private |protected )?(?:static )?(?:async )?(\w+)(?:<[^\n]*>)?\([\s\S]*?\n\t\}/g)].map(m => [m[1], m[0]]));
function qsExpanded(name, seen = new Set()) {
	if (seen.has(name)) return '';
	seen.add(name);
	const body = qsBodies.get(name) ?? '';
	return [body, ...[...body.matchAll(/this\.(\w+)\(/g)].map(m => qsExpanded(m[1], seen))].join('\n');
}

const jobRows = [];
const workerBlocks = [...qps.matchAll(/new Bull\.Worker\(QUEUE\.(\w+)/g)];
for (const [i, w] of workerBlocks.entries()) {
	const queue = queueConst.get(w[1]);
	const prevEnd = i === 0 ? 0 : workerBlocks[i - 1].index;
	const before = qps.slice(prevEnd, w.index); // switch(job.name) precedes the worker
	const after = qps.slice(w.index, workerBlocks[i + 1]?.index ?? qps.length).split('//#endregion')[0];
	const concurrency = after.match(/concurrency:\s*([^,\n]+)/)?.[1]?.trim() ?? '1 (BullMQ既定)';
	const limiter = after.match(/limiter:\s*\{\s*max:\s*([^,\n]+),\s*duration:\s*(\d+)/);
	const backoff = /backoffStrategy/.test(after) ? 'httpRelatedBackoff' : '';
	let jobs = [...before.matchAll(/case '(\w+)': return this\.(\w+)\.(\w+)\(/g)].map(m => ({ job: m[1], prop: m[2], method: m[3] }));
	if (jobs.length === 0) {
		const m = after.match(/this\.(\w+ProcessorService)\.(\w+)\(/);
		if (m) jobs = [{ job: '(単一)', prop: m[1], method: m[2] }];
	}
	for (const j of jobs) {
		const clsName = j.prop[0].toUpperCase() + j.prop.slice(1);
		const fx = effects([`${clsName}.${j.method}`]);
		entries.push({ kind: 'job', name: `${queue}/${j.job}`, fx });
		const enq = uniq([...methods.values()].filter(n => [...n.queues].some(q => {
			if (new RegExp(`^${queue}Queue\\.`, 'i').test(q)) return j.job === '(単一)';
			const body = qsExpanded(q);
			if (!body.includes(`this.${queue}Queue.`)) return false;
			// ジョブ名は呼ばれたメソッド自身の本体で見る（共通の補助メソッドは全ジョブ名を型に持つことがある）
			return j.job === '(単一)' || (qsBodies.get(q) ?? '').includes(`'${j.job}'`);
		})).map(n => n.id));
		jobRows.push([
			queue, j.job, `${clsName}.${j.method}`, schedulers.get(j.job) ?? '', adminVisible.has(queue) ? 'yes' : 'no',
			concurrency, limiter ? `${limiter[1].trim()}/${limiter[2]}ms` : '', backoff,
			fx.writes, fx.queues, fx.events, fx.externals, fx.redis, fx.hubs, enq.length, enq.slice(0, 12),
			rel(classes.get(clsName)?.file ?? ''),
		]);
	}
}
csv('queue-jobs.csv', ['queue', 'job', 'processor', 'cron', 'adminVisible', 'concurrency', 'limiter', 'backoff', 'writes', 'enqueues', 'events', 'externals', 'redisClients', 'hubs', 'enqueuerCount', 'enqueuers', 'file'], jobRows);

// hubs
csv('hubs.csv', ['hub', 'classes', 'writes', 'queues', 'events', 'externals', 'redisClients', 'reachesHubs', 'apiCount', 'jobCount', 'streamCount', 'serverCount'], [...Object.keys(HUBS), 'lazyInit'].map(h => {
	const cs = h === 'lazyInit' ? Object.keys(HUB_METHODS) : [...classes.values()].filter(c => hubOf(c.name) === h).map(c => c.name);
	const fx = effects(h === 'lazyInit' ? cs : cs.flatMap(methodsOf));
	const n = (kind) => entries.filter(e => e.kind === kind && e.fx.hubs.includes(h)).length;
	return [h, cs, fx.writes, fx.queues, fx.events, fx.externals, fx.redis, fx.hubs.filter(x => x !== h), n('api'), n('job'), n('stream'), n('server')];
}));
//#endregion

//#region 5. write sites and who reaches them
const reachers = sites.map(() => ({ api: new Set(), job: new Set(), stream: new Set(), server: new Set(), cli: new Set() }));
for (const e of entries) for (const s of e.fx.core.sites) reachers[s][e.kind].add(e.name);
csv('write-sites.csv', ['table', 'op', 'via', 'method', 'file', 'line', 'apiCount', 'jobCount', 'streamCount', 'serverCount', 'jobs', 'serverClasses', 'apis', 'cliCount', 'cliCommands'],
	sites.map((s, i) => [s.table, s.op, s.via, s.method, s.file, s.line, reachers[i].api.size, reachers[i].job.size, reachers[i].stream.size, reachers[i].server.size,
		uniq(reachers[i].job), uniq(reachers[i].server), uniq(reachers[i].api).slice(0, 15), reachers[i].cli.size, uniq(reachers[i].cli)])
		.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[3]).localeCompare(String(b[3]))));

const tableRows = [];
for (const table of uniq([...entityTable.values(), ...sites.map(s => s.table)])) {
	const ss = sites.filter(s => s.table === table);
	const agg = { api: new Set(), job: new Set(), stream: new Set(), server: new Set(), cli: new Set() };
	for (const s of ss) for (const k of Object.keys(agg)) for (const v of reachers[s.id][k]) agg[k].add(v);
	tableRows.push([table, ss.length, uniq(ss.map(s => s.method.split('.')[0])).length, uniq(ss.map(s => s.method.split('.')[0])),
		agg.api.size, agg.job.size, agg.stream.size, agg.server.size, uniq(agg.job), uniq(agg.server), agg.cli.size, uniq(agg.cli)]);
}
csv('tables.csv', ['table', 'writeSiteCount', 'writerClassCount', 'writerClasses', 'apiCount', 'jobCount', 'streamCount', 'serverCount', 'jobs', 'serverClasses', 'cliCount', 'cliCommands'], tableRows);
//#endregion

//#region 6. config and environment variables
const schema = JSON.parse(readFileSync(join(backend, 'config.schema.json'), 'utf8'));
const configRows = [];
function flatten(node, path, seen = new Set()) {
	if (node?.$ref) {
		if (seen.has(node.$ref)) return;
		const target = node.$ref.replace('#/$defs/', '');
		return flatten({ ...schema.$defs[target], description: node.description ?? schema.$defs[target].description }, path, new Set([...seen, node.$ref]));
	}
	const alts = node?.anyOf ?? node?.oneOf;
	const type = Array.isArray(node?.type) ? node.type.join('|') : node?.type ?? (alts ? 'anyOf' : node?.enum ? 'enum' : '');
	if (path !== '') configRows.push([path, type, node.default === undefined ? '' : JSON.stringify(node.default), node['x-env'] ?? '', node.enum ? node.enum.join('|') : '', (node.description ?? '').replace(/\s+/g, ' ')]);
	for (const [k, v] of Object.entries(node?.properties ?? {})) flatten(v, path ? `${path}.${k}` : k, seen);
	if (node?.items) flatten(node.items, `${path}[]`, seen);
	for (const alt of alts ?? []) if (alt.properties || alt.$ref) flatten(alt, path, seen);
}
flatten(schema, '');
const seenKey = new Set();
csv('config-keys.csv', ['key', 'type', 'default', 'env', 'enum', 'description'], configRows.filter(r => !seenKey.has(r[0]) && seenKey.add(r[0])));

// 環境変数は config.schema.json の $defs.environment が一覧（P3-4）。サービスは process.env を読まず、
// DIの config.runtime を読むので、参照箇所は runtime-options.csv に出す
const envUse = new Map();
const envScope = new Map();
for (const [k, v] of Object.entries(schema.$defs.environment?.properties ?? {})) {
	envUse.set(k, []);
	envScope.set(k, v['x-scope'] ?? '');
}
for (const file of walk(src)) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/process\.env\.(\w+)|process\.env\[\s*['"]([^'"]+)['"]\s*\]|values\.(\w+)|values\[\s*'([^']+)'\s*\]|flag\('([^']+)'\)|port\('([^']+)'/g)) {
		// values.X・flag('X')・port('X')は、環境変数を解釈する config/environment.ts だけで数える
		if (m[1] === undefined && m[2] === undefined && !file.endsWith(join('config', 'environment.ts'))) continue;
		const k = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6];
		if (!/^[A-Z][A-Z0-9_]+$/.test(k)) continue;
		if (!envUse.has(k)) envUse.set(k, []);
		envUse.get(k).push(`${rel(file).replace('packages/backend/src/', '')}:${lineOf(text, m.index)}`);
	}
}
for (const r of configRows) if (r[3]) {
	if (!envUse.has(r[3])) envUse.set(r[3], []);
	envUse.get(r[3]).push(`config.schema.json (${r[0]})`);
}
const runtimeUse = new Map();
for (const file of walk(src)) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/runtime\.(production|development|test)\.(\w+)|runtime\.(nodeEnv)/g)) {
		const k = m[3] ?? `${m[1]}.${m[2]}`;
		if (!runtimeUse.has(k)) runtimeUse.set(k, []);
		runtimeUse.get(k).push(`${rel(file).replace('packages/backend/src/', '')}:${lineOf(text, m.index)}`);
	}
}
csv('runtime-options.csv', ['option', 'useCount', 'uses'], [...runtimeUse].sort().map(([k, v]) => [k, v.length, v]));
csv('env-vars.csv', ['name', 'scope', 'useCount', 'uses'], [...envUse].sort().map(([k, v]) => [k, envScope.get(k) ?? '', v.length, v]));
//#endregion

//#region 7. redis, caches, events, timers
csv('redis-commands.csv', ['client', 'command', 'firstArg', 'method', 'file', 'line'], redisUses.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line).map(r => [r.client, r.cmd, r.arg, r.method, r.file, r.line]));
csv('caches.csv', ['kind', 'name', 'lifetime', 'memoryCacheLifetime', 'owner', 'file', 'line'], caches.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)).map(c => [c.kind, c.name, c.lifetime, c.memoryLifetime, c.owner, c.file, c.line]));

const ges = readFileSync(join(src, 'core/GlobalEventService.ts'), 'utf8');
const internalTypes = [...(ges.match(/export interface InternalEventTypes \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/^\t(\w+): ([^\n]+);$/gm)].map(m => ({ name: m[1], payload: m[2] }));
const subscriberFiles = walk(src).map(f => ({ f, text: readFileSync(f, 'utf8') })).filter(x => /redisForSub\s*\.\s*on\(\s*'message'|onMessage|onRedisMessage/.test(x.text) && !x.f.includes('/stream/'));
csv('internal-events.csv', ['event', 'payload', 'carriesEntity', 'publisherCount', 'publishers', 'subscriberCount', 'subscribers'], internalTypes.map(t => {
	const pubs = eventPublishes.filter(p => p.stream === 'InternalEvent' && p.type === t.name).map(p => `${p.file.replace('packages/backend/src/', '')}:${p.line}`);
	// `case 'x':` のほか、`message.type !== 'x'` のように1種類だけを見る購読もある
	const subs = subscriberFiles.filter(x => x.text.includes(`case '${t.name}'`) || new RegExp(`\\.type\\s*[!=]==\\s*'${t.name}'`).test(x.text)).map(x => rel(x.f).replace('packages/backend/src/', ''));
	return [t.name, t.payload, /\bMi[A-Z]\w+(?!\[)/.test(t.payload.replace(/Mi\w+\['\w+'\]/g, '')) ? 'yes' : '', pubs.length, pubs, subs.length, subs];
}));

// チャート。テーブルは名前から動的に決まる（core/chart/core.ts の schemaToEntity）ので、write-sites.csv には出ない。
// update系のメソッドはメモリ上のバッファに積むだけで、DBへは ChartManagementService の20分おきの save と終了時、tick・clean・resync のジョブで書く
const chartRows = [];
const CHART_BASE_METHODS = new Set(['constructor', 'save', 'waitForSave', 'tick', 'resync', 'clean', 'getChartRaw', 'getChart', 'tickMajor', 'tickMinor']);
for (const file of walk(join(src, 'core/chart/charts'))) {
	if (file.includes('/entities/') || /\/test[-.]/.test(file)) continue;
	const text = readFileSync(file, 'utf8');
	const clsName = text.match(/export default class (\w+) extends Chart/)?.[1];
	const entityFile = text.match(/from '\.\/entities\/([\w-]+)\.js'/)?.[1];
	if (clsName == null || entityFile == null) continue;
	const entityText = readFileSync(join(src, 'core/chart/charts/entities', `${entityFile}.ts`), 'utf8');
	const name = entityText.match(/export const name = '(\w+)'/)?.[1] ?? '';
	const snake = name.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
	const columns = [...(entityText.match(/export const schema = \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/^\t'([^']+)':/gm)].length;
	const grouped = /super\([^\n]*,\s*true\);/.test(text);
	const own = (classes.get(clsName)?.methodNames ?? []).filter(m => !CHART_BASE_METHODS.has(m));
	const callers = (pred) => uniq([...methods.values()].filter(n => n.cls !== clsName && [...n.calls].some(c => c.startsWith(`${clsName}.`) && pred(c.slice(clsName.length + 1)))).map(n => n.id));
	const updaters = callers(m => own.includes(m));
	chartRows.push([
		name, clsName, `__chart__${snake}; __chart_day__${snake}`, grouped ? 'yes' : '', columns, own,
		updaters.length, updaters.slice(0, 15), callers(m => m === 'getChart' || m === 'getChartRaw'), rel(file),
	]);
}
csv('charts.csv', ['chart', 'class', 'tables', 'grouped', 'columnCount', 'updateMethods', 'updaterCount', 'updaters', 'readers', 'file'], chartRows);

csv('timers.csv', ['kind', 'method', 'file', 'line'], timers.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line).map(t => [t.kind, t.method, t.file, t.line]));
//#endregion

//#region 8. summary for README
const count = (xs, f) => xs.reduce((m, x) => (m[f(x)] = (m[f(x)] ?? 0) + 1, m), {});
const head = git('rev-parse', '--short', 'HEAD')?.trim();
const summary = {
	generatedFrom: head,
	misskeyRef, cherrypickRef,
	endpoints: {
		total: apiRows.length,
		byOrigin: count(apiRows, r => r[2]),
		byAuth: count(apiRows, r => r[3]),
		byEffect: count(apiRows, r => r[14]),
		allowGet: apiRows.filter(r => r[7]).length,
		noResSchema: apiRows.filter(r => !r[12]).length,
		noTests: apiRows.filter(r => r[21] === 0).length,
		forkModified: count(apiRows.filter(r => r[24] !== ''), r => r[2]),
		anonymousPureRead: apiRows.filter(r => r[3] === 'none' && r[14] === 'read').map(r => r[0]),
		byGroup: Object.fromEntries(Object.entries(count(apiRows, r => r[1])).sort((a, b) => b[1] - a[1])),
		groupEffect: Object.fromEntries(uniq(apiRows.map(r => r[1])).map(g => [g, count(apiRows.filter(r => r[1] === g), r => r[14].startsWith('write') ? 'write' : 'read')])),
		groupOrigin: Object.fromEntries(uniq(apiRows.map(r => r[1])).map(g => [g, count(apiRows.filter(r => r[1] === g), r => r[2])])),
	},
	httpRoutes: routeRows.length,
	cliCommands: cliRows.map(r => r[0]),
	channels: channelRows.length,
	jobs: { total: jobRows.length, queues: uniq(jobRows.map(r => r[0])).length, scheduled: jobRows.filter(r => r[3]).length },
	writeSites: sites.length,
	charts: chartRows.length,
	unreachedWriteSites: reachers.filter(r => Object.values(r).every(x => x.size === 0)).length,
	tables: { entities: entityTable.size, written: tableRows.filter(r => r[1] > 0).length, neverWrittenBySites: tableRows.filter(r => r[1] === 0).map(r => r[0]) },
	configKeys: seenKey.size,
	envVars: envUse.size,
	redisCommandSites: redisUses.length,
	caches: count(caches, c => c.kind),
	internalEvents: internalTypes.length,
	timers: count(timers, t => t.kind),
	classes: classes.size, methods: methods.size,
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, '\t') + '\n');
console.log('summary.json written');
//#endregion

if (process.env.INVENTORY_TRACE) {
	for (const spec of process.env.INVENTORY_TRACE.split(',')) {
		const [from, to] = spec.split('>');
		console.log(`trace ${spec}:\n  ${trace(from, to)?.join('\n  -> ') ?? '(到達しない)'}`);
	}
}
