// SPDX-License-Identifier: AGPL-3.0-only
// RUST-02: 1回の計測（k6の結果、cgroupのサンプル、pg_stat_statements）を1つのJSONにまとめる。
//
//   node summarize.mjs results/<name>     → results/<name>.json を書き、1行の要約を出す
//   node summarize.mjs --table results    → results/*.json を results/summary.md の表にする

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const MiB = 1024 * 1024;
const round = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

async function readEnv(path) {
	const text = await readFile(path, 'utf8');
	return Object.fromEntries(text.trim().split('\n').map(l => {
		const i = l.indexOf('=');
		return [l.slice(0, i), l.slice(i + 1)];
	}));
}

function parseSamples(text) {
	const rows = text.trim().split('\n').slice(1).map(l => {
		const [ts, label, container, cpu, anon] = l.split('\t');
		return { ts: Number(ts), label, container, cpu: Number(cpu), anon: Number(anon) };
	});
	const at = (label, container) => rows.find(r => r.label === label && r.container === container);
	return { rows, at };
}

async function summarizeOne(prefix) {
	const k6 = JSON.parse(await readFile(`${prefix}.k6.json`, 'utf8'));
	const env = await readEnv(`${prefix}.env`);
	const { rows, at } = parseSamples(await readFile(`${prefix}.samples.tsv`, 'utf8'));

	const okReqs = Math.round(k6.total.reqs * (1 - (k6.total.failedRate ?? 0)));
	const containers = {};
	for (const c of ['web', 'db', 'redis']) {
		const i0 = at('idle_start', c), i1 = at('idle_end', c);
		const m0 = at('measure_start', c), m1 = at('measure_end', c);
		const idleBefore = (i1.cpu - i0.cpu) / (i1.ts - i0.ts); // usec/s
		const a0 = at('idle_after_start', c), a1 = at('idle_after_end', c);
		const idleAfter = a0 && a1 ? (a1.cpu - a0.cpu) / (a1.ts - a0.ts) : null;
		// cold は計測前の待機区間に起動直後の処理（JIT、初回の接続、定期処理の初回実行）が入るので、計測後の値を使う
		const idleRate = env.cache === 'cold' && idleAfter != null ? idleAfter : idleBefore;
		const dt = m1.ts - m0.ts;
		const rawUsec = m1.cpu - m0.cpu;
		const netUsec = Math.max(0, rawUsec - idleRate * dt);
		const during = rows.filter(r => r.container === c && r.ts >= m0.ts && r.ts <= m1.ts);
		const anon = during.map(r => r.anon);
		// 1スレッドを使い切った状態（0.95〜1.6 コア。上限はGCの補助スレッドの分）だった秒数の合計。
		// 2026-11-24 の i_auth 25rps で、web が約57秒 1 コアに張り付き、DB は暇なまま要求が詰まった
		let pinnedSec = 0;
		for (let k = 1; k < during.length; k++) {
			const dts = during[k].ts - during[k - 1].ts;
			const coresK = dts > 0 ? (during[k].cpu - during[k - 1].cpu) / 1e6 / dts : 0;
			if (coresK >= 0.95 && coresK <= 1.6) pinnedSec += dts;
		}
		containers[c] = {
			singleCorePinnedSec: round(pinnedSec, 1),
			idleCores: round(idleRate / 1e6, 4),
			idleCoresBefore: round(idleBefore / 1e6, 4),
			idleCoresAfter: idleAfter == null ? null : round(idleAfter / 1e6, 4),
			cores: round(rawUsec / 1e6 / dt, 3),
			cpuMsPerOkReq: okReqs > 0 ? round(netUsec / 1000 / okReqs, 3) : null,
			anonMiBMax: round(Math.max(...anon) / MiB, 1),
			anonMiBMean: round(anon.reduce((a, b) => a + b, 0) / anon.length / MiB, 1),
		};
	}

	const pgss = (await readFile(`${prefix}.pgss.tsv`, 'utf8')).trim().split('\n').filter(Boolean).map(l => {
		const [calls, totalMs, meanMs, rowsCount, hit, read, query] = l.split('\t');
		return { calls: Number(calls), totalMs: Number(totalMs), meanMs: Number(meanMs), rows: Number(rowsCount), blksHit: Number(hit), blksRead: Number(read), query };
	});
	// 計測区間に実行した文の合計（上位40文の合計なので、下限値である）
	const db = {
		calls: pgss.reduce((a, r) => a + r.calls, 0),
		execMs: round(pgss.reduce((a, r) => a + r.totalMs, 0), 1),
		blksRead: pgss.reduce((a, r) => a + r.blksRead, 0),
	};
	db.callsPerOkReq = okReqs > 0 ? round(db.calls / okReqs, 2) : null;
	db.execMsPerOkReq = okReqs > 0 ? round(db.execMs / okReqs, 3) : null;

	// プロセスごとのRSS（kB）。Engawa の master / worker と、それ以外（pnpm の起動ラッパーなど）に分ける
	let processes = null;
	try {
		processes = (await readFile(`${prefix}.procs.tsv`, 'utf8')).trim().split('\n').filter(l => /^\d+\t\d+\t/.test(l)).map(l => {
			const [rss, hwm, cmd] = l.split('\t');
			return { rssMiB: round(Number(rss) / 1024, 1), peakMiB: round(Number(hwm) / 1024, 1), cmd: cmd.trim() };
		}).sort((a, b) => b.rssMiB - a.rssMiB);
	} catch { /* 古い結果にはない */ }
	const engawaRssMiB = processes ? round(processes.filter(p => p.cmd.startsWith('Engawa')).reduce((a, p) => a + p.rssMiB, 0), 1) : null;

	// 疑わしい計測。判定や比較に使う前に、ログ（.web.log）と samples を確かめる
	const suspect = [];
	if (containers.web.singleCorePinnedSec >= 10) suspect.push(`web pinned at 1 core for ${containers.web.singleCorePinnedSec}s`);
	if (k6.total.droppedIterations > k6.total.reqs * 0.01) suspect.push(`dropped ${k6.total.droppedIterations} (>1%)`);
	if ((k6.total.failedRate ?? 0) > 0.01) suspect.push(`failed ${round(k6.total.failedRate * 100, 2)}%`);

	const d = k6.total.durationMs ?? {};
	const out = {
		run: k6.run,
		env,
		scenario: k6.scenario,
		targetRps: k6.rate,
		suspect,
		duration: k6.duration,
		requests: { total: k6.total.reqs, ok: okReqs, failedRate: round(k6.total.failedRate, 5), dropped: k6.total.droppedIterations },
		latencyMs: { p50: round(d.med), p90: round(d['p(90)']), p95: round(d['p(95)']), p99: round(d['p(99)']), max: round(d.max) },
		byEndpoint: Object.fromEntries(Object.entries(k6.byEndpoint).map(([k, v]) => [k, {
			reqs: v.reqs,
			failedRate: round(v.failedRate, 5),
			p50: round(v.durationMs?.med), p95: round(v.durationMs?.['p(95)']), p99: round(v.durationMs?.['p(99)']),
		}])),
		containers,
		engawaRssMiB,
		processes,
		db,
		topQueries: pgss.slice(0, 10),
	};
	await writeFile(`${prefix}.json`, JSON.stringify(out, null, '\t'));
	console.log(`${out.run}: p95=${out.latencyMs.p95}ms p99=${out.latencyMs.p99}ms failed=${round((out.requests.failedRate ?? 0) * 100, 2)}% dropped=${out.requests.dropped} web=${containers.web.cpuMsPerOkReq}cpu-ms/req web-anon-max=${containers.web.anonMiBMax}MiB engawa-rss=${engawaRssMiB}MiB db=${db.execMsPerOkReq}ms/req${suspect.length ? ` SUSPECT: ${suspect.join('; ')}` : ''}`);
	return out;
}

const median = (xs) => {
	const v = xs.filter(x => x != null && !Number.isNaN(x)).sort((p, q) => p - q);
	if (v.length === 0) return null;
	const m = Math.floor(v.length / 2);
	return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

async function table(dir) {
	const files = (await readdir(dir)).filter(f => f.endsWith('.json') && !f.includes('.k6.') && !f.includes('.warmup'));
	const runs = [];
	for (const f of files) runs.push(JSON.parse(await readFile(join(dir, f), 'utf8')));
	runs.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.targetRps - b.targetRps || a.env.cache.localeCompare(b.env.cache) || a.run.localeCompare(b.run));

	// 1回ずつの値
	const runLines = [
		'| 計測 | シナリオ | 到着率 | cache | 成功 | 失敗率 | 取りこぼし | p50 | p95 | p99 | web CPU ms/要求 | web cores | Engawa RSS MiB | DB 実行ms/要求 | DB 文/要求 | 疑わしい点 |',
		'| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
	];
	for (const r of runs) {
		runLines.push(`| ${r.run} | ${r.scenario} | ${r.targetRps} | ${r.env.cache} | ${r.requests.ok} | ${round((r.requests.failedRate ?? 0) * 100, 2)}% | ${r.requests.dropped} | ${r.latencyMs.p50} | ${r.latencyMs.p95} | ${r.latencyMs.p99} | ${r.containers.web.cpuMsPerOkReq} | ${r.containers.web.cores} | ${r.engawaRssMiB ?? ''} | ${r.db.execMsPerOkReq} | ${r.db.callsPerOkReq} | ${(r.suspect ?? []).join('; ')} |`);
	}
	await writeFile(join(dir, 'runs.md'), `${runLines.join('\n')}\n`);

	// 条件ごとの中央値。疑わしい計測（suspect）は除き、除いた数を残す
	const groups = new Map();
	for (const r of runs) {
		const key = [r.env.commit, r.env.scale, r.scenario, r.targetRps, r.env.cache].join('|');
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(r);
	}
	const lines = [
		'| commit | 規模 | シナリオ | 到着率 | cache | 採用/計測 | p50 | p95 | p99 | p95の幅 | web CPU ms/要求 | Engawa RSS MiB | DB 実行ms/要求 | DB 文/要求 |',
		'| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |',
	];
	for (const [key, rs] of groups) {
		const [commit, scale, scenario, rate, cache] = key.split('|');
		const ok = rs.filter(r => (r.suspect ?? []).length === 0);
		const use = ok.length > 0 ? ok : [];
		const m = (f) => round(median(use.map(f)), 2);
		const p95s = use.map(r => r.latencyMs.p95).filter(x => x != null);
		const range = p95s.length > 1 ? `${round(Math.min(...p95s), 1)}〜${round(Math.max(...p95s), 1)}` : '';
		lines.push(`| ${commit} | ${scale} | ${scenario} | ${rate} | ${cache} | ${use.length}/${rs.length} | ${m(r => r.latencyMs.p50) ?? ''} | ${m(r => r.latencyMs.p95) ?? ''} | ${m(r => r.latencyMs.p99) ?? ''} | ${range} | ${m(r => r.containers.web.cpuMsPerOkReq) ?? ''} | ${m(r => r.engawaRssMiB) ?? ''} | ${m(r => r.db.execMsPerOkReq) ?? ''} | ${m(r => r.db.callsPerOkReq) ?? ''} |`);
	}
	await writeFile(join(dir, 'summary.md'), `${lines.join('\n')}\n`);
	console.log(lines.join('\n'));
}

if (process.argv[2] === '--table') {
	await table(process.argv[3] ?? 'results');
} else {
	await summarizeOne(process.argv[2]);
}
