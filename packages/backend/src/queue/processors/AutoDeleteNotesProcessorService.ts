/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiNote, NotesRepository, UsersRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { ALL_NOTE_DELETE_EFFECTS, NoteDeleteService } from '@/core/NoteDeleteService.js';
import { QueueService } from '@/core/QueueService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbJobDataWithUser } from '../types.js';

/** 1回のジョブで、1ユーザーあたりに削除するノート数の上限。配送が一度に集中しないようにする */
export const AUTO_DELETE_NOTES_LIMIT_PER_RUN = 1000;

/** 一度に削除するノート数 */
const BATCH_SIZE = 100;

const DAY = 24 * 60 * 60 * 1000;

/**
 * ノートの自動削除。
 *
 * 定期ジョブ（system queue）は対象のユーザーを列挙して、ユーザーごとのジョブ（db queue）を登録するだけを行う。
 * 削除はユーザーごとのジョブが`NoteDeleteService`を通して行い、通常の削除と同じ副作用（配送など）を実行する。
 */
@Injectable()
export class AutoDeleteNotesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private idService: IdService,
		private noteDeleteService: NoteDeleteService,
		private queueService: QueueService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('auto-delete-notes');
	}

	/**
	 * 自動削除を設定しているローカルユーザーを列挙し、ユーザーごとの削除ジョブを登録する。
	 */
	@bindThis
	public async process(): Promise<{ queuedUsers: number }> {
		const users = await this.usersRepository.find({
			select: { id: true },
			where: {
				host: IsNull(),
				autoDeleteNotesAfterDays: Not(IsNull()),
			},
		});

		if (users.length > 0) {
			await this.queueService.createAutoDeleteUserNotesJobs(users);
		}

		this.logger.info(`Queued auto-delete notes jobs for ${users.length} user(s).`);

		return { queuedUsers: users.length };
	}

	/**
	 * 1ユーザーの、保存期間を過ぎたノートを削除する。
	 */
	@bindThis
	public async processUser(job: Bull.Job<DbJobDataWithUser>): Promise<{ deletedCount: number }> {
		const user = await this.usersRepository.findOneBy({ id: job.data.user.id, host: IsNull() });

		// ジョブの登録後に設定が変わった・ユーザーが消えた
		const days = user?.autoDeleteNotesAfterDays;
		if (user == null || days == null || days <= 0) {
			return { deletedCount: 0 };
		}

		const deleteBeforeId = this.idService.gen(Date.now() - (days * DAY));

		let deletedCount = 0;
		let cursor: MiNote['id'] | null = null;

		while (deletedCount < AUTO_DELETE_NOTES_LIMIT_PER_RUN) {
			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.userId = :userId', { userId: user.id })
				.andWhere('note.id < :deleteBeforeId', { deleteBeforeId })
				.orderBy('note.id', 'ASC')
				.limit(Math.min(BATCH_SIZE, AUTO_DELETE_NOTES_LIMIT_PER_RUN - deletedCount));

			// 削除できなかったノート（他の経路と競合したなど）で止まらないよう、カーソルで進める
			if (cursor != null) {
				query.andWhere('note.id > :cursor', { cursor });
			}

			// お気に入りの保護が有効なら、お気に入りに登録されたノートを除く
			if (user.autoDeleteKeepFavorites) {
				query.andWhere('NOT EXISTS (SELECT 1 FROM note_favorite WHERE "noteId" = note.id)');
			}

			const notes = await query.getMany();
			if (notes.length === 0) break;

			cursor = notes[notes.length - 1].id;

			const deleted = await this.noteDeleteService.deleteMany(user, notes, {
				effects: ALL_NOTE_DELETE_EFFECTS,
			});
			deletedCount += deleted.length;
		}

		if (deletedCount > 0) {
			this.logger.info(`Deleted ${deletedCount} note(s) of user ${user.id} older than ${days} day(s)`);
		}

		return { deletedCount };
	}
}
