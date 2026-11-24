/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { ReloadableList, replaceById } from '@/misc/reloadable-list.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(r => { resolve = r; });
	return { promise, resolve };
}

describe('ReloadableList', () => {
	test('同時に呼ばれた読み込みは1つにまとめる', async () => {
		const read = deferred<string[]>();
		const fetcher = vi.fn(() => read.promise);
		const list = new ReloadableList(fetcher);

		const a = list.get();
		const b = list.get();
		read.resolve(['x']);

		expect(await a).toEqual(['x']);
		expect(await b).toEqual(['x']);
		expect(fetcher).toHaveBeenCalledTimes(1);
		// 読み込んだ一覧を保存している
		expect(await list.get()).toEqual(['x']);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	test('読み込みに失敗したら再試行する', async () => {
		const fetcher = vi.fn()
			.mockRejectedValueOnce(new Error('1'))
			.mockRejectedValueOnce(new Error('2'))
			.mockResolvedValueOnce(['x']);
		const onError = vi.fn();
		const list = new ReloadableList<string>(fetcher, { retryDelays: [1, 1], onError });

		expect(await list.get()).toEqual(['x']);
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(onError).not.toHaveBeenCalled();
	});

	test('再試行しても失敗したら、onErrorを呼んで例外を投げる。次の取得で読み直す', async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error('down'));
		const onError = vi.fn();
		const list = new ReloadableList<string>(fetcher, { retryDelays: [1, 1], onError });

		await expect(list.get()).rejects.toThrow('down');
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(onError).toHaveBeenCalledTimes(1);

		fetcher.mockResolvedValueOnce(['x']);
		expect(await list.get()).toEqual(['x']);
	});

	test('読み込み中に捨てたら、その読み込みの結果は保存せず、待っている呼び出し元にも返さない', async () => {
		const first = deferred<string[]>();
		const fetcher = vi.fn()
			.mockImplementationOnce(() => first.promise)
			.mockResolvedValueOnce(['new']);
		const list = new ReloadableList<string>(fetcher);

		const waiting = list.get();
		list.invalidate();
		// 捨てる前に始めた読み込みは待たない
		expect(await list.get()).toEqual(['new']);

		first.resolve(['old']);
		// 先に待っていた呼び出し元も、捨てた後の一覧を受け取る
		expect(await waiting).toEqual(['new']);
		expect(await list.get()).toEqual(['new']);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	test('読み込み中に差分更新したら、その読み込みの結果は保存しない', async () => {
		const first = deferred<string[]>();
		const fetcher = vi.fn()
			.mockImplementationOnce(() => first.promise)
			.mockResolvedValueOnce(['fresh']);
		const list = new ReloadableList<string>(fetcher);

		const waiting = list.get();
		list.modify(items => [...items, 'added']);
		first.resolve(['old']);

		expect(await waiting).toEqual(['fresh']);
		expect(await list.get()).toEqual(['fresh']);
	});

	test('読み込み済みの一覧には差分を反映する', async () => {
		const list = new ReloadableList<string>(async () => ['a']);
		await list.get();
		list.modify(items => [...items, 'b']);
		expect(await list.get()).toEqual(['a', 'b']);
	});
});

describe('replaceById', () => {
	const a = { id: 'a', v: 1 };
	const b = { id: 'b', v: 1 };

	test('置き換え・追加・削除', () => {
		expect(replaceById([a, b], 'a', { id: 'a', v: 2 })).toEqual([{ id: 'a', v: 2 }, b]);
		expect(replaceById([a], 'b', b)).toEqual([a, b]);
		expect(replaceById([a, b], 'a', null)).toEqual([b]);
		expect(replaceById([a], 'x', null)).toEqual([a]);
	});
});
