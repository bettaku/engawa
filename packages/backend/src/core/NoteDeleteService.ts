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
import { renoteCountSql, repliesCountSql, SMALLINT_MAX } from '@/core/CounterConsistencyService.js';
import { NoteOutboxService } from '@/core/NoteOutboxService.js';
import { retryOnDeadlock } from '@/misc/retry-on-deadlock.js';
import type { NoteOutboxStep } from '@/core/NoteOutboxService.js';
import type { MiNoteOutbox } from '@/models/NoteOutbox.js';

type NoteAuthor = { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; };

/**
 * ノート削除の副作用。削除の呼び出し元は、どれを実行するかを明示する。
 * 削除経路ごとの指定は docs/design/pre-rust-tech-debt.md の付録Cを参照。
 */
export type NoteDeleteEffects = {
	/** 返信先のrepliesCountを減らす */
	repliesCount: boolean;
	/** Renote先（引用を含む）のrenoteCountを、作成時に加算した場合と同じ条件で減らす */
	renoteCount: boolean;
	/** 投稿者のnotesCountを減らす */
	notesCount: boolean;
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
	renoteCount: true,
	notesCount: true,
	stream: true,
	deliver: true,
	stats: true,
	unindex: true,
});

export const NO_NOTE_DELETE_EFFECTS: NoNoteDeleteEffects = Object.freeze({
	repliesCount: false,
	renoteCount: false,
	notesCount: false,
	stream: false,
	deliver: false,
	stats: false,
	unindex: false,
});

/** `delete`の`quiet`。カウンタと検索索引だけを整合させ、外部に見える副作用は出さない */
const QUIET_NOTE_DELETE_EFFECTS: Readonly<NoteDeleteEffects> = Object.freeze({
	...NO_NOTE_DELETE_EFFECTS,
	repliesCount: true,
	renoteCount: true,
	notesCount: true,
	unindex: true,
});

/**
 * 削除の副作用のうち、行を消す前にDBから読んでおくもの（配送先）。
 */
type NoteDeleteEffectsContext = {
	/** 引用でないRenoteを削除するときの、Renote元のノートのURI */
	renoteUri: string | null;
	/** フォロワーとリレー以外の配送先 */
	remoteUserIds: MiUser['id'][];
};

const EMPTY_CONTEXT: NoteDeleteEffectsContext = Object.freeze({ renoteUri: null, remoteUserIds: [] });

/** outboxで実行する削除の副作用。カウンタ（repliesCount・renoteCount・notesCount）は、行の削除と同じトランザクションで更新する */
const OUTBOX_EFFECTS = ['stream', 'deliver', 'stats', 'unindex'] as const;
type NoteDeleteOutboxEffect = typeof OUTBOX_EFFECTS[number];

/**
 * outboxの削除のレコードのpayload。
 * 行が消えた後でも副作用を実行できるよう、配送先の計算とチャートに必要な情報だけを持つ。本文・CW・投票などの内容は持たない。
 */
export type NoteDeletedOutboxPayload = {
	effects: NoteDeleteOutboxEffect[];
	note: Pick<MiNote, 'id' | 'userId' | 'userHost' | 'visibility' | 'visibleUserIds' | 'localOnly' | 'searchableBy' | 'replyId' | 'renoteId' | 'fileIds'> & {
		updatedAt: string | null;
	};
	/** 引用でないRenoteか（Deleteの代わりにUndo Announceを配送する） */
	isPureRenote: boolean;
	renoteUri: string | null;
	remoteUserIds: MiUser['id'][];
	/**
	 * 作成の副作用を終える前に削除した場合の、実行済みの作成の副作用の名前。
	 * ないときは作成の副作用がすべて終わっているので、チャートと配送をすべて取り消す。
	 */
	createdDone?: string[];
};

export type ScheduledNoteDeleteResult =
	| { deleted: true }
	/** deleteAt: 削除しなかった時点のDBの値。ノートがない・予約が解除されているときはnull */
	| { deleted: false; deleteAt: Date | null };

/**
 * ノートの削除を担う。ノートの行を消す処理は、すべてこのサービスを通す。
 *
 * どの経路も、1つのトランザクションで次の3つを確定する。
 * 1. 行の削除（`DELETE … RETURNING id`）。同時に同じ行を削除しても、確定できるのは1つの呼び出しだけ
 * 2. 非正規化カウンタの減算（作成時の加算も、行のinsertと同じトランザクションで行う）
 * 3. 残りの副作用（ストリーム、配送、チャート、検索索引）のoutboxへの記録
 *
 * outboxの副作用は、コミット後にこの呼び出しの中で処理する。途中でプロセスが停止しても、照合ジョブが残りを処理する（P3-1）。
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
		private noteOutboxService: NoteOutboxService,
	) {
		this.logger = this.loggerService.getLogger('note-delete');
		this.noteOutboxService.registerHandler('deleted', this.handleDeleted);
	}

	/**
	 * 投稿を削除します。
	 * @param user 投稿者
	 * @param note 投稿
	 * @param quiet trueなら、カウンタ（返信先の返信数、Renote先のRenote数、投稿者のノート数）と検索索引の更新だけを行い、配送・ストリーム・チャートの更新をしない
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
	 * 行の削除は1つのトランザクションで確定し、実際に削除できたノートについてだけ`effects`で指定した副作用を実行します。
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

		// 削除する行とカウンタの行のロックが、ほかの作成・削除と競合してデッドロックになったら、トランザクションごとやり直す
		const { deleted, outboxSeqs } = await retryOnDeadlock(() => this.db.transaction(manager => this.deleteInTransaction(manager, user, fullNotes, contexts, effects)));

		// 副作用ごとに失敗を切り分けるので、1件が失敗しても他のノートの副作用は続く。失敗した副作用はoutboxに残り、後で再試行する
		await this.noteOutboxService.processNow(outboxSeqs);

		return deleted;
	}

	/**
	 * 削除予定時刻（deleteAt）を過ぎているノートだけを削除します。
	 *
	 * DBのdeleteAtを行ロックの中で確認してから削除を確定するので、予約の延期・解除と競合しても誤って削除しません。
	 * 副作用（配送、ストリーム、チャート、検索索引）は、削除を確定できた呼び出しだけがコミット後に実行します。
	 */
	@bindThis
	public async deleteIfScheduledTimeReached(noteId: MiNote['id']): Promise<ScheduledNoteDeleteResult> {
		const effects = ALL_NOTE_DELETE_EFFECTS;

		const confirmed = await retryOnDeadlock(() => this.db.transaction(async manager => {
			const note = await manager.createQueryBuilder(MiNote, 'note')
				.setLock('pessimistic_write')
				.where('note.id = :id', { id: noteId })
				.andWhere('note.deleteAt IS NOT NULL')
				.andWhere('note.deleteAt <= now()')
				.getOne();

			if (note == null) return null;

			const user = await manager.findOneByOrFail(MiUser, { id: note.userId });
			const context = await this.collectEffectsContext(user, note, effects, manager);

			return await this.deleteInTransaction(manager, user, [note], new Map([[note.id, context]]), effects);
		}));

		if (confirmed == null || confirmed.deleted.length === 0) {
			const current = await this.notesRepository.findOne({
				where: { id: noteId },
				select: { id: true, deleteAt: true },
			});
			return { deleted: false, deleteAt: current?.deleteAt ?? null };
		}

		await this.noteOutboxService.processNow(confirmed.outboxSeqs);

		return { deleted: true };
	}

	/**
	 * 行の削除、カウンタの減算、outboxへの記録を、渡されたトランザクションの中で行う。
	 */
	@bindThis
	private async deleteInTransaction(
		manager: EntityManager,
		user: NoteAuthor,
		notes: MiNote[],
		contexts: Map<MiNote['id'], NoteDeleteEffectsContext>,
		effects: Readonly<NoteDeleteEffects>,
	): Promise<{ deleted: MiNote[]; outboxSeqs: MiNoteOutbox['seq'][] }> {
		const deletedIds = await this.deleteRows(manager, notes.map(note => note.id), user.id);
		const deleted = notes.filter(note => deletedIds.has(note.id));
		if (deleted.length === 0) return { deleted, outboxSeqs: [] };

		await this.decrementCounters(manager, user, deleted, effects);

		// まだ誰も処理を始めていない作成・更新のレコードは、副作用を実行する必要がなくなったので取り消す
		const createdCancelled = await this.noteOutboxService.cancelUnstarted(manager, deleted.map(note => note.id));

		const outboxEffects = OUTBOX_EFFECTS.filter(name => effects[name]);
		if (outboxEffects.length === 0) return { deleted, outboxSeqs: [] };

		const outboxSeqs = await this.noteOutboxService.add(manager, deleted.map(note => ({
			type: 'deleted',
			noteId: note.id,
			userId: user.id,
			payload: this.buildOutboxPayload(note, contexts.get(note.id) ?? EMPTY_CONTEXT, outboxEffects, createdCancelled.has(note.id)),
		})));

		return { deleted, outboxSeqs };
	}

	@bindThis
	private buildOutboxPayload(note: MiNote, context: NoteDeleteEffectsContext, effects: NoteDeleteOutboxEffect[], createdCancelled: boolean): NoteDeletedOutboxPayload {
		return {
			effects,
			note: {
				id: note.id,
				userId: note.userId,
				userHost: note.userHost,
				visibility: note.visibility,
				visibleUserIds: note.visibleUserIds,
				localOnly: note.localOnly,
				searchableBy: note.searchableBy,
				replyId: note.replyId,
				renoteId: note.renoteId,
				fileIds: note.fileIds,
				updatedAt: note.updatedAt != null ? new Date(note.updatedAt).toISOString() : null,
			},
			isPureRenote: isRenote(note) && !isQuote(note),
			renoteUri: context.renoteUri,
			remoteUserIds: context.remoteUserIds,
			// 作成の副作用は一度も実行されていないので、チャートと配送は取り消さない
			...(createdCancelled ? { createdDone: [] } : {}),
		};
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

		const renote = (isRenote(note) && !isQuote(note))
			? await manager.findOneBy(MiNote, { id: note.renoteId })
			: null;

		return {
			renoteUri: renote != null ? (renote.uri ?? `${this.config.url}/notes/${renote.id}`) : null,
			remoteUserIds: [...new Set([
				...await this.getMentionedRemoteUsers(note, manager),
				...await this.getRenotedOrRepliedRemoteUsers(note, manager),
			].map(u => u.id))],
		};
	}

	/**
	 * 作成時にRenote先のrenoteCountに計上したか。
	 * 作成時に記録した値（renoteCounted）を使う。記録する前に作成したノートは、作成時と同じ条件（Renote先の投稿者以外で、botでない投稿者）を
	 * 現在の投稿者の状態で判定する。
	 */
	@bindThis
	private isRenoteCounted(user: NoteAuthor, note: MiNote): boolean {
		if (note.renoteId == null) return false;
		return note.renoteCounted ?? (!user.isBot && note.renoteUserId !== user.id);
	}

	/**
	 * 削除を確定したノートの、返信先のrepliesCount・Renote先のrenoteCount・投稿者のnotesCountを、同じトランザクションで減らす。
	 *
	 * - 上限（smallint）に丸めてある値は、引くと実際の件数より少なくなるので、行を削除した後の残りを数え直す
	 * - 数え直しの前に対象の行ロックを取る。READ COMMITTEDでは文ごとにスナップショットを取るので、ロックを待つ間にコミットされた
	 *   別の削除・作成も数え直しに含まれる（並行する削除で数え直しの結果どうしが競合しない）
	 * - 行ロックはID順に取り、ユーザーは最後に更新する（作成側と同じ順序）
	 * - 同じ対象への複数のノートは、対象ごとに1回だけ更新する
	 */
	@bindThis
	private async decrementCounters(manager: EntityManager, user: NoteAuthor, notes: MiNote[], effects: Readonly<NoteDeleteEffects>) {
		const targets = new Map<MiNote['id'], { replies: number; renotes: number }>();
		const target = (id: MiNote['id']) => {
			let t = targets.get(id);
			if (t == null) targets.set(id, t = { replies: 0, renotes: 0 });
			return t;
		};
		for (const note of notes) {
			if (effects.repliesCount && note.replyId != null) target(note.replyId).replies++;
			if (effects.renoteCount && note.renoteId != null && this.isRenoteCounted(user, note)) target(note.renoteId).renotes++;
		}

		const ids = [...targets.keys()].sort();
		if (ids.length > 0) {
			await manager.query('SELECT "id" FROM "note" WHERE "id" = ANY($1) ORDER BY "id" FOR UPDATE', [ids]);

			for (const id of ids) {
				const t = targets.get(id);
				if (t == null) continue;
				const set: Record<string, () => string> = {};
				if (t.replies > 0) {
					set.repliesCount = () => `CASE WHEN "repliesCount" >= ${SMALLINT_MAX} THEN LEAST(${repliesCountSql('"note"')}, ${SMALLINT_MAX}) ELSE GREATEST("repliesCount" - :repliesDecrement, 0) END`;
				}
				if (t.renotes > 0) {
					set.renoteCount = () => `CASE WHEN "renoteCount" >= ${SMALLINT_MAX} THEN LEAST(${renoteCountSql('"note"')}, ${SMALLINT_MAX}) ELSE GREATEST("renoteCount" - :renotesDecrement, 0) END`;
				}
				await manager.createQueryBuilder().update(MiNote)
					.set(set)
					.where('id = :targetId', { targetId: id })
					.setParameters({ repliesDecrement: t.replies, renotesDecrement: t.renotes })
					.execute();
			}
		}

		if (effects.notesCount) {
			await manager.createQueryBuilder().update(MiUser)
				.set({ notesCount: () => 'GREATEST("notesCount" - :notesDecrement, 0)' })
				.where('id = :userId', { userId: user.id })
				.setParameter('notesDecrement', notes.length)
				.execute();
		}
	}

	/**
	 * outboxの削除のレコードの処理。行はすでに消えているので、レコードに記録した情報だけで副作用を実行する。
	 */
	@bindThis
	private async handleDeleted(record: MiNoteOutbox, step: NoteOutboxStep) {
		const payload = record.payload as NoteDeletedOutboxPayload;
		const note = new MiNote({
			...payload.note,
			updatedAt: payload.note.updatedAt != null ? new Date(payload.note.updatedAt) : null,
		});
		const effects = new Set(payload.effects);

		// 作成の副作用を終える前に削除したときは、作成の側で実行した分だけを取り消す（チャートなどの集計）
		const undo = (name: string) => payload.createdDone == null || payload.createdDone.includes(name);

		if (effects.has('stream')) {
			await step('stream', () => {
				this.globalEventService.publishNoteStream(note, 'deleted', {
					deletedAt: new Date(record.createdAt),
				});
			});
		}

		// ローカルの投稿なら削除アクティビティを配送。
		// 作成の配送が一部の宛先（リレーなど）にだけ届いて止まった場合もあるので、作成の配送が終わっていなくても配送する。
		// 作成を受け取っていない宛先には、存在しないノートの削除が届くだけである
		if (effects.has('deliver')) {
			await step('deliver', () => this.deliverDeletion(note, payload));
		}

		// チャートと連合サーバーの集計は、作成側と同じく別の副作用にする（片方だけ終わった状態での再試行で二重に減算しない）
		if (effects.has('stats') && undo('stats')) {
			await step('stats', () => {
				this.notesChart.update(note, false);
				if (this.meta.enableChartsForRemoteUser || (note.userHost == null)) {
					this.perUserNotesChart.update({ id: note.userId }, note, false);
				}
			});
		}

		if (effects.has('stats') && undo('instanceStats') && this.meta.enableStatsForFederatedInstances && note.userHost != null) {
			await step('instanceStats', async () => {
				const host = note.userHost;
				if (host == null) return;
				const i = await this.federatedInstanceService.fetchOrRegister(host);
				await this.instancesRepository.decrement({ id: i.id }, 'notesCount', 1);
				if (this.meta.enableChartsForFederatedInstances) {
					this.instanceChart.updateNote(i.host, note, false);
				}
			});
		}

		if (effects.has('unindex')) {
			// ジョブはノートが存在しないことを確認して索引から削除する
			await step('unindex', () => this.searchService.requestSyncNoteIndex(note.id));
		}
	}

	@bindThis
	private async deliverDeletion(note: MiNote, payload: NoteDeletedOutboxPayload) {
		if (note.userHost != null || note.localOnly) return;

		const author = { id: note.userId, host: null } as const;
		const renoteUri = payload.isPureRenote ? payload.renoteUri : null;

		// 公開範囲がspecifiedの純粋なRenoteは、作成時もrenderAnnounceが例外を投げるのでAnnounceを配送していない。
		// 取り消す配送がないので、何も配送しない
		if (renoteUri != null && !['public', 'home', 'followers'].includes(note.visibility)) return;

		const content = this.apRendererService.addContext(renoteUri != null
			? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renoteUri, note), author)
			: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), author));

		const remoteUsers = payload.remoteUserIds.length > 0
			? (await this.usersRepository.findBy({ id: In(payload.remoteUserIds) })).filter(u => this.userEntityService.isRemoteUser(u))
			: [];

		await this.deliverToConcerned(author, content, remoteUsers);
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
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, content: any, remoteUsers: MiRemoteUser[]) {
		await this.apDeliverManagerService.deliverToFollowers(user, content);
		await this.relayService.deliverToRelays(user, content);
		await this.apDeliverManagerService.deliverToUsers(user, content, remoteUsers);
	}
}
