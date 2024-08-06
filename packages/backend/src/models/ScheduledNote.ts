/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiNote } from './Note.js';

@Entity('scheduled_note')
export class MiScheduledNote {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The ID of the note.',
	})
	public noteId: MiNote['id'];

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@Column('timestamp with time zone', {
		comment: 'The time when the note will be published.',
	})
	public scheduledAt: Date;

	@ManyToOne(() => MiNote, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public note: MiNote;

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	public user: MiUser;
}
