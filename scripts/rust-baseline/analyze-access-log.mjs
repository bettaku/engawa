// SPDX-License-Identifier: AGPL-3.0-only
// RUST-02: 本番のアクセスログから、入口ごとの件数・割合・応答時間・ピークを集計する。
//
// 個人情報を残さない: 読むのはメソッド・パス・状態コード・時刻・応答時間だけで、
// IPアドレス、User-Agent、Referer、クエリの値は出力にも中間データにも保持しない。
// パスはルートの形（/notes/:id など）に正規化してから数える。/api 配下は、このリポジトリの
// endpoint-list.ts から読んだエンドポイントの名前に一致するものだけを残し、それ以外は '/api (other)' にまとめる
// （そのため、リポジトリを checkout した場所で実行する。対象の本番と同じ版の checkout が望ましい）。
//
// 使い方:
//   node scripts/rust-baseline/analyze-access-log.mjs [--format combined|json] [--out DIR] access.log [access.log.1.gz ...]
//
// 対応する形式:
//   combined  nginxのcombined形式。末尾に $request_time（秒）があれば応答時間も集計する
//             （log_format main '... "$http_user_agent" $request_time'; など）
//   json      1行1JSON。method / uri（または request_uri, path）/ status / request_time / time（ISO8601かepoch秒）

import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: opts, positionals: files } = parseArgs({
	allowPositionals: true,
	options: {
		format: { type: 'string', default: 'combined' },
		out: { type: 'string', default: 'rust-baseline-out' },
	},
});
if (files.length === 0) {
	console.error('usage: analyze-access-log.mjs [--format combined|json] [--out DIR] FILE...');
	process.exit(1);
}

// ---- API の許可リスト ----
// エンドポイントの名前は packages/backend/src/server/api/endpoint-list.ts から読む（export * as 'name' from ...）
const ENDPOINT_LIST = new URL('../../packages/backend/src/server/api/endpoint-list.ts', import.meta.url);
const API_NAMES = new Set([...(await readFile(ENDPOINT_LIST, 'utf8')).matchAll(/export \* as '([^']+)'/g)].map(m => m[1]));
if (API_NAMES.size === 0) throw new Error(`no endpoint names found in ${ENDPOINT_LIST.pathname}`);
// ApiServerService.ts が、エンドポイントとは別に直接定義するパス
for (const name of ['signup', 'signin-flow', 'signin-with-passkey', 'signup-pending', 'v1/instance/peers', 'clear-browser-cache']) API_NAMES.add(name);
const API_DYNAMIC = [[/^miauth\/[^/]+\/check$/, 'miauth/:id/check']];

// ---- パスの正規化。上から順に最初に一致したものを使う ----
const ID = '[0-9a-z]{8,32}';
const ROUTES = [
	// API は許可リスト（エンドポイントの名前と、ApiServerService が直接定義するパス）に一致するものだけを名前で数え、
	// それ以外は値を出力に残さないよう '/api (other)' にまとめる。パスの中の ID（miauth の session）は :id にする
	[/^\/api\/(.+?)\/?$/, m => {
		if (API_NAMES.has(m[1])) return `/api/${m[1]}`;
		for (const [re, shape] of API_DYNAMIC) if (re.test(m[1])) return `/api/${shape}`;
		return '/api (other)';
	}],
	[/^\/api\/?$/, () => '/api'],
	[/^\/streaming\/?$/, () => '/streaming'],
	[/^\/inbox\/?$/, () => '/inbox'],
	[new RegExp(`^/users/${ID}/inbox/?$`), () => '/users/:id/inbox'],
	[new RegExp(`^/users/${ID}/outbox/?$`), () => '/users/:id/outbox'],
	[new RegExp(`^/users/${ID}/(followers|following|collections/featured)/?$`), m => `/users/:id/${m[1]}`],
	[new RegExp(`^/users/${ID}/?$`), () => '/users/:id'],
	[new RegExp(`^/notes/${ID}/activity/?$`), () => '/notes/:id/activity'],
	[new RegExp(`^/notes/${ID}/?$`), () => '/notes/:id'],
	[/^\/@[^/]+\/?$/, () => '/@:user'],
	[/^\/@[^/]+\/.+$/, () => '/@:user/*'],
	[/^\/\.well-known\/([a-z\-]+)/, m => `/.well-known/${m[1]}`],
	[/^\/nodeinfo\//, () => '/nodeinfo/*'],
	[/^\/manifest\.json$/, () => '/manifest.json'],
	[/^\/(files|proxy|emoji|avatar|identicon|twemoji|fluent-emoji|tossface)\//, m => `/${m[1]}/*`],
	[/^\/(assets|vite|embed_vite|static-assets|client-assets)\//, m => `/${m[1]}/*`],
	[/^\/(url|oauth|auth|signup|login|share|miauth)\b/, m => `/${m[1]}*`],
	[/^\/(healthz|robots\.txt|favicon\.ico|apple-touch-icon\.png|sw\.js)$/, m => `/${m[1]}`],
	[/^\/$/, () => '/'],
];
const normalize = (path) => {
	for (const [re, f] of ROUTES) {
		const m = path.match(re);
		if (m) return f(m);
	}
	return '(other)';
};

// k6 シナリオ（packages/backend/test-baseline/k6/baseline.js）の名前への対応
const K6_KEYS = {
	'GET /api/emojis': 'emojis_anon',
	'POST /api/emojis': 'emojis_anon',
	'POST /api/meta': 'meta_anon',
	'POST /api/notes/local-timeline': 'ltl_anon',
	'POST /api/notes/show': 'notes_show_anon',
	'POST /api/users/show': 'users_show_anon',
	'POST /api/notes/timeline': 'htl_auth',
	'POST /api/i': 'i_auth',
	'POST /api/i/notifications': 'notifications_auth',
};

// ---- 応答時間の対数ヒストグラム（相対誤差およそ2%。全件を保持しない） ----
const B = Math.log(1.04);
const bucketOf = (ms) => (ms <= 0.1 ? 0 : 1 + Math.floor(Math.log(ms / 0.1) / B));
const msOf = (b) => (b === 0 ? 0.1 : 0.1 * Math.exp((b - 0.5) * B));
function quantile(hist, total, q) {
	if (total === 0) return null;
	const target = q * total;
	let acc = 0;
	for (const b of [...hist.keys()].sort((x, y) => x - y)) {
		acc += hist.get(b);
		if (acc >= target) return msOf(b);
	}
	return null;
}

// ---- 1行の解析 ----
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// $remote_addr - $remote_user [$time_local] "$request" $status $bytes "$referer" "$ua" [$request_time]
const COMBINED = /^\S+ \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "(?:[^"\\]|\\.)*" "(?:[^"\\]|\\.)*"(?: (\d+(?:\.\d+)?))?/;

function parseLine(line) {
	if (opts.format === 'json') {
		let o;
		try { o = JSON.parse(line); } catch { return null; }
		const uri = o.uri ?? o.request_uri ?? o.path;
		if (!o.method || !uri) return null;
		const t = typeof o.time === 'number' ? o.time * 1000 : Date.parse(o.time ?? o.time_iso8601 ?? o.timestamp);
		return { method: o.method, uri, status: Number(o.status), ms: o.request_time != null ? Number(o.request_time) * 1000 : null, t };
	}
	const m = line.match(COMBINED);
	if (!m) return null;
	const [, dd, mon, yyyy, hh, mi, ss, tz, method, uri, status, rt] = m;
	const offsetMin = (tz[0] === '-' ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3)));
	const t = Date.UTC(Number(yyyy), MONTHS[mon], Number(dd), Number(hh), Number(mi), Number(ss)) - offsetMin * 60000;
	return { method, uri, status: Number(status), ms: rt != null ? Number(rt) * 1000 : null, t };
}

// ---- 集計 ----
const routes = new Map(); // key → { count, s4xx, s5xx, hist, timed, getWithToken }
const perMinute = new Map(); // epochMinute → count
const perHourOfDay = new Array(24).fill(0);
let total = 0, unparsed = 0, firstT = Infinity, lastT = -Infinity;

for (const file of files) {
	const stream = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file);
	for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
		if (!line) continue;
		const r = parseLine(line);
		if (!r || Number.isNaN(r.t)) { unparsed++; continue; }
		total++;
		const q = r.uri.indexOf('?');
		const path = q < 0 ? r.uri : r.uri.slice(0, q);
		// クエリは値を見ずに、APIのトークン（i=）があるかどうかだけを数える
		const hasToken = q >= 0 && /(?:^|&)i=/.test(r.uri.slice(q + 1));
		// トークン付きのGETは匿名のGETと別の入口として数える（RUST-07で振り分けるのは匿名だけ）
		const key = `${r.method} ${normalize(path)}${hasToken ? ' (i=)' : ''}`;
		let s = routes.get(key);
		if (!s) routes.set(key, s = { count: 0, s4xx: 0, s5xx: 0, hist: new Map(), timed: 0 });
		s.count++;
		if (r.status >= 500) s.s5xx++; else if (r.status >= 400) s.s4xx++;
		if (r.ms != null && !Number.isNaN(r.ms)) {
			const b = bucketOf(r.ms);
			s.hist.set(b, (s.hist.get(b) ?? 0) + 1);
			s.timed++;
		}
		const minute = Math.floor(r.t / 60000);
		perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
		perHourOfDay[new Date(r.t).getUTCHours()]++;
		firstT = Math.min(firstT, r.t);
		lastT = Math.max(lastT, r.t);
	}
}

if (total === 0) {
	console.error(`no lines parsed (unparsed=${unparsed}). Check --format and the log_format.`);
	process.exit(1);
}

const spanSec = Math.max(1, (lastT - firstT) / 1000);
// 要求がなかった分も 0 件として含める（含めないと、断続的なトラフィックの通常の到着率を過大に見積もる）
const minuteCounts = [];
for (let m = Math.floor(firstT / 60000); m <= Math.floor(lastT / 60000); m++) minuteCounts.push(perMinute.get(m) ?? 0);
minuteCounts.sort((a, b) => a - b);
const pctOf = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
const overview = {
	files: files.length,
	from: new Date(firstT).toISOString(),
	to: new Date(lastT).toISOString(),
	lines: total,
	unparsed,
	meanRps: total / spanSec,
	// 1分単位の到着率。k6の到着率を選ぶ根拠にする
	minuteRps: { p50: pctOf(minuteCounts, 0.5) / 60, p95: pctOf(minuteCounts, 0.95) / 60, p99: pctOf(minuteCounts, 0.99) / 60, max: minuteCounts[minuteCounts.length - 1] / 60 },
	hourOfDayUtc: perHourOfDay,
	hasLatency: [...routes.values()].some(s => s.timed > 0),
};

const rows = [...routes.entries()].map(([key, s]) => {
	const sp = key.indexOf(' ');
	const method = key.slice(0, sp), route = key.slice(sp + 1);
	return {
		method, route, count: s.count, share: s.count / total, rps: s.count / spanSec,
		rate4xx: s.s4xx / s.count, rate5xx: s.s5xx / s.count,
		p50: quantile(s.hist, s.timed, 0.5), p95: quantile(s.hist, s.timed, 0.95), p99: quantile(s.hist, s.timed, 0.99),
		// 応答時間 × 件数。どの入口がサーバーの時間を使っているかの目安（CPU時間ではない）
		timeShareProxy: s.timed > 0 ? [...s.hist.entries()].reduce((a, [b, n]) => a + msOf(b) * n, 0) : null,
		k6: K6_KEYS[key] ?? null,
	};
}).sort((a, b) => b.count - a.count);
const timeTotal = rows.reduce((a, r) => a + (r.timeShareProxy ?? 0), 0);
for (const r of rows) r.timeShare = timeTotal > 0 && r.timeShareProxy != null ? r.timeShareProxy / timeTotal : null;

// k6 の mix シナリオの重み。対応するシナリオのない入口は重みに含めず、被覆率として残す
const weights = {};
for (const r of rows) if (r.k6) weights[r.k6] = (weights[r.k6] ?? 0) + r.count;
const apiCount = rows.filter(r => r.route.startsWith('/api')).reduce((a, r) => a + r.count, 0);
const coveredCount = Object.values(weights).reduce((a, b) => a + b, 0);

await mkdir(opts.out, { recursive: true });
const f = (v, d = 3) => (v == null ? '' : Number(v.toFixed(d)));
const csv = [
	'method,route,count,share,rps,rate_4xx,rate_5xx,p50_ms,p95_ms,p99_ms,time_share,k6_scenario',
	...rows.map(r => [r.method, r.route, r.count, f(r.share, 5), f(r.rps, 4), f(r.rate4xx, 4), f(r.rate5xx, 4), f(r.p50, 1), f(r.p95, 1), f(r.p99, 1), f(r.timeShare, 5), r.k6 ?? ''].join(',')),
].join('\n');
await writeFile(join(opts.out, 'routes.csv'), `${csv}\n`);
await writeFile(join(opts.out, 'overview.json'), JSON.stringify(overview, null, '\t'));
await writeFile(join(opts.out, 'weights.json'), JSON.stringify({
	source: { from: overview.from, to: overview.to, lines: total },
	apiCoverage: apiCount > 0 ? coveredCount / apiCount : null,
	weights,
}, null, '\t'));

console.log(`lines=${total} unparsed=${unparsed} span=${overview.from}..${overview.to}`);
console.log(`rps mean=${overview.meanRps.toFixed(2)} minute-p95=${overview.minuteRps.p95.toFixed(2)} minute-max=${overview.minuteRps.max.toFixed(2)}`);
console.log(`k6 mix covers ${apiCount > 0 ? (coveredCount / apiCount * 100).toFixed(1) : '-'}% of /api requests`);
console.log('top 15:');
for (const r of rows.slice(0, 15)) {
	console.log(`  ${(r.share * 100).toFixed(2).padStart(6)}%  ${r.method.padEnd(6)} ${r.route}${r.p95 != null ? `  p95=${r.p95.toFixed(0)}ms` : ''}`);
}
console.log(`→ ${join(opts.out, 'routes.csv')}, overview.json, weights.json`);
