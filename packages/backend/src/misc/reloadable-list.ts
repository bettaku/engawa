/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';

/** 読み込みに失敗したときに待つ時間（ミリ秒）。この数だけ再試行する */
export const DEFAULT_RELOAD_RETRY_DELAYS: readonly number[] = [100, 500, 2000];

/**
 * DBから読み込んだ一覧をプロセス内に持ち、内部イベントで差分更新したり捨てたりする。
 *
 * - 読み込みは、同時に呼ばれても1つにまとめる（全員が同じ読み込みを待つ）
 * - 読み込みに失敗したら、`retryDelays` の間隔で再試行する。すべて失敗したら `onError` を呼び、例外を投げる
 * - 読み込み中に捨てられたり（`invalidate`）差分更新されたり（`modify`）したら、読み込んだ一覧（その変更を含まない）は保存せず、
 *   待っている呼び出し元にも返さずに読み直す
 */
export class ReloadableList<T> {
	private items: T[] = [];
	private loaded = false;
	/** 一覧を捨てる・差分更新するたびに進める */
	private generation = 0;
	private loading: { generation: number; promise: Promise<T[]> } | null = null;

	constructor(
		private readonly fetcher: () => Promise<T[]>,
		private readonly opts: {
			onError?: (err: unknown) => void;
			retryDelays?: readonly number[];
		} = {},
	) {}

	/**
	 * 一覧を返す。読み込んでいなければDBから読み込む
	 */
	public async get(): Promise<T[]> {
		for (;;) {
			if (this.loaded) return this.items;

			// 捨てる前に始めた読み込みは、捨てた変更を含まないので待たない
			const generation = this.generation;
			if (this.loading == null || this.loading.generation !== generation) {
				this.loading = { generation, promise: this.load(generation) };
			}
			const items = await this.loading.promise;
			if (generation === this.generation) return items;
			// 待っている間に捨てられたか差分更新された。読み込んだ一覧はその変更を含まない（削除済みの行を含みうる）ので、読み直す
		}
	}

	/**
	 * 一覧を捨てる。次の `get` でDBから読み直す
	 */
	public invalidate(): void {
		this.generation++;
		this.loaded = false;
	}

	/**
	 * 読み込み済みの一覧に差分を反映する。読み込み中の一覧は、この変更を含まないので保存しない
	 */
	public modify(fn: (items: T[]) => T[]): void {
		this.generation++;
		if (this.loaded) {
			this.items = fn(this.items);
		}
	}

	private async load(generation: number): Promise<T[]> {
		try {
			const items = await this.fetchWithRetry();
			if (generation === this.generation) {
				this.items = items;
				this.loaded = true;
			}
			return items;
		} catch (err) {
			this.opts.onError?.(err);
			throw err;
		} finally {
			if (this.loading?.generation === generation) {
				this.loading = null;
			}
		}
	}

	private async fetchWithRetry(): Promise<T[]> {
		const delays = this.opts.retryDelays ?? DEFAULT_RELOAD_RETRY_DELAYS;
		for (let attempt = 0; ; attempt++) {
			try {
				return await this.fetcher();
			} catch (err) {
				if (attempt >= delays.length) throw err;
				await setTimeout(delays[attempt]);
			}
		}
	}
}

/**
 * 一覧のうち、`id` の要素を `item` に置き換える。`item` が `null` なら外す。なければ末尾に加える
 */
export function replaceById<T extends { id: string }>(items: T[], id: string, item: T | null): T[] {
	const index = items.findIndex(x => x.id === id);
	if (item == null) return index < 0 ? items : items.filter(x => x.id !== id);
	if (index < 0) return [...items, item];
	const replaced = items.slice();
	replaced[index] = item;
	return replaced;
}
