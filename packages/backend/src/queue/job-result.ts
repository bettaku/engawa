/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';

/**
 * ジョブの処理結果（pre-rust-tech-debt.md P2-4）。
 *
 * 処理の結果を、BullMQの例外の種類ではなく値として表す。
 * - `done`: 完了。処理しなかった（スキップした）場合も、再試行しても結果が変わらないならこれにする
 * - `retry`: 一時的な失敗。ジョブの`attempts`とbackoffに従って再試行する
 * - `fail`: 再試行しない失敗。再試行しても成功しない（相手が4xxを返した、対象が存在しないなど）
 *
 * BullMQへの対応はtoBullOutcomeだけで行う。処理（processor）はこの型を返し、例外の種類に依存しない。
 */
export type JobResult =
	| { kind: 'done'; message: string; }
	| { kind: 'retry'; reason: string; }
	| { kind: 'fail'; reason: string; };

export const JobResult = {
	done(message: string): JobResult {
		return { kind: 'done', message };
	},
	retry(reason: string): JobResult {
		return { kind: 'retry', reason };
	},
	fail(reason: string): JobResult {
		return { kind: 'fail', reason };
	},
} as const;

/**
 * 処理結果をBullMQの約束事に変換する。
 * `done`はメッセージを返す（ジョブの戻り値になる）。`retry`は`Error`を、`fail`は`UnrecoverableError`を投げる。
 */
export function toBullOutcome(result: JobResult): string {
	switch (result.kind) {
		case 'done': return result.message;
		case 'retry': throw new Error(result.reason);
		case 'fail': throw new Bull.UnrecoverableError(result.reason);
	}
}
