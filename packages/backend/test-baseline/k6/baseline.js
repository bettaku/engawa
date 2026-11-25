// SPDX-License-Identifier: AGPL-3.0-only
// RUST-02: 基準負荷のシナリオ。run.sh から呼ぶ。
//
// 環境変数:
//   SCENARIO  下の ENDPOINTS のキー、または mix（重みは WEIGHTS か /fixture/weights.json）
//   RATE      毎秒の要求数（到着率を固定する。応答が遅くなっても要求の数は減らない）
//   DURATION  計測の長さ（例: 60s）
//   WARMUP    計測前に同じ到着率で流す時間（例: 15s。0sならcold計測）
//   TARGET    送り先（既定 http://web:3000）
//   RUN_NAME  結果ファイルの名前

import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const TARGET = __ENV.TARGET || 'http://web:3000';
const SCENARIO = __ENV.SCENARIO || 'emojis_anon';
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '60s';
const WARMUP = __ENV.WARMUP || '15s';
const RUN_NAME = __ENV.RUN_NAME || `${SCENARIO}-${RATE}`;

const fixture = JSON.parse(open('/fixture/fixture.json'));

function loadWeights() {
	if (__ENV.WEIGHTS) return JSON.parse(__ENV.WEIGHTS);
	try {
		return JSON.parse(open('/fixture/weights.json')).weights;
	} catch {
		// 本番のアクセスログを集計する前の仮の重み。README「重みを本番に合わせる」で置き換える
		return { htl_auth: 30, notes_show_anon: 15, i_auth: 15, notifications_auth: 10, ltl_anon: 10, users_show_anon: 8, meta_anon: 7, emojis_anon: 5 };
	}
}

// 選び方は乱数を使わず、全体の通し番号から決める（同じ到着率・長さなら毎回同じ要求の列になる）。
// 無理数倍の小数部（Weyl 列）は [0, 1) にほぼ均等に散らばる。用途ごとに係数を変えて相関させない
const iter = () => exec.scenario.iterationInTest;
const frac = (mult) => ((iter() + 1) * mult) % 1;
const rnd = (arr) => arr[Math.floor(frac(Math.SQRT2 - 1) * arr.length)];
// 認証付きの要求は、全体の通し番号で利用者を順に回す。仮想利用者の番号で固定すると、到着率が低いときに
// 少数の利用者へ要求が集中し、利用者ごとのレート制限（i/notifications の 30回/30秒）にかかる
const user = () => fixture.users[iter() % fixture.users.length];
const json = (body) => ({ body: JSON.stringify(body), contentType: 'application/json' });

// 仮想利用者ごとに別のIPに見せ、IP単位のレート制限が全要求にかからないようにする
function headers(extra = {}) {
	const vu = exec.vu.idInTest;
	return { 'X-Forwarded-For': `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${vu & 255}`, ...extra };
}

function post(endpoint, body, name) {
	const { body: b, contentType } = json(body);
	return http.post(`${TARGET}/api/${endpoint}`, b, { headers: headers({ 'Content-Type': contentType }), tags: { name } });
}

export const ENDPOINTS = {
	// RUST-06 の最初の対象。認証情報なしのGETだけをRustへ振り分ける予定
	emojis_anon: () => http.get(`${TARGET}/api/emojis`, { headers: headers(), tags: { name: 'emojis_anon' } }),
	meta_anon: () => post('meta', { detail: false }, 'meta_anon'),
	ltl_anon: () => post('notes/local-timeline', { limit: 10 }, 'ltl_anon'),
	notes_show_anon: () => post('notes/show', { noteId: rnd(fixture.publicNoteIds) }, 'notes_show_anon'),
	users_show_anon: () => post('users/show', { username: rnd(fixture.users).username }, 'users_show_anon'),
	htl_auth: () => post('notes/timeline', { i: user().token, limit: 10 }, 'htl_auth'),
	i_auth: () => post('i', { i: user().token }, 'i_auth'),
	notifications_auth: () => post('i/notifications', { i: user().token, limit: 10 }, 'notifications_auth'),
};

const weights = SCENARIO === 'mix' ? loadWeights() : { [SCENARIO]: 1 };
for (const k of Object.keys(weights)) {
	if (!ENDPOINTS[k]) throw new Error(`unknown endpoint in weights: ${k}`);
}
const total = Object.values(weights).reduce((a, b) => a + b, 0);

// 利用者ごとのレート制限がある入口。制限を超える到着率では429を測ることになるので、始める前に止める
const PER_USER_LIMIT_RPS = { notifications_auth: 30 / 30 };
for (const [k, limitRps] of Object.entries(PER_USER_LIMIT_RPS)) {
	if (!weights[k]) continue;
	const perUser = RATE * (weights[k] / total) / fixture.users.length;
	if (perUser > limitRps * 0.8) {
		throw new Error(`${k}: ${perUser.toFixed(2)} req/s per user exceeds 80% of its rate limit (${limitRps}/s). Lower RATE or seed more users (max RATE ≈ ${Math.floor(limitRps * 0.8 * fixture.users.length * total / weights[k])}).`);
	}
}
const table = [];
let acc = 0;
for (const [k, w] of Object.entries(weights)) {
	acc += w / total;
	table.push([acc, k]);
}
const choose = () => {
	const r = frac((Math.sqrt(5) - 1) / 2);
	return (table.find(([c]) => r < c) ?? table[table.length - 1])[1];
};

const preAllocatedVUs = Math.max(10, Math.ceil(RATE / 2));
const scenarios = {
	measure: {
		executor: 'constant-arrival-rate',
		rate: RATE,
		timeUnit: '1s',
		duration: DURATION,
		preAllocatedVUs,
		maxVUs: preAllocatedVUs * 10,
		startTime: WARMUP === '0s' ? '0s' : WARMUP,
		tags: { phase: 'measure' },
	},
};
if (WARMUP !== '0s') {
	scenarios.warmup = {
		executor: 'constant-arrival-rate',
		rate: RATE,
		timeUnit: '1s',
		duration: WARMUP,
		preAllocatedVUs,
		maxVUs: preAllocatedVUs * 10,
		tags: { phase: 'warmup' },
	};
}

// 計測区間だけをエンドポイント別に集計するため、サブメトリクスを閾値として宣言する（閾値自体は常に合格）
const thresholds = {
	'http_req_duration{phase:measure}': ['max>=0'],
	'http_req_failed{phase:measure}': ['rate>=0'],
	'http_reqs{phase:measure}': ['count>=0'],
};
for (const k of Object.keys(weights)) {
	thresholds[`http_req_duration{phase:measure,name:${k}}`] = ['max>=0'];
	thresholds[`http_req_failed{phase:measure,name:${k}}`] = ['rate>=0'];
	thresholds[`http_reqs{phase:measure,name:${k}}`] = ['count>=0'];
}

export const options = {
	scenarios,
	thresholds,
	summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
	discardResponseBodies: true,
	insecureSkipTLSVerify: true,
};

export default function () {
	const name = choose();
	const res = ENDPOINTS[name]();
	check(res, { '2xx': r => r.status >= 200 && r.status < 300 }, { name });
}

export function handleSummary(data) {
	const m = data.metrics;
	const pick = (key) => m[key]?.values;
	const byEndpoint = {};
	for (const k of Object.keys(weights)) {
		byEndpoint[k] = {
			reqs: pick(`http_reqs{phase:measure,name:${k}}`)?.count ?? 0,
			failedRate: pick(`http_req_failed{phase:measure,name:${k}}`)?.rate ?? null,
			durationMs: pick(`http_req_duration{phase:measure,name:${k}}`) ?? null,
		};
	}
	const out = {
		run: RUN_NAME,
		scenario: SCENARIO,
		rate: RATE,
		duration: DURATION,
		warmup: WARMUP,
		weights,
		total: {
			reqs: pick('http_reqs{phase:measure}')?.count ?? 0,
			failedRate: pick('http_req_failed{phase:measure}')?.rate ?? null,
			durationMs: pick('http_req_duration{phase:measure}') ?? null,
			droppedIterations: pick('dropped_iterations')?.count ?? 0,
		},
		byEndpoint,
	};
	return {
		[`/results/${RUN_NAME}.k6.json`]: JSON.stringify(out, null, '\t'),
		stdout: `${RUN_NAME}: ${out.total.reqs} reqs, p95=${out.total.durationMs?.['p(95)']?.toFixed(1)}ms p99=${out.total.durationMs?.['p(99)']?.toFixed(1)}ms failed=${((out.total.failedRate ?? 0) * 100).toFixed(2)}% dropped=${out.total.droppedIterations}\n`,
	};
}
