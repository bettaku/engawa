/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('chat_room')
export class MiChatRoom {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Index()
	@Column({
		...id(),
	})
	public ownerId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public owner: MiUser | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public description: string;

	@Column('boolean', {
		default: false,
	})
	public isArchived: boolean;

	@Index({ unique: true })
	@Column('varchar', {
		length: 512, nullable: true,
		comment: 'The federation URI of the room. it will be null when the room is local.',
	})
	public uri: string | null;

	@Index()
	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized] The host of the room. it will be null when the room is local.',
	})
	public host: string | null;
}
