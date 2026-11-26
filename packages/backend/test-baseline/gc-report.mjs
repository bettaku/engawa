// SPDX-License-Identifier: AGPL-3.0-only
// RUST-02: --trace-gc の出力（compose.gc.yml で起動したときの web のログ）を、プロセスごと・時間の区切りごとに集計する。
//
//   node gc-report.mjs results/<name>.web.log [--window 10]
//
// 1行の例:
//   [146:0xffffb4f10000]     4246 ms: Scavenge 259.3 (304.6) -> 232.8 (304.9) MB, pooled: 0 MB, 2.48 / 0.00 ms  (average mu = 0.988, current mu = 0.987) allocation failure;
//   [8:0x...]  812345 ms: Mark-Compact 1050.2 (1090.1) -> 1041.7 (1088.3) MB, pooled: 0 MB, 1302.11 / 0.00 ms  (average mu = 0.120, current mu = 0.035) allocation failure; ...
// 時刻はプロセス起動からの経過ミリ秒。heap の値は「使用中 (確保済み)」。mu はGC以外に使えた時間の割合。

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values: opts, positionals } = parseArgs({ allowPositionals: true, options: { window: { type: 'string', default: '10' } } });
const windowMs = Number(opts.window) * 1000;
const text = await readFile(positionals[0], 'utf8');

const LINE = /\[(\d+):0x[0-9a-f]+\]\s+(\d+) ms: ([A-Za-z-]+(?: \([a-z ]+\))?) ([\d.]+) \(([\d.]+)\) -> ([\d.]+) \(([\d.]+)\) MB,.*?([\d.]+) \/ ([\d.]+) ms.*?current mu = ([\d.]+)\)\s*(.*)$/;

const byPid = new Map();
for (const raw of text.split('\n')) {
	const m = raw.match(LINE);
	if (!m) continue;
	const [, pid, t, kind, before, , after, committed, pause, , mu, reason] = m;
	if (!byPid.has(pid)) byPid.set(pid, []);
	byPid.get(pid).push({ t: Number(t), kind, before: Number(before), after: Number(after), committed: Number(committed), pause: Number(pause), mu: Number(mu), reason: reason.replace(/;.*$/, '').trim() });
}

for (const [pid, events] of byPid) {
	const t0 = events[0].t;
	const windows = new Map();
	for (const e of events) {
		const w = Math.floor((e.t - t0) / windowMs);
		if (!windows.has(w)) windows.set(w, { scav: 0, mc: 0, pauseMs: 0, mcPauseMs: 0, afterMax: 0, minMu: 1 });
		const s = windows.get(w);
		const isMc = e.kind.startsWith('Mark');
		if (isMc) { s.mc++; s.mcPauseMs += e.pause; } else s.scav++;
		s.pauseMs += e.pause;
		s.afterMax = Math.max(s.afterMax, e.after);
		s.minMu = Math.min(s.minMu, e.mu);
	}
	const mcs = events.filter(e => e.kind.startsWith('Mark'));
	console.log(`\n== pid ${pid}: ${events.length} GCs (${mcs.length} mark-compact), heap after: first ${events[0].after}MB, last ${events[events.length - 1].after}MB, max ${Math.max(...events.map(e => e.after))}MB`);
	console.log(`   longest pause ${Math.max(...events.map(e => e.pause)).toFixed(1)}ms; total pause ${(events.reduce((a, e) => a + e.pause, 0) / 1000).toFixed(1)}s`);
	console.log('   window(s)  scav  m-c  pause(ms)  m-c pause(ms)  heap-after-max(MB)  min-mu');
	for (const [w, s] of [...windows.entries()].sort((a, b) => a[0] - b[0])) {
		// GC が区間の半分以上を占めた区間、または mark-compact が3回以上の区間だけ印を付ける
		const flag = s.pauseMs > windowMs / 2 || s.mc >= 3 ? '  <<<' : '';
		console.log(`   ${String(w * opts.window).padStart(9)}  ${String(s.scav).padStart(4)}  ${String(s.mc).padStart(3)}  ${s.pauseMs.toFixed(0).padStart(9)}  ${s.mcPauseMs.toFixed(0).padStart(13)}  ${s.afterMax.toFixed(1).padStart(18)}  ${s.minMu.toFixed(3).padStart(6)}${flag}`);
	}
	const reasons = new Map();
	for (const e of mcs) reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + 1);
	if (reasons.size) console.log(`   mark-compact reasons: ${[...reasons.entries()].map(([r, n]) => `${r} ×${n}`).join(', ')}`);
}
