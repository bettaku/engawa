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
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';

type NoteAuthor = { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; };

/**
 * ノート削除の副作用。削除の呼び出し元は、どれを実行するかを明示する。
 * 削除経路ごとの指定は docs/design/pre-rust-tech-debt.md の付録Cを参照。
 */
export type NoteDeleteEffects = {
	/** 返信先のrepliesCountを減らす */
	repliesCount: boolean;
	/** ストリームに削除を流す */
	stream: boolean;
	/** ローカルのノートなら、Delete（引用でないRenoteならUndo Announce）を配送する */
	deliver: boolean;
	/** チャートと、連合しているサーバーのノート数を更新する */
	stats: boolean;
	/** 検索索引から削除する */
	unindex: boolean;
};

/** 副作用を何も実行しない指定。行の削除だけを行う */
export type NoNoteDeleteEffects = { readonly [K in keyof NoteDeleteEffects]: false };

export const ALL_NOTE_DELETE_EFFECTS: Readonly<NoteDeleteEffects> = Object.freeze({
	repliesCount: true,
	stream: true,
	deliver: true,
	stats: true,
	unindex: true,
});

export const NO_NOTE_DELETE_EFFECTS: NoNoteDeleteEffects = Object.freeze({
	repliesCount: false,
	stream: false,
	deliver: false,
	stats: false,
	unindex: false,
});

/** `delete`の`quiet`。返信数と検索索引だけを整合させ、外部に見える副作用は出さない */
const QUIET_NOTE_DELETE_EFFECTS: Readonly<NoteDeleteEffects> = Object.freeze({
	...NO_NOTE_DELETE_EFFECTS,
	repliesCount: true,
	unindex: true,
});

/**
 * 削除の副作用のうち、DBから読んでおくもの（配送先）。
 * 削除を確定した後は副作用だけを実行するよう、行を消す前に読んでおく。
 */
type NoteDeleteEffectsContext = {
	/** 引用でないRenoteを削除するときの、Renote元のノート */
	renote: MiNote | null;
	/** フォロワーとリレー以外の配送先 */
	remoteUsers: MiRemoteUser[];
};

const EMPTY_CONTEXT: NoteDeleteEffectsContext = Object.freeze({ renote: null, remoteUsers: [] });

export type ScheduledNoteDeleteResult =
	| { deleted: true }
	/** deleteAt: 削除しなかった時点のDBの値。ノートがない・予約が解除されているときはnull */
	| { deleted: false; deleteAt: Date | null };

/**
 * ノートの削除を担う。ノートの行を消す処理は、すべてこのサービスを通す。
 *
 * どの経路も「行の削除を確定する → 確定できたノートについてだけ副作用を実行する」の順に処理する。
 * 同じノートを同時に削除しても、副作用（配送、カウンタの減算など）は1回しか実行されない。
 * 削除の確定後、副作用の途中でプロセスが停止すると副作用は欠落する（P3-1で扱う）。
 */
@Injectable()
export class NoteDeleteService {
	private logger: Logger;

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
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('note-delete');
	}

	/**
	 * 投稿を削除します。
	 * @param user 投稿者
	 * @param note 投稿
	 * @param quiet trueなら、返信数と検索索引の更新だけを行い、配送・ストリーム・チャートの更新をしない
	 * @param deleter 投稿者以外が削除したときの削除者。モデレーションログに記録する
	 */
	@bindThis
	public async delete(user: NoteAuthor, note: MiNote, quiet = false, deleter?: MiUser) {
		const deleted = await this.deleteMany(user, [note], {
			effects: quiet ? QUIET_NOTE_DELETE_EFFECTS : ALL_NOTE_DELETE_EFFECTS,
		});

		// 他の経路が先に削除した
		if (deleted.length === 0) return;

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
	 * 同じ投稿者の複数のノートをまとめて削除します。
	 *
	 * 行の削除は1つのDELETE文で確定し、実際に削除できたノートについてだけ`effects`で指定した副作用を実行します。
	 *
	 * @param user 投稿者。`null`は投稿者の異なるノートをまとめて消すときに使い、副作用は指定できない
	 * @param notes 削除するノート。`user`のノートでないものは削除しない
	 * @returns 実際に削除したノート
	 */
	public async deleteMany(user: NoteAuthor, notes: MiNote[], options: { effects: Readonly<NoteDeleteEffects> }): Promise<MiNote[]>;
	public async deleteMany(user: null, notes: Pick<MiNote, 'id'>[], options: { effects: NoNoteDeleteEffects }): Promise<Pick<MiNote, 'id'>[]>;
	@bindThis
	public async deleteMany(user: NoteAuthor | null, notes: MiNote[] | Pick<MiNote, 'id'>[], options: { effects: Readonly<NoteDeleteEffects> }): Promise<MiNote[] | Pick<MiNote, 'id'>[]> {
		if (notes.length === 0) return [];

		if (user == null) {
			if (Object.values(options.effects).some(x => x)) {
				throw new Error('effects require the author of the notes');
			}
			const deletedIds = await this.deleteRows(this.db.manager, notes.map(note => note.id), null);
			return notes.filter(note => deletedIds.has(note.id));
		}

		// 同じノートが重複して渡されても、副作用は1回だけ実行する
		const fullNotes = [...new Map((notes as MiNote[]).map(note => [note.id, note])).values()];
		const { effects } = options;

		// 配送先は、行を消す前に読んでおく
		const contexts = new Map<MiNote['id'], NoteDeleteEffectsContext>();
		for (const note of fullNotes) {
			contexts.set(note.id, await this.collectEffectsContext(user, note, effects));
		}

		const deletedIds = await this.deleteRows(this.db.manager, fullNotes.map(note => note.id), user.id);
		const deletedNotes = fullNotes.filter(note => deletedIds.has(note.id));

		// runEffectsは副作用ごとに失敗を切り分けるので、1件が失敗しても他のノートの副作用は続く
		for (const note of deletedNotes) {
			await this.runEffects(user, note, contexts.get(note.id) ?? EMPTY_CONTEXT, effects);
		}

		return deletedNotes;
	}

	/**
	 * 削除予定時刻（deleteAt）を過ぎているノートだけを削除します。
	 *
	 * DBのdeleteAtを行ロックの中で確認してから削除を確定するので、予約の延期・解除と競合しても誤って削除しません。
	 * 副作用（配送、カウンタ、検索索引、ストリーム）は、削除を確定できた呼び出しだけがコミット後に実行します。
	 */
	@bindThis
	public async deleteIfScheduledTimeReached(noteId: MiNote['id']): Promise<ScheduledNoteDeleteResult> {
		const effects = ALL_NOTE_DELETE_EFFECTS;

		const confirmed = await this.db.transaction(async manager => {
			const note = await manager.createQueryBuilder(MiNote, 'note')
				.setLock('pessimistic_write')
				.where('note.id = :id', { id: noteId })
				.andWhere('note.deleteAt IS NOT NULL')
				.andWhere('note.deleteAt <= now()')
				.getOne();

			if (note == null) return null;

			const user = await manager.findOneByOrFail(MiUser, { id: note.userId });
			const context = await this.collectEffectsContext(user, note, effects, manager);

			await this.deleteRows(manager, [note.id], user.id);

			return { note, user, context };
		});

		if (confirmed == null) {
			const current = await this.notesRepository.findOne({
				where: { id: noteId },
				select: { id: true, deleteAt: true },
			});
			return { deleted: false, deleteAt: current?.deleteAt ?? null };
		}

		await this.runEffects(confirmed.user, confirmed.note, confirmed.context, effects);

		return { deleted: true };
	}

	/**
	 * ノートの行を削除し、実際に削除できた行のIDを返す。
	 * 同時に同じ行を削除した場合、行ロックで待たされた側は0件になる。
	 */
	@bindThis
	private async deleteRows(manager: EntityManager, noteIds: MiNote['id'][], userId: MiUser['id'] | null): Promise<Set<MiNote['id']>> {
		if (noteIds.length === 0) return new Set();

		const query = manager.createQueryBuilder()
			.delete()
			.from(MiNote)
			.where({ id: In(noteIds) });

		if (userId != null) {
			query.andWhere({ userId });
		}

		const result = await query.returning(['id']).execute();
		return new Set((result.raw as { id: MiNote['id'] }[]).map(row => row.id));
	}

	@bindThis
	private async collectEffectsContext(user: NoteAuthor, note: MiNote, effects: Readonly<NoteDeleteEffects>, manager: EntityManager = this.db.manager): Promise<NoteDeleteEffectsContext> {
		// 配送しないときは何も読まない
		if (!effects.deliver || !this.userEntityService.isLocalUser(user) || note.localOnly) {
			return EMPTY_CONTEXT;
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

	/**
	 * 削除を確定したノートの副作用を実行する。
	 * 行の削除は確定済みで、再試行しても副作用の対象に戻らない。そのため、副作用ごとに失敗を切り分け、
	 * 1つが失敗しても（例: 配送の組み立てが例外を投げる）残りの副作用は実行する。この関数は例外を投げない。
	 */
	@bindThis
	private async runEffects(user: NoteAuthor, note: MiNote, context: NoteDeleteEffectsContext, effects: Readonly<NoteDeleteEffects>) {
		const deletedAt = new Date();

		const step = async (name: keyof NoteDeleteEffects, fn: () => unknown) => {
			if (!effects[name]) return;
			try {
				await fn();
			} catch (err) {
				this.logger.error(`Failed to run delete effect "${name}" of note ${note.id}`, { error: err });
			}
		};

		await step('repliesCount', async () => {
			if (note.replyId) {
				await this.notesRepository.decrement({ id: note.replyId }, 'repliesCount', 1);
			}
		});

		await step('stream', () => {
			this.globalEventService.publishNoteStream(note, 'deleted', {
				deletedAt: deletedAt,
			});
		});

		// ローカルの投稿なら削除アクティビティを配送
		await step('deliver', () => {
			if (!this.userEntityService.isLocalUser(user) || note.localOnly) return;

			const renote = context.renote;

			// 公開範囲がspecifiedの純粋なRenoteは、作成時もrenderAnnounceが例外を投げるのでAnnounceを配送していない。
			// 取り消す配送がないので、何も配送しない
			if (renote && !['public', 'home', 'followers'].includes(note.visibility)) return;

			const content = this.apRendererService.addContext(renote
				? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
				: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

			this.deliverToConcerned(user, content, context.remoteUsers);
		});

		await step('stats', () => {
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
		});

		await step('unindex', async () => {
			// 削除の確定後に登録するので、ジョブはノートが存在しないことを確認して索引から削除する
			await this.searchService.requestSyncNoteIndex(note.id);
		});
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
