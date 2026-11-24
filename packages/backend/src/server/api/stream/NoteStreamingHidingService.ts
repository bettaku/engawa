/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { deepClone } from '@/misc/clone.js';
import { isRenotePacked, isQuotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/User.js';

type NodePath = ('renote' | 'reply')[];

/** 展開されたノートを辿る深さの上限 */
const MAX_DEPTH = 8;

/** Streamにおいて、ノートを隠す（hideNote）を適用するためのService */
@Injectable()
export class NoteStreamingHidingService {
	constructor(
		private noteEntityService: NoteEntityService,
	) {}

	/**
	 * ノートと、その中に展開されている返信先・リノート元をすべて辿る。
	 * 返信とリノートが交互に入れ子になっていても、展開されているノードは漏れなく対象にする。
	 */
	private collectNodes(note: Packed<'Note'>): { node: Packed<'Note'>; path: NodePath; }[] {
		const nodes: { node: Packed<'Note'>; path: NodePath; }[] = [];

		const walk = (node: Packed<'Note'>, path: NodePath) => {
			nodes.push({ node, path });
			if (path.length >= MAX_DEPTH) return;
			if (node.renote != null) walk(node.renote, [...path, 'renote']);
			if (node.reply != null) walk(node.reply, [...path, 'reply']);
		};
		walk(note, []);

		return nodes;
	}

	/**
	 * ストリーミング配信用にノートの内容を隠す（あるいはそもそも送信しない）判定及び処理を行う。
	 *
	 * 隠す処理が必要な場合は元のノートをクローンして変更を適用したものを返し、
	 * 送信すべきでない場合は `null` を返す。
	 * 変更が不要な場合は元のノートの参照をそのまま返す。
	 *
	 * @param note - 処理対象のノート
	 * @param meId - 閲覧者のユーザー ID （未ログインの場合は `null`）
	 * @returns 配信するノートオブジェクト、または配信スキップの場合は `null`
	 */
	@bindThis
	public async filter(note: Packed<'Note'>, meId: MiUser['id'] | null): Promise<Packed<'Note'> | null> {
		const nodes = this.collectNodes(note);
		const shouldHide = await Promise.all(nodes.map(n => this.noteEntityService.shouldHideNote(n.node, meId)));

		if (!shouldHide.some(h => h)) {
			// 隠す必要がない場合は元のノートをそのまま返す
			return note;
		}

		// リノートだけを辿った連鎖の中に隠すべきノートがあり、かつ純粋リノートが含まれる場合は配信をスキップする
		const renoteChain = nodes.filter(n => n.path.every(p => p === 'renote'));
		if (renoteChain.some(n => shouldHide[nodes.indexOf(n)]) && renoteChain.some(n => isRenotePacked(n.node) && !isQuotePacked(n.node))) {
			return null;
		}

		const clonedNote = deepClone(note);

		for (let i = 0; i < nodes.length; i++) {
			let target: Packed<'Note'> | null | undefined = clonedNote;
			for (const key of nodes[i].path) {
				target = target?.[key];
			}
			if (target == null) continue;

			if (shouldHide[i]) {
				this.noteEntityService.hideNote(target);
			}

			// 辿る深さの上限に達したノードの先は検査していないので、配信しない
			if (nodes[i].path.length >= MAX_DEPTH) {
				target.renote = undefined;
				target.reply = undefined;
			}
		}

		return clonedNote;
	}
}
