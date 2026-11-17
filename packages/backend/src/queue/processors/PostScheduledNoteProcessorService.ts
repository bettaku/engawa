/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Bull from 'bullmq';
import { DI } from '@/di-symbols.js';
import type { NoteDraftsRepository } from '@/models/_.js';
import { MiNoteDraft } from '@/models/NoteDraft.js';
import type { MiNote } from '@/models/Note.js';
import type Logger from '@/logger.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { QueueService } from '@/core/QueueService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { PostScheduledNoteJobData } from '../types.js';
import type { EntityManager } from 'typeorm';

/**
 * 照合ジョブがドラフトごとにジョブを登録し直す回数の上限。
 * 上限に達したドラフトは照合の対象から外す（ドラフトを更新すると0に戻る）。
 */
export const MAX_SCHEDULED_POST_REQUEUES = 3;

/** 照合ジョブが1回の実行で処理するドラフト数の上限 */
const RECONCILE_LIMIT = 1000;

/** ジョブを延期し直すときの最小の間隔。DBとの時計のずれで即座に再実行され続けるのを防ぐ */
const MIN_RESCHEDULE_DELAY = 5 * 1000;

/**
 * ノートのinsertと同じトランザクションで、ドラフトを「投稿済み」にできなかったことを表す。
 * 別のworkerが先に投稿したか、予約が変更・解除・削除された。ノートのinsertはロールバックされる。
 */
const ALREADY_HANDLED_ERROR_ID = 'f1a3f8f5-4d4b-4c3e-9a57-2f7c4b0d8e21';

type DraftForPostProcess = Pick<MiNoteDraft, 'id' | 'userId' | 'postedNoteId'>;

@Injectable()
export class PostScheduledNoteProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.noteDraftsRepository)
		private noteDraftsRepository: NoteDraftsRepository,

		private noteCreateService: NoteCreateService,
		private notificationService: NotificationService,
		private queueService: QueueService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('post-scheduled-note');
	}

	/**
	 * 予約投稿ジョブを処理する。
	 * ジョブは実行のきっかけで、投稿するかどうかはDBのドラフトで決まる。
	 * 「投稿済み」の印（postedAt）はノートのinsertと同じトランザクションで付けるので、
	 * 再実行・同時実行されても、1つのドラフトから作成されるノートは1つだけである。
	 */
	@bindThis
	public async process(job: Bull.Job<PostScheduledNoteJobData>, token?: string, isRetryAfterConflict = false): Promise<string> {
		const draftId = job.data.noteDraftId;
		const draft = await this.noteDraftsRepository.findOne({ where: { id: draftId }, relations: ['user'] });

		if (draft == null) {
			return 'skipped: draft not found';
		}

		if (draft.postedAt != null) {
			// 作成済み。ノートがその後に削除されていても再作成しない
			await this.finishPosted(draft);
			return 'skipped: already posted';
		}

		if (draft.user == null || draft.scheduledAt == null || !draft.isActuallyScheduled) {
			return 'skipped: not scheduled';
		}

		if (draft.scheduledAt.getTime() > Date.now()) {
			// 予約が延期されている
			if (job.id === QueueService.postScheduledNoteJobId(draftId) && token != null) {
				// 延期のときに実行中で取り消せなかったジョブ。同じIDでは登録し直せないので、このジョブ自体を延期する
				await job.moveToDelayed(Math.max(draft.scheduledAt.getTime(), Date.now() + MIN_RESCHEDULE_DELAY), token);
				throw new Bull.DelayedError();
			}

			// jobIdを固定する前に登録されたジョブ。固定IDのジョブがなければ登録して、このジョブは終える
			await this.queueService.ensureNotePostScheduled(draftId, draft.scheduledAt);
			return 'skipped: schedule postponed';
		}

		let note: MiNote;
		try {
			note = await this.noteCreateService.fetchAndCreate(draft.user, {
				createdAt: new Date(),
				fileIds: draft.fileIds,
				poll: draft.hasPoll ? {
					choices: draft.pollChoices,
					multiple: draft.pollMultiple,
					expiresAt: draft.pollExpiredAfter ? new Date(Date.now() + draft.pollExpiredAfter) : draft.pollExpiresAt ? new Date(draft.pollExpiresAt) : null,
				} : null,
				text: draft.text ?? null,
				replyId: draft.replyId,
				renoteId: draft.renoteId,
				cw: draft.cw,
				localOnly: draft.localOnly,
				reactionAcceptance: draft.reactionAcceptance,
				disableRightClick: draft.disableRightClick,
				visibility: draft.visibility,
				visibleUserIds: draft.visibleUserIds,
				event: draft.hasEvent && draft.eventTitle && draft.eventStart ? {
					title: draft.eventTitle,
					start: new Date(draft.eventStart),
					end: draft.eventEnd ? new Date(draft.eventEnd) : null,
					metadata: draft.eventMetadata,
				} : null,
				deleteAt: draft.deleteAt ? new Date(draft.deleteAt) : null,
				searchableBy: draft.searchableBy,
			}, {
				onInserted: (manager, inserted) => this.markPosted(manager, draftId, inserted.id),
			});
		} catch (err) {
			if (err instanceof IdentifiableError && err.id === ALREADY_HANDLED_ERROR_ID) {
				// 別のworkerが先に投稿したか、予約が変更された。ドラフトを読み直して判断する
				if (isRetryAfterConflict) throw new Error(`Scheduled note draft ${draftId} changed repeatedly while posting`);
				return await this.process(job, token, true);
			}

			await this.handleFailure(job, draft, err).catch(handleErr => {
				this.logger.error(`Failed to handle the failure of scheduled note draft ${draftId}`, { error: handleErr });
			});
			throw err instanceof IdentifiableError ? new Bull.UnrecoverableError(`${err.id}: ${err.message}`) : err;
		}

		await this.finishPosted({ ...draft, postedNoteId: note.id });
		return `posted: ${note.id}`;
	}

	/**
	 * 予約時刻を過ぎても投稿されていないドラフトのジョブを登録し直し、
	 * 後処理が終わっていない投稿済みのドラフトの後処理を行う。
	 * ジョブが失われた場合（Redisの消失、登録の失敗、再試行の使い切りなど）に備えた定期処理。
	 */
	@bindThis
	public async reconcile(): Promise<string> {
		let finished = 0;
		let requeued = 0;
		let failed = 0;

		// 投稿済みで、後処理（通知、ドラフト削除）の前に止まったドラフト。
		// 時刻どおりに動いているジョブと重ならないよう、少し待ってから拾う
		const posted = await this.noteDraftsRepository.createQueryBuilder('draft')
			.select(['draft.id', 'draft.userId', 'draft.postedNoteId'])
			.where('draft.postedAt IS NOT NULL')
			.andWhere('draft.postedAt <= now() - interval \'1 minute\'')
			.orderBy('draft.postedAt', 'ASC')
			.limit(RECONCILE_LIMIT)
			.getMany();

		for (const draft of posted) {
			try {
				await this.finishPosted(draft);
				finished++;
			} catch (err) {
				failed++;
				this.logger.error(`Failed to finish posted draft ${draft.id}`, { error: err });
			}
		}

		// 予約時刻を過ぎても投稿されていないドラフト
		const overdue = await this.noteDraftsRepository.createQueryBuilder('draft')
			.select(['draft.id', 'draft.scheduledAt'])
			.where('draft.isActuallyScheduled = true')
			.andWhere('draft.postedAt IS NULL')
			.andWhere('draft.scheduledAt <= now() - interval \'1 minute\'')
			.andWhere('draft.postAttempts < :max', { max: MAX_SCHEDULED_POST_REQUEUES })
			.orderBy('draft.scheduledAt', 'ASC')
			.limit(RECONCILE_LIMIT)
			.getMany();

		for (const draft of overdue) {
			try {
				if (await this.requeueIfJobLost(draft.id)) requeued++;
			} catch (err) {
				failed++;
				this.logger.error(`Failed to requeue scheduled note draft ${draft.id}`, { error: err });
			}
		}

		if (finished > 0 || requeued > 0 || failed > 0) {
			this.logger.warn(`Reconciled scheduled note drafts (finished: ${finished}, requeued: ${requeued}, failed: ${failed})`);
		}

		return `finished: ${finished}, requeued: ${requeued}, failed: ${failed}`;
	}

	/**
	 * ノートのinsertと同じトランザクションの中で、ドラフトを「投稿済み」にする。
	 * できなければ例外を投げ、ノートのinsertごとロールバックさせる。
	 */
	@bindThis
	private async markPosted(manager: EntityManager, draftId: MiNoteDraft['id'], noteId: MiNote['id']): Promise<void> {
		// ドラフトの更新・削除と競合した場合、行ロックで先の操作の確定を待ってから条件を評価し直す
		const result = await manager.createQueryBuilder()
			.update(MiNoteDraft)
			.set({ postedNoteId: noteId, postedAt: () => 'now()' })
			.where('id = :draftId', { draftId })
			.andWhere('"postedAt" IS NULL')
			.andWhere('"isActuallyScheduled" = true')
			.andWhere('"scheduledAt" <= :now', { now: new Date() })
			.execute();

		if (result.affected !== 1) {
			throw new IdentifiableError(ALREADY_HANDLED_ERROR_ID, 'Scheduled note draft was already posted, changed or deleted');
		}
	}

	/**
	 * 投稿済みのドラフトの後処理。通知→ドラフト削除の順に行う。
	 * 通知はベストエフォートで、ドラフト削除の前に止まった場合は再実行で重複しうる。
	 */
	@bindThis
	private async finishPosted(draft: DraftForPostProcess): Promise<void> {
		if (draft.postedNoteId != null) {
			this.notificationService.createNotification(draft.userId, 'scheduledNotePosted', {
				noteId: draft.postedNoteId,
			});
		}

		await this.noteDraftsRepository.createQueryBuilder()
			.delete()
			.where('id = :id', { id: draft.id })
			.andWhere('"postedAt" IS NOT NULL')
			.execute();
	}

	/**
	 * 投稿に失敗したときの処理。これ以上再試行しない場合だけ、利用者に失敗を通知する。
	 * - 入力の検証で失敗した（IdentifiableError）: 再試行しても成功しないので、照合の対象からも外す
	 * - それ以外で、ジョブの再試行を使い切った: 照合ジョブの登録し直しも上限に達していれば通知する
	 */
	@bindThis
	private async handleFailure(job: Bull.Job<PostScheduledNoteJobData>, draft: MiNoteDraft, err: unknown): Promise<void> {
		const permanent = err instanceof IdentifiableError;
		const isLastAttempt = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

		this.logger.warn(`Failed to post scheduled note draft ${draft.id} (attempt ${job.attemptsMade + 1}, permanent: ${permanent})`, { error: err });

		if (!isLastAttempt) return;

		if (permanent) {
			await this.noteDraftsRepository.createQueryBuilder()
				.update()
				.set({ postAttempts: MAX_SCHEDULED_POST_REQUEUES })
				.where('id = :id', { id: draft.id })
				.andWhere('"postedAt" IS NULL')
				.execute();
		} else if (draft.postAttempts < MAX_SCHEDULED_POST_REQUEUES) {
			// 照合ジョブが登録し直す
			return;
		}

		this.notificationService.createNotification(draft.userId, 'scheduledNotePostFailed', {
			noteDraftId: draft.id,
		});
	}

	/**
	 * ドラフトの予約投稿ジョブが待機・実行中でなければ、登録し直す。
	 * 失敗・完了したジョブが同じIDで残っていると新規登録が無視されるので、先に取り除く。
	 */
	@bindThis
	private async requeueIfJobLost(draftId: MiNoteDraft['id']): Promise<boolean> {
		const job = await this.queueService.postScheduledNoteQueue.getJob(QueueService.postScheduledNoteJobId(draftId));
		if (job != null) {
			const state = await job.getState();
			if (state !== 'failed' && state !== 'completed' && state !== 'unknown') return false;
			await this.queueService.cancelScheduledNotePost(draftId);
		}

		const result = await this.noteDraftsRepository.createQueryBuilder()
			.update()
			.set({ postAttempts: () => '"postAttempts" + 1' })
			.where('id = :id', { id: draftId })
			.andWhere('"postedAt" IS NULL')
			.andWhere('"isActuallyScheduled" = true')
			.andWhere('"postAttempts" < :max', { max: MAX_SCHEDULED_POST_REQUEUES })
			.execute();
		if (result.affected !== 1) return false;

		await this.queueService.ensureNotePostScheduled(draftId, new Date());
		return true;
	}
}
