/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * バッファしたリアクションの差分を、ノートへ適用済みのバッチの台帳。
 * 差分の加算と同じトランザクションで記録し、同じバッチを二度適用しないために使う。
 */
@Entity('reaction_bake_ledger')
export class MiReactionBakeLedger {
	@PrimaryColumn({
		type: 'varchar',
		length: 64,
	})
	public batchId: string;

	@Column('timestamp with time zone')
	public appliedAt: Date;
}
