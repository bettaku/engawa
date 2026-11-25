// SPDX-License-Identifier: AGPL-3.0-only
// RUST-02: インスペクタ（compose.prof.yml）経由で、動いている web のプロセスの CPU プロファイルを取る。
//
//   node prof-capture.mjs [--port 9229] [--seconds 600] [--interval 1000] --out results/prof/master.cpuprofile
//
// --port 9229 が master（HTTP を受ける）、9230 が worker（ジョブキュー）。

import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
	options: {
		port: { type: 'string', default: '9229' },
		seconds: { type: 'string', default: '600' },
		interval: { type: 'string', default: '1000' },
		out: { type: 'string' },
	},
});
if (!opts.out) throw new Error('--out is required');

const list = await (await fetch(`http://127.0.0.1:${opts.port}/json/list`)).json();
const url = list[0].webSocketDebuggerUrl.replace(/\/\/[^/]+\//, `//127.0.0.1:${opts.port}/`);
const ws = new WebSocket(url);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
	}
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
	const id = nextId++;
	pending.set(id, { resolve, reject });
	ws.send(JSON.stringify({ id, method, params }));
});

await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: Number(opts.interval) });
await send('Profiler.start');
console.error(`profiling ${list[0].title} (port ${opts.port}) for ${opts.seconds}s`);
await new Promise(r => setTimeout(r, Number(opts.seconds) * 1000));
const { profile } = await send('Profiler.stop');
await writeFile(opts.out, JSON.stringify(profile));
console.error(`wrote ${opts.out} (${profile.samples.length} samples)`);
ws.close();
