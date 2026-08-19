/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { parseChangeLog } from '../src/parser.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-checker-'));

after(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

let seq = 0;

/**
 * 与えられた内容を一時ファイルに書き出してパースする。
 */
function parse(content: string): ReturnType<typeof parseChangeLog> {
	const filePath = path.join(tmpDir, `CHANGELOG-${seq++}.md`);
	fs.writeFileSync(filePath, content, { encoding: 'utf8' });
	return parseChangeLog(filePath);
}

describe('parseChangeLog', () => {
	it('リリース・カテゴリ・項目を階層どおりに読み取る', () => {
		const releases = parse([
			'# CHANGELOG',
			'',
			'## 1.1.0',
			'',
			'### General',
			'- Feat: 新機能A',
			'- Fix: 不具合B',
			'',
			'### Client',
			'- Fix: 不具合C',
			'',
			'## 1.0.0',
			'',
			'### General',
			'- 初回リリース',
			'',
		].join('\n'));

		assert.equal(releases.length, 2);

		assert.equal(releases[0].releaseName, '1.1.0');
		assert.deepEqual(releases[0].categories.map(it => it.categoryName), ['General', 'Client']);
		assert.deepEqual(releases[0].categories[0].items, ['Feat: 新機能A', 'Fix: 不具合B']);
		assert.deepEqual(releases[0].categories[1].items, ['Fix: 不具合C']);

		assert.equal(releases[1].releaseName, '1.0.0');
		assert.deepEqual(releases[1].categories.map(it => it.categoryName), ['General']);
		assert.deepEqual(releases[1].categories[0].items, ['初回リリース']);
	});

	it('見出し・項目の前後の空白を除去する', () => {
		const releases = parse([
			'##   1.0.0   ',
			'###   General   ',
			'-   項目   ',
		].join('\n'));

		assert.equal(releases[0].releaseName, '1.0.0');
		assert.equal(releases[0].categories[0].categoryName, 'General');
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('CRLF改行でも読み取れる', () => {
		const releases = parse('## 1.0.0\r\n### General\r\n- 項目\r\n');

		assert.equal(releases[0].releaseName, '1.0.0');
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('コードフェンス内の見出し・項目は無視する', () => {
		const releases = parse([
			'## 1.0.0',
			'### General',
			'- 項目',
			'',
			'```md',
			'## 9.9.9',
			'### Fake',
			'- フェンス内の項目',
			'```',
			'',
			'- フェンス後の項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories.map(it => it.categoryName), ['General']);
		assert.deepEqual(releases[0].categories[0].items, ['項目', 'フェンス後の項目']);
	});

	it('チルダのコードフェンスも無視する', () => {
		const releases = parse([
			'## 1.0.0',
			'### General',
			'~~~',
			'## 9.9.9',
			'~~~',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('開始フェンスより短い終了フェンスではフェンスを閉じない', () => {
		const releases = parse([
			'## 1.0.0',
			'### General',
			'````md',
			'```',
			'## 9.9.9',
			'```',
			'````',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('開始フェンスより長い終了フェンスではフェンスを閉じる', () => {
		const releases = parse([
			'## 1.0.0',
			'### General',
			'```',
			'## 9.9.9',
			'````',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('文字種の異なるフェンスではフェンスを閉じない', () => {
		const releases = parse([
			'## 1.0.0',
			'### General',
			'```',
			'~~~',
			'## 9.9.9',
			'```',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('後続に文字のあるフェンスではフェンスを閉じない', () => {
		const releases = parse([
			'## 1.0.0',
			'### General',
			'```',
			'## 9.9.9',
			'``` md',
			'## 8.8.8',
			'```',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('HTMLコメント内のテンプレートは無視する', () => {
		const releases = parse([
			'<!--',
			'## x.x.x (unreleased)',
			'',
			'### General',
			'- ',
			'-->',
			'',
			'## 1.0.0',
			'### General',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.equal(releases[0].releaseName, '1.0.0');
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('行内で閉じるHTMLコメントだけを取り除く', () => {
		const releases = parse([
			'## 1.0.0 <!-- 補足 -->',
			'### General <!-- 補足 -->',
			'- 項目 <!-- 補足 -->',
			'<!-- - コメントアウトされた項目 -->',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.equal(releases[0].releaseName, '1.0.0');
		assert.equal(releases[0].categories[0].categoryName, 'General');
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('コードフェンス内のHTMLコメント開始はコメントとして扱わない', () => {
		const releases = parse([
			'## 1.0.0',
			'### General',
			'```',
			'<!--',
			'```',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('カテゴリの外にある項目は無視する', () => {
		const releases = parse([
			'- リリース見出しより前の項目',
			'## 1.0.0',
			'- カテゴリ見出しより前の項目',
			'### General',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories[0].items, ['項目']);
	});

	it('リリース見出しより前のカテゴリ見出しは無視する', () => {
		const releases = parse([
			'### Orphan',
			'## 1.0.0',
			'### General',
			'- 項目',
		].join('\n'));

		assert.equal(releases.length, 1);
		assert.deepEqual(releases[0].categories.map(it => it.categoryName), ['General']);
	});

	it('リリースが変わるとカテゴリの追跡もリセットされる', () => {
		const releases = parse([
			'## 1.1.0',
			'### General',
			'- 新しい項目',
			'## 1.0.0',
			'- カテゴリ見出しのない項目',
		].join('\n'));

		assert.equal(releases.length, 2);
		assert.deepEqual(releases[1].categories, []);
	});

	it('空のファイルは空配列になる', () => {
		assert.deepEqual(parse(''), []);
	});
});
