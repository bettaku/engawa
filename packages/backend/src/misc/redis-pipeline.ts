/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';

/**
 * パイプラインを実行し、失敗したコマンドがあれば最初のエラーを投げる。
 * ioredisの`exec()`は、コマンドごとのエラーを例外にせず、結果の配列（`[err, result]`）に入れて返す。
 */
export async function execPipeline(pipeline: Redis.ChainableCommander): Promise<void> {
	const results = await pipeline.exec();
	const failed = results?.find(([err]) => err != null);
	if (failed != null) throw failed[0];
}
