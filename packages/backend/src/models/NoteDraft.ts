/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { noteVisibilities, noteReactionAcceptances, noteSearchableBy } from '@/types.js';
import * as Event from '@/models/Event.js';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiNote } from './Note.js';
import type { MiDriveFile } from './DriveFile.js';

@Entity('note_draft')
@Index('IDX_NOTE_DRAFT_FILE_IDS', { synchronize: false }) // GIN for fileIds in production
@Index('IDX_NOTE_DRAFT_VISIBLE_USER_IDS', { synchronize: false }) // GIN for visibleUserIds in production
export class MiNoteDraft {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_NOTE_DRAFT_REPLY_ID')
	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of reply target.',
	})
	public replyId: MiNote['id'] | null;

	// There is a possibility that replyId is not null but reply is null when the reply note is deleted.
	@ManyToOne(type => MiNote, {
		createForeignKeyConstraints: false,
	})
	@JoinColumn()
	public reply: MiNote | null;

	@Index('IDX_NOTE_DRAFT_RENOTE_ID')
	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of renote target.',
	})
	public renoteId: MiNote['id'] | null;

	// There is a possibility that renoteId is not null but renote is null when the renote note is deleted.
	@ManyToOne(type => MiNote, {
		createForeignKeyConstraints: false,
	})
	@JoinColumn()
	public renote: MiNote | null;

	@Column('boolean', {
		default: false,
	})
	public hasEvent: boolean;

	// TODO: varcharにしたい(Note.tsと同じ)
	@Column('text', {
		nullable: true,
	})
	public text: string | null;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public cw: string | null;

	@Index('IDX_NOTE_DRAFT_USER_ID')
	@Column({
		...id(),
		comment: 'The ID of author.',
	})
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('boolean', {
		default: false,
	})
	public localOnly: boolean;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public reactionAcceptance: typeof noteReactionAcceptances[number];

	@Column('boolean', {
		default: false,
	})
	public disableRightClick: boolean;

	/**
	 * public ... 公開
	 * home ... ホームタイムライン(ユーザーページのタイムライン含む)のみに流す
	 * followers ... フォロワーのみ
	 * specified ... visibleUserIds で指定したユーザーのみ
	 */
	@Column('enum', {
		enum: noteVisibilities,
	})
	public visibility: typeof noteVisibilities[number];

	@Index('IDX_NOTE_DRAFT_FILE_IDS', { synchronize: false })
	@Column({
		...id(),
		array: true, default: '{}',
	})
	public fileIds: MiDriveFile['id'][];

	@Index('IDX_NOTE_DRAFT_VISIBLE_USER_IDS', { synchronize: false })
	@Column({
		...id(),
		array: true, default: '{}',
	})
	public visibleUserIds: MiUser['id'][];

	@Column('varchar', {
		length: 128, nullable: true,
	})
	public hashtag: string | null;

	//#region 以下、Pollについて追加

	@Column('boolean', {
		default: false,
	})
	public hasPoll: boolean;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public pollChoices: string[];

	@Column('boolean')
	public pollMultiple: boolean;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public pollExpiresAt: Date | null;

	@Column('bigint', {
		nullable: true,
	})
	public pollExpiredAfter: number | null;

	//#endregion

	// 予約日時
	// これがあるだけでは実際に予約されているかどうかはわからない
	@Index('IDX_note_draft_scheduledAt_pending', { where: '"isActuallyScheduled" = true AND "postedAt" IS NULL' })
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public scheduledAt: Date | null;

	// scheduledAtに基づいて実際にスケジュールされているか
	@Column('boolean', {
		default: false,
	})
	public isActuallyScheduled: boolean;

	@Index()
	@Column('timestamp with time zone', {
		comment: 'The start time of the event',
		nullable: true,
	})
	public eventStart: Date | null;

	@Column('timestamp with time zone', {
		comment: 'The end of the event',
		nullable: true,
	})
	public eventEnd: Date | null;

	@Column({
		type: 'varchar',
		length: 128,
		comment: 'short name of event',
		nullable: true,
	})
	public eventTitle: string | null;

	@Column('jsonb', {
		default: {
			'@context': 'https://schema.org/',
			'@type': 'Event',
		},
		comment: 'metadata object describing the event. Follows https://schema.org/Event',
		nullable: true,
	})
	public eventMetadata: Event.EventSchema;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public deleteAt: Date | null;

	@Column('enum', {
		enum: noteSearchableBy,
		default: 'public',
		enumName: 'note_searchableby_enum',
	})
	public searchableBy: typeof noteSearchableBy[number];

	/**
	 * 予約投稿で作成したノートのID。postedAtと同時に設定する。
	 * ノートはその後に削除されうるので、外部キーにはしない。
	 */
	@Column({
		...id(),
		nullable: true,
	})
	public postedNoteId: MiNote['id'] | null;

	/**
	 * 予約投稿でノートを作成した時刻。ノートのinsertと同じトランザクションで設定する。
	 * これが設定されたドラフトからは、ノートを再び作成しない（後処理だけを行う）。
	 */
	@Index('IDX_note_draft_postedAt', { where: '"postedAt" IS NOT NULL' })
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public postedAt: Date | null;

	/**
	 * 照合ジョブが予約投稿のジョブを登録し直した回数。上限に達したら照合の対象から外す。
	 * ドラフトを更新すると0に戻す。
	 */
	@Column('integer', {
		default: 0,
	})
	public postAttempts: number;
}
