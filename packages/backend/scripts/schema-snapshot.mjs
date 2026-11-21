/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// migrationをすべて適用したDBのスキーマ（pg_dump --schema-only）を正規化し、
// リポジトリのスナップショット（schema/schema.sql）と比べる、または書き出す。
// docs/rust-migration/db-schema.md を参照。
//
//   node scripts/schema-snapshot.mjs          # スナップショットを書き出す
//   node scripts/schema-snapshot.mjs --check  # 差分があれば表示して失敗する
//
// 環境変数:
//   PG_DUMP_DOCKER_CONTAINER  pg_dump をこのコンテナの中で実行する（ホストに PostgreSQL 15 の pg_dump がない場合）
//   PG_DUMP                   ホストで実行する pg_dump のパス（既定: pg_dump）

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../built/config.js';

// スナップショットを作るときの PostgreSQL のメジャーバージョン。pg_dump の出力は版によって変わるので固定する。
const PG_MAJOR = 15;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.resolve(__dirname, '../schema/schema.sql');
const check = process.argv.includes('--check');

const config = loadConfig();
const container = process.env.PG_DUMP_DOCKER_CONTAINER;

function runPgDump(args) {
	const pgDumpArgs = [
		'--schema-only',
		'--no-owner',
		'--no-privileges',
		'--no-tablespaces',
		'--username', config.db.user,
		'--dbname', config.db.db,
		...args,
	];

	if (container) {
		// コンテナの中ではUNIXソケットで接続する（設定ファイルのhost・portはホストから見たもの）
		return execFileSync('docker', [
			'exec',
			...(config.db.pass ? ['-e', `PGPASSWORD=${config.db.pass}`] : []),
			container,
			'pg_dump',
			...pgDumpArgs,
		], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	}

	return execFileSync(process.env.PG_DUMP ?? 'pg_dump', [
		'--host', config.db.host,
		'--port', String(config.db.port),
		...pgDumpArgs,
	], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		env: { ...process.env, ...(config.db.pass ? { PGPASSWORD: config.db.pass } : {}) },
	});
}

function pgDumpVersion() {
	const out = container
		? execFileSync('docker', ['exec', container, 'pg_dump', '--version'], { encoding: 'utf8' })
		: execFileSync(process.env.PG_DUMP ?? 'pg_dump', ['--version'], { encoding: 'utf8' });
	const match = /\(PostgreSQL\)\s+(\d+)/.exec(out);
	if (match == null) throw new Error(`Cannot parse pg_dump version: ${out}`);
	return Number(match[1]);
}

/**
 * pg_dumpの出力から、実行ごと・環境ごとに変わる部分を除く。
 * - コメント行（ダンプした日時や版を含む）
 * - セッション設定（SET、set_config）
 * - \restrict・\unrestrict（実行ごとに乱数のキーが入る）
 * - 連続する空行
 */
function normalizeSchemaDump(dump) {
	const lines = dump.replace(/\r\n/g, '\n').split('\n')
		.filter(line => !line.startsWith('--'))
		.filter(line => !/^SET\s/.test(line))
		.filter(line => !line.startsWith('SELECT pg_catalog.set_config('))
		.filter(line => !/^\\(un)?restrict\b/.test(line))
		.map(line => line.replace(/\s+$/, ''));

	const out = [];
	for (const line of lines) {
		if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
		out.push(line);
	}
	while (out.length > 0 && out[out.length - 1] === '') out.pop();
	return out.join('\n') + '\n';
}

const major = pgDumpVersion();
if (major !== PG_MAJOR) {
	console.error(`pg_dump ${major} is used, but the schema snapshot must be taken with pg_dump ${PG_MAJOR}.`);
	console.error('Set PG_DUMP_DOCKER_CONTAINER to a running postgres:15 container (e.g. the one from packages/backend/test/compose.yml), or PG_DUMP to a pg_dump 15 binary.');
	process.exit(1);
}

const actual = normalizeSchemaDump(runPgDump([]));

if (!check) {
	fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
	fs.writeFileSync(snapshotPath, actual);
	console.log(`Wrote ${path.relative(process.cwd(), snapshotPath)}`);
	process.exit(0);
}

const expected = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf8') : '';
if (expected === actual) {
	console.log('The database schema matches the snapshot.');
	process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-snapshot-'));
const actualPath = path.join(tmp, 'schema.sql');
fs.writeFileSync(actualPath, actual);
const diff = spawnSync('diff', ['-u', '--label', 'schema/schema.sql (snapshot)', '--label', 'database (after migrations)', snapshotPath, actualPath], { encoding: 'utf8' });
console.error('The database schema after migrations differs from schema/schema.sql.');
console.error('If the migration is intended, run `pnpm --filter backend schema:snapshot` against a database with all migrations applied and commit the result.');
console.error(diff.stdout || diff.stderr);
process.exit(1);
