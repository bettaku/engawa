// SPDX-License-Identifier: AGPL-3.0-only
// RUST-02: --cpu-prof の結果（compose.prof.yml）から、CPU を使い切っていた秒（張り付き）に何が動いていたかを集計する。
//
//   node prof-report.mjs results/prof/CPU.<...>.cpuprofile [--busy 0.85] [--top 25]
//
// 1秒ごとに、(idle) 以外のサンプルの割合を「使用率」とし、--busy 以上の秒を張り付きの秒として扱う。
// 張り付きの秒と、それ以外の秒とで、関数ごとの self 時間と inclusive 時間を比べる。

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values: opts, positionals } = parseArgs({
	allowPositionals: true,
	options: { busy: { type: 'string', default: '0.85' }, top: { type: 'string', default: '25' } },
});
const BUSY = Number(opts.busy);
const TOP = Number(opts.top);

const prof = JSON.parse(await readFile(positionals[0], 'utf8'));
const nodes = new Map(prof.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);

const shortUrl = (url) => url.replace(/^file:\/\/\/cherrypick\//, '').replace(/^.*node_modules\/\.pnpm\/([^/]+)\/node_modules\//, 'dep:$1/');
const label = (n) => {
	const f = n.callFrame;
	if (!f.url) return f.functionName || '(anonymous)';
	return `${f.functionName || '(anonymous)'} ${shortUrl(f.url)}:${f.lineNumber + 1}`;
};
const isIdle = (n) => n.callFrame.functionName === '(idle)';
// 呼び出し元をたどったときに最初に出てくる Engawa のコード（packages/backend/built）
const appFrame = (id) => {
	for (let cur = id; cur != null; cur = parent.get(cur)) {
		const n = nodes.get(cur);
		if (n.callFrame.url.includes('packages/backend/built/')) return label(n);
	}
	return '(no app frame)';
};

// サンプルの時刻（µs、起動時からの monotonic）
const times = [];
let t = prof.startTime;
for (const d of prof.timeDeltas) { t += d; times.push(t); }

// 1秒ごとの使用率
const secs = new Map();
for (let i = 0; i < prof.samples.length; i++) {
	const s = Math.floor((times[i] - prof.startTime) / 1e6);
	if (!secs.has(s)) secs.set(s, { total: 0, busy: 0 });
	const e = secs.get(s);
	e.total++;
	if (!isIdle(nodes.get(prof.samples[i]))) e.busy++;
}
const busySecs = new Set([...secs.entries()].filter(([, e]) => e.total > 0 && e.busy / e.total >= BUSY).map(([s]) => s));

// 連続した張り付きの区間
const ranges = [];
for (const s of [...busySecs].sort((a, b) => a - b)) {
	const last = ranges[ranges.length - 1];
	if (last && s === last[1] + 1) last[1] = s; else ranges.push([s, s]);
}

// 集計
function aggregate(pick) {
	const self = new Map(), incl = new Map(), app = new Map();
	let n = 0;
	for (let i = 0; i < prof.samples.length; i++) {
		const s = Math.floor((times[i] - prof.startTime) / 1e6);
		if (!pick(s)) continue;
		const id = prof.samples[i];
		const node = nodes.get(id);
		if (isIdle(node)) continue;
		n++;
		self.set(label(node), (self.get(label(node)) ?? 0) + 1);
		const seen = new Set();
		for (let cur = id; cur != null; cur = parent.get(cur)) {
			const l = label(nodes.get(cur));
			if (seen.has(l)) continue;
			seen.add(l);
			incl.set(l, (incl.get(l) ?? 0) + 1);
		}
		const a = appFrame(id);
		app.set(a, (app.get(a) ?? 0) + 1);
	}
	return { n, self, incl, app };
}
const top = (m, n, total) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, v]) => `  ${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');

const dur = (times[times.length - 1] - prof.startTime) / 1e6;
const totalBusy = [...secs.values()].reduce((a, e) => a + e.busy, 0);
const totalSamples = prof.samples.length;
console.log(`profile: ${dur.toFixed(0)}s, ${totalSamples} samples, mean busy ${(totalBusy / totalSamples * 100).toFixed(1)}%`);
console.log(`busy seconds (>= ${BUSY * 100}%): ${busySecs.size}; ranges ≥3s: ${ranges.filter(r => r[1] - r[0] >= 2).map(r => `${r[0]}-${r[1]}s`).join(', ') || 'none'}`);

const inBusy = aggregate(s => busySecs.has(s));
const outBusy = aggregate(s => !busySecs.has(s));
for (const [title, agg] of [['BUSY seconds', inBusy], ['other seconds', outBusy]]) {
	if (agg.n === 0) continue;
	console.log(`\n### ${title}: ${agg.n} non-idle samples`);
	console.log(`-- nearest Engawa frame (where the time is spent, by app code)\n${top(agg.app, TOP, agg.n)}`);
	console.log(`-- self time\n${top(agg.self, TOP, agg.n)}`);
}
console.log(`\n### inclusive time in BUSY seconds (functions on the stack)\n${top(inBusy.incl, TOP * 2, inBusy.n || 1)}`);
