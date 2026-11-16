/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Bull from 'bullmq';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { QueueService } from '@/core/QueueService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { ScheduledNoteDeleteJobData } from '../types.js';

/** 照合ジョブが1回の実行で処理するノート数の上限 */
const RECONCILE_LIMIT = 1000;

/** ジョブを延期し直すときの最小の間隔。DBとの時計のずれで即座に再実行され続けるのを防ぐ */
const MIN_RESCHEDULE_DELAY = 5 * 1000;

@Injectable()
export class ScheduledNoteDeleteProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteDeleteService: NoteDeleteService,
		private queueService: QueueService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('scheduled-note-delete');
	}

	/**
	 * 予約削除ジョブを処理する。
	 * ジョブは実行のきっかけで、削除するかどうかはDBのdeleteAtで決まる。
	 */
	@bindThis
	public async process(job: Bull.Job<ScheduledNoteDeleteJobData>, token?: string): Promise<string> {
		const noteId = job.data.noteId;
		const result = await this.noteDeleteService.deleteIfScheduledTimeReached(noteId);

		if (result.deleted) {
			this.logger.info(`Delete note ${noteId}`);
			return 'deleted';
		}

		if (result.deleteAt == null) {
			return 'skipped: note not found or schedule cancelled';
		}

		// 削除予定が延期されている
		if (job.id === QueueService.scheduledNoteDeleteJobId(noteId) && token != null) {
			// 延期のときに実行中で取り消せなかったジョブ。同じIDでは登録し直せないので、このジョブ自体を延期する
			await job.moveToDelayed(Math.max(result.deleteAt.getTime(), Date.now() + MIN_RESCHEDULE_DELAY), token);
			throw new Bull.DelayedError();
		}

		// jobIdを固定する前に登録されたジョブ。固定IDのジョブがなければ登録して、このジョブは終える
		await this.queueService.ensureNoteDeleteScheduled(noteId, result.deleteAt);
		return 'skipped: schedule postponed';
	}

	/**
	 * 削除予定時刻を過ぎても残っているノートを削除する。
	 * ジョブが失われた場合（Redisの消失、登録の失敗など）に備えた定期処理。
	 */
	@bindThis
	public async reconcile(): Promise<string> {
		// 時刻どおりに動いているジョブと重ならないよう、少し待ってから拾う
		const overdueNotes = await this.notesRepository.createQueryBuilder('note')
			.select('note.id')
			.where('note.deleteAt IS NOT NULL')
			.andWhere('note.deleteAt <= now() - interval \'1 minute\'')
			.orderBy('note.deleteAt', 'ASC')
			.limit(RECONCILE_LIMIT)
			.getMany();

		let deleted = 0;
		let failed = 0;

		for (const { id } of overdueNotes) {
			try {
				const result = await this.noteDeleteService.deleteIfScheduledTimeReached(id);
				if (result.deleted) deleted++;
			} catch (err) {
				failed++;
				this.logger.error(`Failed to delete overdue note ${id}`, { error: err });
			}
		}

		if (deleted > 0 || failed > 0) {
			this.logger.warn(`Deleted ${deleted} overdue note(s) whose job was lost (failed: ${failed})`);
		}

		return `deleted: ${deleted}, failed: ${failed}`;
	}
}
