/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, DataSource, In, IsNull, Not } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Injectable, Inject } from '@nestjs/common';
import { MiUser } from '@/models/User.js';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { MiNote } from '@/models/Note.js';
import type { IMentionedRemoteUsers } from '@/models/Note.js';
import type { InstancesRepository, MiMeta, NotesRepository, UsersRepository } from '@/models/_.js';
import { RelayService } from '@/core/RelayService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import NotesChart from '@/core/chart/charts/notes.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';

type NoteAuthor = { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; };

/**
 * 削除の副作用のうち、ノートの行があるうちにDBから読んでおく必要があるもの。
 * Renote・返信の行は対象の行と一緒に消える（ON DELETE CASCADE）ので、行を消した後では配送先を求められない。
 */
type NoteDeleteEffectsContext = {
	/** 引用でないRenoteを削除するときの、Renote元のノート */
	renote: MiNote | null;
	/** フォロワーとリレー以外の配送先 */
	remoteUsers: MiRemoteUser[];
};

export type ScheduledNoteDeleteResult =
	| { deleted: true }
	/** deleteAt: 削除しなかった時点のDBの値。ノートがない・予約が解除されているときはnull */
	| { deleted: false; deleteAt: Date | null };

@Injectable()
export class NoteDeleteService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private relayService: RelayService,
		private federatedInstanceService: FederatedInstanceService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private searchService: SearchService,
		private moderationLogService: ModerationLogService,
		private notesChart: NotesChart,
		private perUserNotesChart: PerUserNotesChart,
		private instanceChart: InstanceChart,
	) {}

	/**
	 * 投稿を削除します。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async delete(user: NoteAuthor, note: MiNote, quiet = false, deleter?: MiUser) {
		// TODO: 予約削除と同じく「行の削除を確定してから副作用」の順にする
		const context = await this.collectEffectsContext(user, note, quiet);
		await this.runEffects(user, note, context, quiet);

		await this.notesRepository.delete({
			id: note.id,
			userId: user.id,
		});

		if (deleter && (note.userId !== deleter.id)) {
			const user = await this.usersRepository.findOneByOrFail({ id: note.userId });
			this.moderationLogService.log(deleter, 'deleteNote', {
				noteId: note.id,
				noteUserId: note.userId,
				noteUserUsername: user.username,
				noteUserHost: user.host,
				note: note,
			});
		}
	}

	/**
	 * 削除予定時刻（deleteAt）を過ぎているノートだけを削除します。
	 *
	 * DBのdeleteAtを行ロックの中で確認してから削除を確定するので、予約の延期・解除と競合しても誤って削除しません。
	 * 副作用（配送、カウンタ、検索索引、ストリーム）は、削除を確定できた呼び出しだけがコミット後に実行します。
	 */
	@bindThis
	public async deleteIfScheduledTimeReached(noteId: MiNote['id']): Promise<ScheduledNoteDeleteResult> {
		const confirmed = await this.db.transaction(async manager => {
			const note = await manager.createQueryBuilder(MiNote, 'note')
				.setLock('pessimistic_write')
				.where('note.id = :id', { id: noteId })
				.andWhere('note.deleteAt IS NOT NULL')
				.andWhere('note.deleteAt <= now()')
				.getOne();

			if (note == null) return null;

			const user = await manager.findOneByOrFail(MiUser, { id: note.userId });
			const context = await this.collectEffectsContext(user, note, false, manager);

			await manager.delete(MiNote, { id: note.id });

			return { note, user, context };
		});

		if (confirmed == null) {
			const current = await this.notesRepository.findOne({
				where: { id: noteId },
				select: { id: true, deleteAt: true },
			});
			return { deleted: false, deleteAt: current?.deleteAt ?? null };
		}

		await this.runEffects(confirmed.user, confirmed.note, confirmed.context, false);

		return { deleted: true };
	}

	@bindThis
	private async collectEffectsContext(user: NoteAuthor, note: MiNote, quiet: boolean, manager: EntityManager = this.db.manager): Promise<NoteDeleteEffectsContext> {
		// 配送しないときは何も読まない
		if (quiet || !this.userEntityService.isLocalUser(user) || note.localOnly) {
			return { renote: null, remoteUsers: [] };
		}

		return {
			renote: (isRenote(note) && !isQuote(note))
				? await manager.findOneBy(MiNote, { id: note.renoteId })
				: null,
			remoteUsers: [
				...await this.getMentionedRemoteUsers(note, manager),
				...await this.getRenotedOrRepliedRemoteUsers(note, manager),
			],
		};
	}

	@bindThis
	private async runEffects(user: NoteAuthor, note: MiNote, context: NoteDeleteEffectsContext, quiet: boolean) {
		const deletedAt = new Date();

		if (note.replyId) {
			await this.notesRepository.decrement({ id: note.replyId }, 'repliesCount', 1);
		}

		if (!quiet) {
			this.globalEventService.publishNoteStream(note, 'deleted', {
				deletedAt: deletedAt,
			});

			//#region ローカルの投稿なら削除アクティビティを配送
			if (this.userEntityService.isLocalUser(user) && !note.localOnly) {
				const renote = context.renote;

				const content = this.apRendererService.addContext(renote
					? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
					: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

				this.deliverToConcerned(user, content, context.remoteUsers);
			}
			//#endregion

			this.notesChart.update(note, false);
			if (this.meta.enableChartsForRemoteUser || (user.host == null)) {
				this.perUserNotesChart.update(user, note, false);
			}

			if (this.meta.enableStatsForFederatedInstances) {
				if (this.userEntityService.isRemoteUser(user)) {
					this.federatedInstanceService.fetchOrRegister(user.host).then(async i => {
						this.instancesRepository.decrement({ id: i.id }, 'notesCount', 1);
						if (this.meta.enableChartsForFederatedInstances) {
							this.instanceChart.updateNote(i.host, note, false);
						}
					});
				}
			}
		}

		this.searchService.unindexNote(note);
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote, manager: EntityManager) {
		const where = [] as any[];

		// mention / reply / dm
		const uris = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);
		if (uris.length > 0) {
			where.push(
				{ uri: In(uris) },
			);
		}

		// renote / quote
		if (note.renoteUserId) {
			where.push({
				id: note.renoteUserId,
			});
		}

		if (where.length === 0) return [];

		return await manager.find(MiUser, {
			where,
		}) as MiRemoteUser[];
	}

	@bindThis
	private async getRenotedOrRepliedRemoteUsers(note: MiNote, manager: EntityManager) {
		const query = manager.createQueryBuilder(MiNote, 'note')
			.leftJoinAndSelect('note.user', 'user')
			.where(new Brackets(qb => {
				qb.orWhere('note.renoteId = :renoteId', { renoteId: note.id });
				qb.orWhere('note.replyId = :replyId', { replyId: note.id });
			}))
			.andWhere({ userHost: Not(IsNull()) });
		const notes = await query.getMany() as (MiNote & { user: MiRemoteUser })[];
		const remoteUsers = notes.map(({ user }) => user);
		return remoteUsers;
	}

	@bindThis
	private deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, content: any, remoteUsers: MiRemoteUser[]) {
		this.apDeliverManagerService.deliverToFollowers(user, content);
		this.relayService.deliverToRelays(user, content);
		this.apDeliverManagerService.deliverToUsers(user, content, remoteUsers);
	}
}
