/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { QUEUE } from '@/queue/const.js';

/**
 * ジョブpayloadの版（pre-rust-tech-debt.md P2-4）。
 *
 * 生成側が書く版。形を変えていない種別はすべて1である。
 * 形を変える種別は、処理側が新しい版を受け付けるリリースを出した後で、ここを新しい版に変える。
 */
export const JOB_DATA_VERSION = 1;

type QueueName = typeof QUEUE[keyof typeof QUEUE];

/**
 * 処理側が受け付ける版。キューごとに、ジョブ名ごとの一覧を持つ。`*`はそのキューのほかのジョブ名すべてに当てはまる。
 *
 * 新しい版を受け付けるときは、まずここに版を足して処理を実装し、そのリリースを全プロセスに配布してから生成側を切り替える。
 * 旧い版の処理を削除するのは、その版のジョブが残っていないことを確認してからにする。
 */
const SUPPORTED_JOB_DATA_VERSIONS: Record<QueueName, Record<string, readonly number[]>> = {
	[QUEUE.SYSTEM]: { '*': [1] },
	[QUEUE.ENDED_POLL_NOTIFICATION]: { '*': [1] },
	[QUEUE.POST_SCHEDULED_NOTE]: { '*': [1] },
	[QUEUE.DELIVER]: { '*': [1] },
	[QUEUE.INBOX]: { '*': [1, 2] },
	[QUEUE.DB]: { importAntennas: [1, 2], '*': [1] },
	[QUEUE.RELATIONSHIP]: { '*': [1] },
	[QUEUE.OBJECT_STORAGE]: { '*': [1] },
	[QUEUE.USER_WEBHOOK_DELIVER]: { '*': [1, 2] },
	[QUEUE.SYSTEM_WEBHOOK_DELIVER]: { '*': [1, 2] },
	[QUEUE.SCHEDULED_NOTE_DELETE]: { '*': [1] },
};

/** payloadの版を読む。`v`がない（古い）ジョブは1とみなす */
export function getJobDataVersion(data: unknown): unknown {
	if (data == null || typeof data !== 'object') return 1;
	const v = (data as { v?: unknown }).v;
	return v === undefined ? 1 : v;
}

export function getSupportedJobDataVersions(queue: QueueName, name: string): readonly number[] {
	const versions = SUPPORTED_JOB_DATA_VERSIONS[queue];
	// ジョブ名は外部から決まる（inboxはactivityのid）ので、`constructor`などの継承したプロパティを引かない
	return Object.hasOwn(versions, name) ? versions[name] : versions['*'];
}

export function isSupportedJobDataVersion(queue: QueueName, name: string, data: unknown): boolean {
	const v = getJobDataVersion(data);
	return typeof v === 'number' && getSupportedJobDataVersions(queue, name).includes(v);
}

/**
 * 処理の前に、payloadの版を確かめる。知らない版なら、再試行しない失敗にする。
 *
 * 知らない版のジョブは、新しい版の生成側が登録したものである。再試行しても処理できないので、
 * 失敗として残し、処理側を新しい版へ更新してから再実行（admin/queue/retry-job）できるようにする。
 */
export function assertSupportedJobDataVersion(queue: QueueName, job: Pick<Bull.Job, 'name' | 'data'>): void {
	if (!isSupportedJobDataVersion(queue, job.name, job.data)) {
		const v = getJobDataVersion(job.data);
		throw new Bull.UnrecoverableError(`unsupported job data version: queue=${queue} name=${job.name} v=${JSON.stringify(v)} (supported: ${getSupportedJobDataVersions(queue, job.name).join(', ')})`);
	}
}
