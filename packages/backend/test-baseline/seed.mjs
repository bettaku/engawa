// SPDX-License-Identifier: AGPL-3.0-only
// RUST-02: 計測用のデータを公開APIだけで投入する。
//
// DBへ直接書かず、本番と同じ書き込み経路（カウンタ・outbox・キャッシュ）を通す。
// 乱数は --seed で固定するが、IDと作成時刻は実行ごとに変わる。再現性はこの投入の後に取る
// DBのスナップショット（run.sh snapshot）で担保する。
//
// 使い方: node seed.mjs --url http://127.0.0.1:61900 [--scale small|medium|large] [--seed 1]

import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
	options: {
		url: { type: 'string', default: 'http://127.0.0.1:61900' },
		scale: { type: 'string', default: 'small' },
		seed: { type: 'string', default: '1' },
		concurrency: { type: 'string', default: '8' },
		setupPassword: { type: 'string', default: 'baseline-setup-password' },
		out: { type: 'string', default: join(here, 'fixture', 'fixture.json') },
	},
});

// 規模ごとの量。本番のアクセスログとDBの件数が分かったら、ここを実測に合わせる（README「規模を合わせる」）
const SCALES = {
	small: { users: 50, notes: 3000, followsPerUser: 15, emojis: 200, reactions: 3000 },
	medium: { users: 200, notes: 20000, followsPerUser: 40, emojis: 600, reactions: 20000 },
	large: { users: 1000, notes: 100000, followsPerUser: 80, emojis: 1500, reactions: 100000 },
};
const scale = SCALES[args.scale];
if (scale == null) throw new Error(`unknown scale: ${args.scale}`);

const base = args.url.replace(/\/$/, '');
const concurrency = Number(args.concurrency);

// mulberry32: 依存なしで再現できる乱数
let rngState = Number(args.seed) >>> 0;
function rand() {
	rngState = (rngState + 0x6D2B79F5) >>> 0;
	let t = rngState;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
// 投稿数の偏り（少数の利用者が多く投稿する）を近似する
const zipfIndex = (n, s = 1.1) => Math.min(n - 1, Math.floor(n * rand() ** (1 + s)));

async function api(endpoint, body = {}, token) {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${base}/api/${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(token ? { ...body, i: token } : body),
		});
		if (res.status === 204) return null;
		const json = await res.json().catch(() => null);
		if (res.ok) return json;
		// 投入中の一時的な失敗（起動直後の接続など）だけ再試行する
		if (res.status >= 500 && attempt < 3) {
			await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
			continue;
		}
		const err = new Error(`${endpoint} ${res.status}: ${JSON.stringify(json?.error ?? json)}`);
		err.apiError = json?.error;
		throw err;
	}
}

async function pool(items, fn) {
	let next = 0;
	let done = 0;
	const total = items.length;
	const label = fn.name || 'task';
	const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
		while (next < total) {
			const i = next++;
			await fn(items[i], i);
			done++;
			if (done % 500 === 0 || done === total) process.stderr.write(`  ${label}: ${done}/${total}\n`);
		}
	});
	await Promise.all(workers);
}

async function waitForServer() {
	for (let i = 0; i < 180; i++) {
		try {
			const res = await fetch(`${base}/healthz`);
			if (res.ok) return;
		} catch { /* 起動待ち */ }
		await new Promise(r => setTimeout(r, 1000));
	}
	throw new Error('server did not become healthy');
}

// 1x1の透明PNG。絵文字の画像はすべてこの1ファイルを共有する（一覧APIは画像を読まない）
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const WORDS = ['engawa', 'misskey', 'rust', 'node', 'お茶', '縁側', '今日', 'いい天気', 'ねこ', 'ごはん', 'コーヒー', '散歩', 'テスト', 'fediverse', 'note', 'timeline'];
const TAGS = ['engawa', 'misskey', 'rust', 'photo', 'cat', '今日のごはん'];

async function main() {
	const startedAt = Date.now();
	console.error(`seed: ${base} scale=${args.scale} seed=${args.seed}`);
	await waitForServer();

	const admin = await api('admin/accounts/create', {
		username: 'admin',
		password: 'baseline-admin-password',
		setupPassword: args.setupPassword,
	});
	const adminToken = admin.token;

	// 利用者
	const users = [];
	await pool(Array.from({ length: scale.users }, (_, i) => i), async function users_(i) {
		const u = await api('admin/accounts/create', {
			username: `user${String(i).padStart(5, '0')}`,
			password: 'baseline-user-password',
		}, adminToken);
		users[i] = { id: u.id, username: u.username, token: u.token };
	});

	// 絵文字（RUST-06の最初の対象。カテゴリと別名を散らす）
	const form = new FormData();
	form.set('i', adminToken);
	form.set('file', new Blob([PNG_1x1], { type: 'image/png' }), 'emoji.png');
	const fileRes = await fetch(`${base}/api/drive/files/create`, { method: 'POST', body: form });
	if (!fileRes.ok) throw new Error(`drive/files/create ${fileRes.status}: ${await fileRes.text()}`);
	const file = await fileRes.json();
	const categories = [null, 'blob', 'face', 'food', 'animal', 'engawa', 'text', 'flag/jp', 'flag/other'];
	const emojiNames = [];
	await pool(Array.from({ length: scale.emojis }, (_, i) => i), async function emojis(i) {
		const name = `bl_${String(i).padStart(4, '0')}`;
		await api('admin/emoji/add', {
			name,
			fileId: file.id,
			category: pick(categories),
			aliases: rand() < 0.5 ? [`alias${i}`, pick(WORDS)] : [],
			isSensitive: rand() < 0.02,
			localOnly: rand() < 0.05,
			license: rand() < 0.1 ? 'CC0' : null,
		}, adminToken);
		emojiNames.push(name);
	});

	// フォロー
	const followPairs = [];
	for (let i = 0; i < users.length; i++) {
		const targets = new Set();
		const want = Math.min(scale.followsPerUser, users.length - 1);
		while (targets.size < want) {
			const j = zipfIndex(users.length, 0.6);
			if (j !== i) targets.add(j);
		}
		for (const j of targets) followPairs.push([i, j]);
	}
	await pool(followPairs, async function follows([i, j]) {
		try {
			await api('following/create', { userId: users[j].id }, users[i].token);
		} catch (e) {
			if (e.apiError?.code !== 'ALREADY_FOLLOWING') throw e;
		}
	});

	// ノート。公開範囲・返信・Renote・メンション・ハッシュタグ・絵文字を混ぜる
	const notes = [];
	const targets = [];
	const plan = Array.from({ length: scale.notes }, () => {
		const r = rand();
		return {
			author: zipfIndex(users.length),
			visibility: r < 0.7 ? 'public' : r < 0.85 ? 'home' : r < 0.97 ? 'followers' : 'specified',
			kind: rand() < 0.15 ? 'reply' : rand() < 0.1 ? 'renote' : 'plain',
			text: Array.from({ length: 1 + Math.floor(rand() * 12) }, () => pick(WORDS)).join(' '),
			tag: rand() < 0.15 ? pick(TAGS) : null,
			mention: rand() < 0.1 ? Math.floor(rand() * users.length) : null,
			emoji: rand() < 0.2 ? Math.floor(rand() * scale.emojis) : null,
			cw: rand() < 0.03,
		};
	});
	await pool(plan, async function notes_(p) {
		const author = users[p.author];
		const body = { visibility: p.visibility };
		let text = p.text;
		if (p.tag) text += ` #${p.tag}`;
		if (p.mention != null) text = `@${users[p.mention].username} ${text}`;
		if (p.emoji != null && emojiNames.length > 0) text += ` :${emojiNames[p.emoji % emojiNames.length]}:`;
		if (p.visibility === 'specified') body.visibleUserIds = [users[(p.author + 1) % users.length].id];
		if (p.kind === 'renote' && targets.length > 0) {
			body.renoteId = pick(targets).id;
			body.visibility = 'public';
		} else {
			body.text = text;
			if (p.cw) body.cw = '注意';
			if (p.kind === 'reply' && targets.length > 0) body.replyId = pick(targets).id;
		}
		try {
			const res = await api('notes/create', body, author.token);
			const note = { id: res.createdNote.id, visibility: res.createdNote.visibility, userId: author.id, pureRenote: body.renoteId != null };
			notes.push(note);
			// 返信・Renote・リアクションの対象は、公開の通常ノートに限る（純粋なRenoteには返信もリアクションもできない）
			if (note.visibility === 'public' && !note.pureRenote) targets.push(note);
		} catch (e) {
			// 並行して作ったRenoteを対象に選んだ場合などは捨てる
			if (!['CANNOT_RENOTE_TO_A_PURE_RENOTE', 'CANNOT_REPLY_TO_A_PURE_RENOTE'].includes(e.apiError?.code)) throw e;
		}
	});

	// リアクション（Unicode絵文字とカスタム絵文字）
	const publicNotes = targets;
	const reactions = ['👍', '❤️', '😆', '🎉', '🍵', ...emojiNames.slice(0, 20).map(n => `:${n}:`)];
	const reactionPlan = Array.from({ length: scale.reactions }, () => [zipfIndex(publicNotes.length, 0.8), Math.floor(rand() * users.length), pick(reactions)]);
	await pool(reactionPlan, async function reactions_([n, u, reaction]) {
		try {
			await api('notes/reactions/create', { noteId: publicNotes[n].id, reaction }, users[u].token);
		} catch (e) {
			if (e.apiError?.code !== 'ALREADY_REACTED') throw e;
		}
	});

	const fixture = {
		generatedAt: new Date().toISOString(),
		scale: args.scale,
		seed: Number(args.seed),
		counts: { users: users.length, notes: notes.length, publicNotes: publicNotes.length, emojis: emojiNames.length, follows: followPairs.length, reactions: scale.reactions },
		// 計測環境の中だけで有効なトークン。fixture/ は git に入れない
		users,
		publicNoteIds: publicNotes.map(n => n.id),
	};
	await mkdir(dirname(args.out), { recursive: true });
	await writeFile(args.out, JSON.stringify(fixture));
	console.error(`seed: done in ${Math.round((Date.now() - startedAt) / 1000)}s → ${args.out}`);
	console.error(JSON.stringify(fixture.counts));
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
