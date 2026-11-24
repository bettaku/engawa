/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';

/**
 * Redisの接続が切れて、つなぎ直したときに呼ぶ。最初の接続では呼ばない。
 *
 * Pub/Subの購読用の接続では、切れている間のメッセージは届かない（ioredisは再接続時に購読し直すだけ）。
 * イベントで無効化しているメモリ上のキャッシュは、つなぎ直したときに捨てる必要がある。
 *
 * @returns 登録を取り消す関数
 */
export function onRedisReconnected(redis: Redis.Redis, listener: () => void): () => void {
	let wasReady = redis.status === 'ready';
	const onReady = () => {
		if (wasReady) listener();
		wasReady = true;
	};
	redis.on('ready', onReady);
	return () => {
		redis.off('ready', onReady);
	};
}
