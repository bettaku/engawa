/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setImmediate } from 'node:timers/promises';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MiNoteOutbox } from '@/models/NoteOutbox.js';
import type { NoteOutboxType } from '@/models/NoteOutbox.js';
import type { MiNote } from '@/models/Note.js';
import { QueueService } from '@/core/QueueService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

/**
 * 副作用を1つ実行する。実行済み（`doneSteps`にある）なら何もしない。
 * 失敗しても例外を投げず、その副作用を未完了として残す（ほかの副作用は続ける）。
 */
export type NoteOutboxStep = (name: string, fn: () => unknown) => Promise<void>;

export type NoteOutboxHandler = (record: MiNoteOutbox, step: NoteOutboxStep) => Promise<void>;

export type NoteOutboxEntry = {
	type: NoteOutboxType;
	noteId: MiNote['id'];
	userId: MiNote['userId'];
	payload?: Record<string, unknown>;
};

export type NoteOutboxProcessResult =
	/** すべての副作用を終え、レコードを削除した */
	| 'done'
	/** 失敗した副作用があり、後で再試行する */
	| 'retry'
	/** レコードがない、ほかのプロセスが処理中、または同じノートの先のレコードが残っている */
	| 'skipped';

/** 処理中のプロセスが持つ期限。副作用を1つ終えるごとに延ばす */
const LEASE_SECONDS = 5 * 60;

/** 照合ジョブが、プロセス内で処理されなかったとみなすまでの時間 */
const STALE_SECONDS = 60;

/**
 * 処理を始める回数の上限。これを超えても失敗する副作用は諦め、エラーとして記録してレコードを削除する。
 * 配送などの外部への送信は、ここでは配送ジョブの登録までで、送信の再試行は配送ジョブ側の設定に従う。
 */
export const NOTE_OUTBOX_MAX_ATTEMPTS = 5;

/** 照合ジョブが1回に拾うレコードの数 */
const SWEEP_LIMIT = 1000;

/**
 * ノートの作成・更新・削除の後処理（副作用）のoutbox（pre-rust-tech-debt.md P3-1）。
 *
 * 1. 書き込み側は、ノートの行の変更と同じトランザクションで`add`する。
 * 2. コミット後、書き込んだプロセスがすぐに処理する（`dispatch`・`processNow`）。従来と同じ遅延で副作用が出る。
 * 3. プロセスの停止や副作用の失敗で残ったレコードは、照合ジョブ（`sweepNoteOutbox`）が`processNoteOutbox`ジョブにする。
 *
 * 処理は種類ごとのハンドラーが行い、副作用ごとに完了を記録する。途中で停止しても、再開したときは
 * 終わっていない副作用だけを実行する。同じノートのレコードは記録した順に処理する（作成の前に削除を配送しない）。
 */
@Injectable()
export class NoteOutboxService implements OnApplicationShutdown {
	#shutdownController = new AbortController();
	private handlers = new Map<NoteOutboxType, NoteOutboxHandler>();
	private logger: Logger;

	constructor(
		@Inject(DI.db)
		private db: DataSource,

		private queueService: QueueService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('note-outbox');
	}

	@bindThis
	public registerHandler(type: NoteOutboxType, handler: NoteOutboxHandler): void {
		this.handlers.set(type, handler);
	}

	/**
	 * レコードを記録する。ノートの行を変更するトランザクションの中で呼ぶ。
	 * @returns 記録したレコードの`seq`（コミット後に`dispatch`・`processNow`へ渡す）
	 */
	@bindThis
	public async add(manager: EntityManager, entries: NoteOutboxEntry[]): Promise<MiNoteOutbox['seq'][]> {
		if (entries.length === 0) return [];

		const params: unknown[] = [];
		const values = entries.map(entry => {
			const base = params.length;
			params.push(entry.type, entry.noteId, entry.userId, JSON.stringify(entry.payload ?? {}));
			return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`;
		});
		const rows: { seq: string }[] = await manager.query(
			`INSERT INTO "note_outbox" ("type", "noteId", "userId", "payload") VALUES ${values.join(', ')} RETURNING "seq"`,
			params,
		);

		return rows.map(row => String(row.seq));
	}

	/**
	 * まだ誰も処理を始めていない作成・更新のレコードを取り消す。ノートの行を削除するトランザクションの中で、行の削除の後に呼ぶ。
	 * 取り消した作成のレコードの副作用は一度も実行されていないので、削除の側も取り消す必要がない。
	 * @returns 作成のレコードを取り消したノートのID
	 */
	@bindThis
	public async cancelUnstarted(manager: EntityManager, noteIds: MiNote['id'][]): Promise<Set<MiNote['id']>> {
		if (noteIds.length === 0) return new Set();

		const rows: { noteId: string; type: NoteOutboxType }[] = await manager.query(
			'DELETE FROM "note_outbox" WHERE "noteId" = ANY($1) AND "type" IN (\'created\', \'updated\') AND "attempts" = 0 RETURNING "noteId", "type"',
			[noteIds],
		).then(([rows]) => rows);

		return new Set(rows.filter(row => row.type === 'created').map(row => row.noteId));
	}

	/**
	 * 作成のレコードを処理しようとしたらノートがすでに削除されていた場合に、実行済みの副作用を削除のレコードへ伝える。
	 * 削除のレコードは作成のレコードより後に処理されるので、ここで書いた値を必ず読む。
	 */
	@bindThis
	public async reportCreatedStepsToDeletion(noteId: MiNote['id'], doneSteps: string[]): Promise<void> {
		await this.db.query(
			'UPDATE "note_outbox" SET "payload" = "payload" || jsonb_build_object(\'createdDone\', $2::jsonb) WHERE "noteId" = $1 AND "type" = \'deleted\'',
			[noteId, JSON.stringify(doneSteps)],
		);
	}

	/**
	 * コミット後に、このプロセスで処理を始める。完了を待たない。
	 * シャットダウン中は処理を始めず、レコードは照合ジョブが拾う。
	 */
	@bindThis
	public dispatch(seqs: MiNoteOutbox['seq'][]): void {
		if (seqs.length === 0) return;

		setImmediate('note outbox', { signal: this.#shutdownController.signal }).then(
			() => this.processNow(seqs),
			() => { /* aborted, ignore this */ },
		);
	}

	/**
	 * レコードを順に処理し、終わるのを待つ。例外を投げない。
	 */
	@bindThis
	public async processNow(seqs: MiNoteOutbox['seq'][]): Promise<void> {
		for (const seq of seqs) {
			try {
				await this.process(seq);
			} catch (err) {
				this.logger.error(`Failed to process note outbox ${seq}`, { error: err });
			}
		}
	}

	/**
	 * レコードを1件処理する。
	 *
	 * 次のどれかに当たるときは何もしない（`skipped`）。
	 * - レコードがない（処理済み）
	 * - ほかのプロセスが処理中（期限内）
	 * - 同じノートの、先に記録したレコードが残っている（そのレコードを処理し終えたときに、続けて処理する）
	 */
	@bindThis
	public async process(seq: MiNoteOutbox['seq']): Promise<NoteOutboxProcessResult> {
		const [claimed]: MiNoteOutbox[] = await this.db.query(
			`UPDATE "note_outbox" o SET "lockedUntil" = now() + make_interval(secs => ${LEASE_SECONDS}), "attempts" = o."attempts" + 1
			WHERE o."seq" = $1
				AND (o."lockedUntil" IS NULL OR o."lockedUntil" < now())
				AND NOT EXISTS (SELECT 1 FROM "note_outbox" p WHERE p."noteId" = o."noteId" AND p."seq" < o."seq")
			RETURNING o.*`,
			[seq],
		).then(([rows]) => rows);

		if (claimed == null) return 'skipped';

		const record: MiNoteOutbox = { ...claimed, seq: String(claimed.seq) };
		const handler = this.handlers.get(record.type);
		if (handler == null) {
			// ハンドラーを登録していないプロセス（ありえないが）は、期限を戻してほかのプロセスに任せる
			await this.db.query('UPDATE "note_outbox" SET "lockedUntil" = NULL, "attempts" = "attempts" - 1 WHERE "seq" = $1', [record.seq]);
			this.logger.error(`No handler for note outbox type "${record.type}"`);
			return 'skipped';
		}

		const failed: string[] = [];
		const done = new Set(record.doneSteps);

		const step: NoteOutboxStep = async (name, fn) => {
			if (done.has(name)) return;
			try {
				await fn();
			} catch (err) {
				failed.push(name);
				this.logger.error(`Failed to run "${name}" of note outbox ${record.seq} (${record.type} ${record.noteId}, attempt ${record.attempts})`, { error: err });
				return;
			}
			done.add(name);
			record.doneSteps = [...done];
			await this.db.query(
				`UPDATE "note_outbox" SET "doneSteps" = array_append("doneSteps", $2::varchar), "lockedUntil" = now() + make_interval(secs => ${LEASE_SECONDS}) WHERE "seq" = $1`,
				[record.seq, name],
			);
		};

		try {
			await handler(record, step);
		} catch (err) {
			failed.push('(handler)');
			this.logger.error(`Failed to handle note outbox ${record.seq} (${record.type} ${record.noteId}, attempt ${record.attempts})`, { error: err });
		}

		if (failed.length > 0) {
			if (record.attempts < NOTE_OUTBOX_MAX_ATTEMPTS) {
				// 期限を、次に試す時刻にする。照合ジョブが期限切れのレコードを拾う
				const backoff = 60 * (2 ** (record.attempts - 1));
				await this.db.query(
					'UPDATE "note_outbox" SET "lockedUntil" = now() + make_interval(secs => $2) WHERE "seq" = $1',
					[record.seq, backoff],
				);
				return 'retry';
			}

			this.logger.error(`Giving up note outbox ${record.seq} (${record.type} ${record.noteId}) after ${record.attempts} attempts. Failed: ${failed.join(', ')}`);
		}

		await this.db.query('DELETE FROM "note_outbox" WHERE "seq" = $1', [record.seq]);

		// 同じノートの次のレコードを続けて処理する
		const [next]: { seq: string }[] = await this.db.query(
			'SELECT "seq" FROM "note_outbox" WHERE "noteId" = $1 ORDER BY "seq" LIMIT 1',
			[record.noteId],
		);
		if (next != null) this.dispatch([String(next.seq)]);

		return 'done';
	}

	/**
	 * 照合ジョブ（`sweepNoteOutbox`）の処理。プロセス内で処理されなかったレコードと、
	 * 処理中のまま期限が切れたレコード（停止・失敗）を、`processNoteOutbox`ジョブにする。
	 */
	@bindThis
	public async sweep(): Promise<number> {
		const rows: { seq: string }[] = await this.db.query(
			`SELECT "seq" FROM "note_outbox"
			WHERE ("lockedUntil" IS NULL AND "createdAt" < now() - make_interval(secs => ${STALE_SECONDS}))
				OR "lockedUntil" < now()
			ORDER BY "seq"
			LIMIT ${SWEEP_LIMIT}`,
		);

		for (const row of rows) {
			await this.queueService.createProcessNoteOutboxJob(String(row.seq));
		}

		return rows.length;
	}

	/**
	 * 処理できるレコードをすべて処理する（CLIの`drain-note-outbox`）。outboxを知らない版へ切り戻す前に、
	 * 書き込み（serverプロセス）を止めてから実行する。
	 *
	 * ほかのプロセスが処理中のレコードと、再試行の時刻を待っているレコードは処理しない。
	 * @returns 処理したレコードの数と、残っているレコードの数
	 */
	@bindThis
	public async drain(): Promise<{ processed: number; remaining: number }> {
		let processed = 0;

		while (true) {
			const rows: { seq: string }[] = await this.db.query(
				`SELECT "seq" FROM "note_outbox" WHERE "lockedUntil" IS NULL OR "lockedUntil" < now() ORDER BY "seq" LIMIT ${SWEEP_LIMIT}`,
			);
			if (rows.length === 0) break;

			let progressed = false;
			for (const row of rows) {
				if (await this.process(String(row.seq)) === 'done') {
					processed++;
					progressed = true;
				}
			}
			if (!progressed) break;
		}

		const [{ count }]: { count: string }[] = await this.db.query('SELECT COUNT(*) AS "count" FROM "note_outbox"');
		return { processed, remaining: Number(count) };
	}

	@bindThis
	public dispose(): void {
		this.#shutdownController.abort();
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}
