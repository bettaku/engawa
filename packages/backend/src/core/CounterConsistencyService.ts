/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

/**
 * 非正規化カウンタの定義。
 *
 * `expected`は、行`t`のカウンタの正しい値を求めるSQLの式。
 * 加算・減算する側（NoteCreateService、NoteDeleteService、ClipService、UserFollowingService、AccountMoveService）と
 * 同じ条件で数える。条件を変えるときは両方を揃えること。
 */
type CounterDefinition = {
	table: 'note' | 'user';
	column: string;
	expected: string;
	/** 対象にする行の条件 */
	where?: string;
	/** 列の型の上限（smallint）。これを超える値は上限に丸める */
	max?: number;
};

export const SMALLINT_MAX = 32767;

/**
 * ノート`outer`のrenoteCountの正しい値を求めるSQLの式。
 * NoteCreateService.incRenoteCount: Renote先の投稿者以外で、botでない投稿者のRenote・引用だけを数える
 */
export function renoteCountSql(outer: string): string {
	return `(SELECT COUNT(*) FROM "note" r INNER JOIN "user" ru ON ru."id" = r."userId" WHERE r."renoteId" = ${outer}."id" AND r."userId" != ${outer}."userId" AND ru."isBot" = FALSE)`;
}

export const COUNTERS = {
	'note.repliesCount': {
		table: 'note',
		column: 'repliesCount',
		expected: '(SELECT COUNT(*) FROM "note" r WHERE r."replyId" = t."id")',
		max: SMALLINT_MAX,
	},
	'note.renoteCount': {
		table: 'note',
		column: 'renoteCount',
		expected: renoteCountSql('t'),
		max: SMALLINT_MAX,
	},
	'note.clippedCount': {
		table: 'note',
		column: 'clippedCount',
		expected: '(SELECT COUNT(*) FROM "clip_note" c WHERE c."noteId" = t."id")',
		max: SMALLINT_MAX,
	},
	'user.notesCount': {
		table: 'user',
		column: 'notesCount',
		expected: '(SELECT COUNT(*) FROM "note" n WHERE n."userId" = t."id")',
		// リモートのユーザーの値は、相手のサーバーのoutboxの件数で上書きされる
		where: 't."host" IS NULL',
	},
	'user.followingCount': {
		table: 'user',
		column: 'followingCount',
		// UserFollowingService: どちらかが引っ越し済みのフォローは数えない
		expected: '(SELECT COUNT(*) FROM "following" f INNER JOIN "user" o ON o."id" = f."followeeId" WHERE f."followerId" = t."id" AND o."movedToUri" IS NULL)',
		// リモートのユーザーの値は相手のサーバーの値で上書きされる。引っ越し済みのユーザーは加算・減算しない
		where: 't."host" IS NULL AND t."movedToUri" IS NULL',
	},
	'user.followersCount': {
		table: 'user',
		column: 'followersCount',
		expected: '(SELECT COUNT(*) FROM "following" f INNER JOIN "user" o ON o."id" = f."followerId" WHERE f."followeeId" = t."id" AND o."movedToUri" IS NULL)',
		where: 't."host" IS NULL AND t."movedToUri" IS NULL',
	},
} as const satisfies Record<string, CounterDefinition>;

export type CounterName = keyof typeof COUNTERS;

export const COUNTER_NAMES = Object.keys(COUNTERS) as CounterName[];

export type CounterMismatch = {
	id: string;
	actual: number;
	expected: number;
};

export type CounterReport = {
	counter: CounterName;
	/** 確認した行数 */
	checked: number;
	/** 値が一致しなかった行数 */
	mismatched: number;
	/** 修復した行数（修復しない場合は0） */
	repaired: number;
	/** 一致しなかった行の例 */
	samples: CounterMismatch[];
};

const SAMPLE_LIMIT = 10;

/**
 * 非正規化カウンタ（ノートの返信数・Renote数・クリップ数、ユーザーのノート数・フォロー数・フォロワー数）の
 * 整合性を確認し、必要なら修復する。
 *
 * 新旧の実装が同じカウンタを更新する混在期間の監視にも使う。
 *
 * 修復は、行ごとに正しい値を数え直して上書きする。通常の加算・減算とは同期しないので、書き込み中に実行すると、
 * 修復後もずれることがあり、確認の結果も確定しない。確実に直すには、書き込みを止めて実行中の処理が終わってから修復し、再度確認する。
 */
@Injectable()
export class CounterConsistencyService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,
	) {
	}

	@bindThis
	public async check(counters: readonly CounterName[] = COUNTER_NAMES, options: { batchSize?: number } = {}): Promise<CounterReport[]> {
		const reports: CounterReport[] = [];
		for (const counter of counters) {
			reports.push(await this.run(counter, false, options.batchSize ?? 1000));
		}
		return reports;
	}

	@bindThis
	public async repair(counters: readonly CounterName[] = COUNTER_NAMES, options: { batchSize?: number } = {}): Promise<CounterReport[]> {
		const reports: CounterReport[] = [];
		for (const counter of counters) {
			reports.push(await this.run(counter, true, options.batchSize ?? 1000));
		}
		return reports;
	}

	@bindThis
	private async run(counter: CounterName, repair: boolean, batchSize: number): Promise<CounterReport> {
		// 0以下だとLIMITで1行も読まず、ずれがないと報告してしまう
		if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
			throw new Error(`batchSize must be a positive integer: ${batchSize}`);
		}
		const def: CounterDefinition = COUNTERS[counter];
		const column = `t."${def.column}"`;
		const expected = def.max != null ? `LEAST(${def.expected}, ${def.max})` : def.expected;
		const where = def.where != null ? `AND (${def.where})` : '';

		const report: CounterReport = { counter, checked: 0, mismatched: 0, repaired: 0, samples: [] };

		let lastId = '';
		while (true) {
			// 主キーの順に区切って数える。テーブル全体を1つの文で数えると長時間ロックや負荷の偏りが起きるため
			const rows: { id: string; actual: number; expected: string }[] = await this.db.query(
				`SELECT t."id", ${column} AS "actual", ${expected} AS "expected" FROM "${def.table}" t WHERE t."id" > $1 ${where} ORDER BY t."id" LIMIT $2`,
				[lastId, batchSize],
			);
			if (rows.length === 0) break;
			lastId = rows[rows.length - 1].id;
			report.checked += rows.length;

			const mismatches = rows
				.map(row => ({ id: row.id, actual: Number(row.actual), expected: Number(row.expected) }))
				.filter(row => row.actual !== row.expected);
			if (mismatches.length === 0) continue;

			report.mismatched += mismatches.length;
			for (const mismatch of mismatches) {
				if (report.samples.length >= SAMPLE_LIMIT) break;
				report.samples.push(mismatch);
			}

			if (repair) {
				// 確認した時点の値ではなく、更新する時点で数え直した値を書く
				const [, affected]: [unknown, number] = await this.db.query(
					// 確認した後に対象外になった行（引っ越したユーザーなど）は書き換えない
					`UPDATE "${def.table}" t SET "${def.column}" = ${expected} WHERE t."id" = ANY($1) ${where} AND ${column} IS DISTINCT FROM ${expected}`,
					[mismatches.map(m => m.id)],
				);
				report.repaired += affected;
			}
		}

		return report;
	}
}
