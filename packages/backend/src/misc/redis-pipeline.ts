/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';

/**
 * パイプラインを実行し、失敗したコマンドがあれば最初のエラーを投げる。
 * ioredisの`exec()`は、コマンドごとのエラーを例外にせず、結果の配列（`[err, result]`）に入れて返す。
 *
 * @param pending パイプラインの外で行った書き込み（FanoutTimelineService.pushの`pending`）。パイプラインが失敗しても、
 *   これらの完了を待ってから最初のエラーを投げる（拒否が未処理のまま残らないようにする）
 */
export async function execPipeline(pipeline: Redis.ChainableCommander, pending: Promise<unknown>[] = []): Promise<void> {
	const [piped, ...others] = await Promise.allSettled([
		pipeline.exec().then(results => {
			const failed = results?.find(([err]) => err != null);
			if (failed != null) throw failed[0];
		}),
		...pending,
	]);
	const rejected = [piped, ...others].find(result => result.status === 'rejected');
	if (rejected != null) throw (rejected as PromiseRejectedResult).reason;
}
