/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryGeneratedColumn } from 'typeorm';
import { id } from './util/id.js';

export const noteOutboxTypes = ['created', 'updated', 'deleted'] as const;
export type NoteOutboxType = typeof noteOutboxTypes[number];

/**
 * ノートの作成・更新・削除の後処理（副作用）のoutbox（pre-rust-tech-debt.md P3-1）。
 *
 * ノートの行の変更と同じトランザクションで記録し、副作用をすべて実行したら削除する。
 * 本文などの内容は持たない。処理するときに、その時点のノートの状態を読み直す。
 * 削除のレコードだけは、行が消えた後でも副作用を実行できるよう、配送先の計算に必要な情報を`payload`に持つ。
 */
@Entity('note_outbox')
@Index('IDX_NOTE_OUTBOX_NOTE_ID_SEQ', ['noteId', 'seq'])
export class MiNoteOutbox {
	/** 記録した順序。同じノートのレコードは、この順に処理する。更新のレコードでは世代としても使う */
	@PrimaryGeneratedColumn('increment', { type: 'bigint' })
	public seq: string;

	@Column('varchar', { length: 16 })
	public type: NoteOutboxType;

	@Column(id())
	public noteId: string;

	@Column(id())
	public userId: string;

	@Column('jsonb', { default: {} })
	public payload: Record<string, unknown>;

	/** 実行を終えた副作用の名前。再試行のときは、ここにない副作用だけを実行する */
	@Column('varchar', { length: 32, array: true, default: '{}' })
	public doneSteps: string[];

	/** 処理を始めた回数。0なら、まだ誰も処理を始めていない */
	@Column('integer', { default: 0 })
	public attempts: number;

	/** 処理中のプロセスが持つ期限。過ぎていれば、ほかのプロセスが処理を引き継げる。nullは誰も処理していない */
	@Column('timestamp with time zone', { nullable: true })
	public lockedUntil: Date | null;

	@Column('timestamp with time zone', { default: () => 'now()' })
	public createdAt: Date;
}
