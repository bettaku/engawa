/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkNewRelease, checkNewTopic } from '../src/checker.js';
import { Release, ReleaseCategory } from '../src/parser.js';

function release(name: string, categories: Record<string, string[]> = {}): Release {
	return new Release(
		name,
		Object.entries(categories).map(([categoryName, items]) => new ReleaseCategory(categoryName, items)),
	);
}

describe('checkNewRelease', () => {
	it('head側にリリースが1つ追加されていれば成功', () => {
		const base = [release('1.0.0'), release('0.9.0')];
		const head = [release('1.1.0'), release('1.0.0'), release('0.9.0')];

		assert.equal(checkNewRelease(base, head).success, true);
	});

	it('head側にリリースが複数追加されていても、境界が一致していれば成功', () => {
		const base = [release('1.0.0')];
		const head = [release('1.2.0'), release('1.1.0'), release('1.0.0')];

		assert.equal(checkNewRelease(base, head).success, true);
	});

	it('リリースが増えていない場合は失敗', () => {
		const base = [release('1.0.0')];
		const head = [release('1.0.0')];

		const result = checkNewRelease(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'Invalid release count.');
	});

	it('リリースが減っている場合は失敗', () => {
		const base = [release('1.0.0'), release('0.9.0')];
		const head = [release('1.0.0')];

		const result = checkNewRelease(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'Invalid release count.');
	});

	it('既存リリースが書き換えられている場合は失敗', () => {
		const base = [release('1.0.0'), release('0.9.0')];
		const head = [release('1.1.0'), release('1.0.1'), release('0.9.0')];

		const result = checkNewRelease(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'Contains unexpected releases.');
	});
});

describe('checkNewTopic', () => {
	it('最新リリースの既存カテゴリに項目が追加されていれば成功', () => {
		const base = [
			release('1.1.0', { General: ['a'] }),
			release('1.0.0', { General: ['x'] }),
		];
		const head = [
			release('1.1.0', { General: ['a', 'b'] }),
			release('1.0.0', { General: ['x'] }),
		];

		assert.equal(checkNewTopic(base, head).success, true);
	});

	it('最新リリースにカテゴリごと追加されていれば成功', () => {
		const base = [
			release('1.1.0', { General: ['a'] }),
			release('1.0.0', { General: ['x'] }),
		];
		const head = [
			release('1.1.0', { General: ['a'], Client: ['b'] }),
			release('1.0.0', { General: ['x'] }),
		];

		assert.equal(checkNewTopic(base, head).success, true);
	});

	it('差分がなくても成功', () => {
		const base = [release('1.0.0', { General: ['x'] })];
		const head = [release('1.0.0', { General: ['x'] })];

		assert.equal(checkNewTopic(base, head).success, true);
	});

	it('項目の書き換えだけであれば成功', () => {
		const base = [release('1.0.0', { General: ['x'] })];
		const head = [release('1.0.0', { General: ['typoを直したx'] })];

		assert.equal(checkNewTopic(base, head).success, true);
	});

	it('リリース数が変わっている場合は失敗', () => {
		const base = [release('1.0.0')];
		const head = [release('1.1.0'), release('1.0.0')];

		const result = checkNewTopic(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'Invalid release count.');
	});

	it('リリース名が変わっている場合は失敗', () => {
		const base = [release('1.0.0')];
		const head = [release('1.0.1')];

		const result = checkNewTopic(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'Release is different. base:1.0.0, head:1.0.1');
	});

	it('カテゴリ名が変わっている場合は失敗', () => {
		const base = [release('1.0.0', { General: ['x'] })];
		const head = [release('1.0.0', { Client: ['x'] })];

		const result = checkNewTopic(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'Category is different. base:General, head:Client');
	});

	it('最新以外のリリースに項目が追加されている場合は失敗', () => {
		const base = [
			release('1.1.0', { General: ['a'] }),
			release('1.0.0', { General: ['x'] }),
		];
		const head = [
			release('1.1.0', { General: ['a'] }),
			release('1.0.0', { General: ['x', 'y'] }),
		];

		const result = checkNewTopic(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'There is an error in the update history. expected additions:1.1.0, actual additions:1.0.0');
	});

	it('最新以外のリリースにカテゴリが追加されている場合は失敗', () => {
		const base = [
			release('1.1.0', { General: ['a'] }),
			release('1.0.0', { General: ['x'] }),
		];
		const head = [
			release('1.1.0', { General: ['a'] }),
			release('1.0.0', { General: ['x'], Client: ['y'] }),
		];

		const result = checkNewTopic(base, head);
		assert.equal(result.success, false);
		assert.equal(result.message, 'There is an error in the update history. expected additions:1.1.0, actual additions:1.0.0');
	});
});
