/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiNote } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import type { MiUser } from '@/models/_.js';
import type Logger from '@/logger.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';
import { LoggerService } from '@/core/LoggerService.js';

const REDIS_DELTA_PREFIX = 'reactionsBufferDeltas';
const REDIS_PAIR_PREFIX = 'reactionsBufferPairs';
const REDIS_PROCESSING_PREFIX = 'reactionsBufferProcessing';
/** 取り出し済みで、後始末が済んでいないバッチ（`<noteId>:<batchId>`）の集合 */
const REDIS_PROCESSING_SET = 'reactionsBufferProcessingBatches';

/**
 * 取り出しの済んだバッチの印を残す期間。ioredisは再接続のときに応答のなかったコマンドを再送するので、
 * 同じバッチの取り出しが遅れて再実行されても、印があれば何もしない。
 */
const TAKE_OUT_MARKER_TTL_SECONDS = 60 * 60 * 24;

/**
 * KEYS: 差分キー、ペアキー、processingの差分キー、processingのペアキー、バッチの集合、取り出し済みの印
 * ARGV: バッチの集合に登録する値、印の有効期間（秒）
 *
 * 同じバッチで再実行されたとき（再送）は、取り出し済みのprocessingキーを上書きしないよう、何もせずに1を返す。
 * 後始末の後に再送が届いても、印は後始末で消さないので同じように扱う。
 */
const TAKE_OUT_SCRIPT = `
if redis.call('EXISTS', KEYS[6]) == 1 then
	return 1
end
if redis.call('EXISTS', KEYS[1]) == 0 then
	return 0
end
redis.call('SET', KEYS[6], '1', 'EX', ARGV[2])
redis.call('RENAME', KEYS[1], KEYS[3])
if redis.call('EXISTS', KEYS[2]) == 1 then
	redis.call('RENAME', KEYS[2], KEYS[4])
end
redis.call('SADD', KEYS[5], ARGV[1])
return 1
`;

export type BufferedBatch = {
	noteId: MiNote['id'];
	batchId: string;
};

function processingKeysOf(batch: BufferedBatch) {
	const base = `${REDIS_PROCESSING_PREFIX}:${batch.noteId}:${batch.batchId}`;
	return {
		deltas: `${base}:deltas`,
		pairs: `${base}:pairs`,
		takenMarker: `${base}:taken`,
	};
}

function batchMemberOf(batch: BufferedBatch): string {
	return `${batch.noteId}:${batch.batchId}`;
}

function parseBatchMember(member: string): BufferedBatch | null {
	const [noteId, batchId, ...rest] = member.split(':');
	if (!noteId || !batchId || rest.length > 0) return null;
	return { noteId, batchId };
}

function escapeGlob(pattern: string): string {
	return pattern.replace(/[*?[\]\\]/g, '\\$&');
}

/**
 * `note.reactions`へリアクションごとの差分を加算するSQL式。
 * 差分は`{ [reaction]: number }`をJSONにしたものをパラメータで渡す。
 * どのリアクションも更新前の値を元に計算し、まとめて合成するので、複数のリアクションを同時に増減しても互いに上書きしない。
 */
export function addReactionDeltasSql(param: string): string {
	return `"reactions" || (SELECT COALESCE(jsonb_object_agg("d"."key", COALESCE(("reactions"->>"d"."key")::int, 0) + "d"."value"::int), '{}'::jsonb) FROM jsonb_each_text(CAST(:${param} AS jsonb)) AS "d")`;
}

@Injectable()
export class ReactionsBufferingService {
	private logger: Logger;

	constructor(
		@Inject(DI.redisForReactions)
		private redisForReactions: Redis.Redis, // TODO: 専用のRedisインスタンスにする

		@Inject(DI.db)
		private db: DataSource,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('reactions-buffering');
	}

	@bindThis
	public async create(noteId: MiNote['id'], userId: MiUser['id'], reaction: string, currentPairs: string[]): Promise<void> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hincrby(`${REDIS_DELTA_PREFIX}:${noteId}`, reaction, 1);
		for (let i = 0; i < currentPairs.length; i++) {
			pipeline.zadd(`${REDIS_PAIR_PREFIX}:${noteId}`, i, currentPairs[i]);
		}
		pipeline.zadd(`${REDIS_PAIR_PREFIX}:${noteId}`, Date.now(), `${userId}/${reaction}`);
		pipeline.zremrangebyrank(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -(PER_NOTE_REACTION_USER_PAIR_CACHE_MAX + 1));
		await pipeline.exec();
	}

	@bindThis
	public async delete(noteId: MiNote['id'], userId: MiUser['id'], reaction: string): Promise<void> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hincrby(`${REDIS_DELTA_PREFIX}:${noteId}`, reaction, -1);
		pipeline.zrem(`${REDIS_PAIR_PREFIX}:${noteId}`, `${userId}/${reaction}`);
		// TODO: 「消した要素一覧」も持っておかないとcreateされた時に上書きされて復活する
		await pipeline.exec();
	}

	@bindThis
	public async get(noteId: MiNote['id']): Promise<{
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
		pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
		const results = await pipeline.exec();

		const resultDeltas = results![0][1] as Record<string, string>;
		const resultPairs = results![1][1] as string[];

		const deltas = {} as Record<string, number>;
		for (const [name, count] of Object.entries(resultDeltas)) {
			deltas[name] = parseInt(count);
		}

		const pairs = resultPairs.map(x => x.split('/') as [MiUser['id'], string]);

		return {
			deltas,
			pairs,
		};
	}

	@bindThis
	public async getMany(noteIds: MiNote['id'][]): Promise<Map<MiNote['id'], {
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}>> {
		const map = new Map<MiNote['id'], {
			deltas: Record<string, number>;
			pairs: ([MiUser['id'], string])[];
		}>();

		const pipeline = this.redisForReactions.pipeline();
		for (const noteId of noteIds) {
			pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
			pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
		}
		const results = await pipeline.exec();

		const opsForEachNotes = 2;
		for (let i = 0; i < noteIds.length; i++) {
			const noteId = noteIds[i];
			const resultDeltas = results![i * opsForEachNotes][1] as Record<string, string>;
			const resultPairs = results![i * opsForEachNotes + 1][1] as string[];

			const deltas = {} as Record<string, number>;
			for (const [name, count] of Object.entries(resultDeltas)) {
				deltas[name] = parseInt(count);
			}

			const pairs = resultPairs.map(x => x.split('/') as [MiUser['id'], string]);

			map.set(noteId, {
				deltas,
				pairs,
			});
		}

		return map;
	}

		/**
	 * バッファした差分をDBへ反映する。
	 *
	 * 1. 前回の実行で取り出したまま残ったバッチ（processingキー）を先に処理する
	 * 2. 差分キーをノートごとにprocessingキーへRENAMEして取り出し、適用し、後始末する
	 *
	 * 差分の加算と適用済み台帳への記録を同じトランザクションで行うので、
	 * どの時点で停止しても、再実行で同じバッチを二度加算することはない。
	 * bakeを行うのは定期ジョブ（BakeBufferedReactionsProcessorService）と、運用時の単発コマンドだけにする。
	 */
	@bindThis
	public async bake(): Promise<void> {
		let failed = 0;

		const leftovers = await this.redisForReactions.smembers(REDIS_PROCESSING_SET);
		for (const member of leftovers) {
			const batch = parseBatchMember(member);
			if (batch == null) {
				await this.redisForReactions.srem(REDIS_PROCESSING_SET, member);
				continue;
			}
			try {
				await this.applyBatch(batch);
				await this.cleanupBatch(batch);
			} catch (err) {
				failed++;
				this.logger.error(`Failed to bake buffered reactions of ${batch.noteId} (batch ${batch.batchId})`, { err });
			}
		}

		for (const noteId of await this.scanBufferedNoteIds()) {
			try {
				const batch = await this.takeOut(noteId);
				if (batch == null) continue;
				await this.applyBatch(batch);
				await this.cleanupBatch(batch);
			} catch (err) {
				failed++;
				this.logger.error(`Failed to bake buffered reactions of ${noteId}`, { err });
			}
		}

		if (failed > 0) {
			throw new Error(`Failed to bake buffered reactions of ${failed} batch(es). They will be retried on the next run.`);
		}
	}

	@bindThis
	private async scanBufferedNoteIds(): Promise<MiNote['id'][]> {
		// SCANのMATCHには接続のkeyPrefixが自動で付かない
		// https://github.com/redis/ioredis#transparent-key-prefixing
		const keyPrefix = this.redisForReactions.options.keyPrefix ?? '';
		const prefix = `${keyPrefix}${REDIS_DELTA_PREFIX}:`;
		const noteIds = new Set<MiNote['id']>();
		let cursor = '0';
		do {
			const [next, keys] = await this.redisForReactions.scan(cursor, 'MATCH', `${escapeGlob(prefix)}*`, 'COUNT', 1000);
			cursor = next;
			for (const key of keys) {
				noteIds.add(key.slice(prefix.length));
			}
		} while (cursor !== '0');
		return [...noteIds];
	}

	/**
	 * ノートの差分キーとペアキーを、新しいバッチのprocessingキーへ原子的に移す。
	 * 移した後に届いたリアクションは、元のキーに新しく溜まる。
	 * @returns 差分がなければnull
	 */
	@bindThis
	public async takeOut(noteId: MiNote['id'], batchId: string = randomUUID()): Promise<BufferedBatch | null> {
		const batch: BufferedBatch = { noteId, batchId };
		const keys = processingKeysOf(batch);
		const moved = await this.redisForReactions.eval(
			TAKE_OUT_SCRIPT,
			6,
			`${REDIS_DELTA_PREFIX}:${noteId}`,
			`${REDIS_PAIR_PREFIX}:${noteId}`,
			keys.deltas,
			keys.pairs,
			REDIS_PROCESSING_SET,
			keys.takenMarker,
			batchMemberOf(batch),
			TAKE_OUT_MARKER_TTL_SECONDS,
		);
		return moved === 1 ? batch : null;
	}

	/**
	 * processingキーの差分をノートへ加算する。適用済みのバッチなら何もしない。
	 */
	@bindThis
	public async applyBatch(batch: BufferedBatch): Promise<void> {
		const keys = processingKeysOf(batch);
		const rawDeltas = await this.redisForReactions.hgetall(keys.deltas);

		// processingキーはコミットした後にしか消さないので、キーがなければ適用済み
		if (Object.keys(rawDeltas).length === 0) return;

		const deltas: Record<string, number> = {};
		for (const [reaction, count] of Object.entries(rawDeltas)) {
			deltas[reaction] = parseInt(count, 10);
		}

		await this.db.transaction(async em => {
			const inserted: unknown[] = await em.query(
				'INSERT INTO "reaction_bake_ledger" ("batchId", "appliedAt") VALUES ($1, now()) ON CONFLICT ("batchId") DO NOTHING RETURNING "batchId"',
				[batch.batchId],
			);
			if (inserted.length === 0) return;

			// ペアのキャッシュは、バッファのペア（リアクションした時点のスナップショット）ではなく、
			// note_reactionから作り直す。スナップショットで置き換えると、バッファを使わない経路で
			// 変更されたペアを古い値に戻してしまう
			await em.createQueryBuilder().update(MiNote)
				.set({
					reactions: () => addReactionDeltasSql('reactionDeltas'),
					reactionAndUserPairCache: () => 'ARRAY(SELECT "nr"."userId" || \'/\' || "nr"."reaction" FROM "note_reaction" "nr" WHERE "nr"."noteId" = :id ORDER BY "nr"."id" DESC LIMIT :pairCacheMax)',
				})
				.setParameters({
					reactionDeltas: JSON.stringify(deltas),
					pairCacheMax: PER_NOTE_REACTION_USER_PAIR_CACHE_MAX,
				})
				.where('id = :id', { id: batch.noteId })
				.execute();
		});
	}

	@bindThis
	public async cleanupBatch(batch: BufferedBatch): Promise<void> {
		const keys = processingKeysOf(batch);
		// 失敗しても、バッチは集合に残り、次回に台帳で適用済みと判定して後始末だけをやり直す
		const results = await this.redisForReactions.multi()
			.del(keys.deltas, keys.pairs)
			.srem(REDIS_PROCESSING_SET, batchMemberOf(batch))
			.exec();
		if (results == null) throw new Error('Transaction was aborted');
		for (const [err] of results) {
			if (err) throw err;
		}
	}

	@bindThis
	public mergeReactions(src: MiNote['reactions'], delta: Record<string, number>): MiNote['reactions'] {
		const reactions = { ...src };
		for (const [name, count] of Object.entries(delta)) {
			if (reactions[name] != null) {
				reactions[name] += count;
			} else {
				reactions[name] = count;
			}
		}
		return reactions;
	}
}
