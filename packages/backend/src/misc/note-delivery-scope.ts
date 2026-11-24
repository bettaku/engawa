/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type NoteDeliveryScope = {
	/** 連合に配送してよいか（falseなら他の項目もすべてfalse） */
	federate: boolean;
	/** リモートのフォロワーに配送するか */
	followers: boolean;
	/** リレーに配送するか */
	relays: boolean;
};

/**
 * ノートの公開範囲から、ActivityPubでの配送先の範囲を決める。
 * 作成・編集・アンケートの更新のどれも、必ずこの結果に従って配送する。
 *
 * - private / localOnly: 外部には配送しない
 * - specified: 宛先に指定された（メンションされた）利用者だけ
 * - followers: フォロワーと、宛先に指定された利用者
 * - home: フォロワーと、宛先に指定された利用者
 * - public: 上記に加えてリレー
 */
export function getNoteDeliveryScope(note: { visibility: string; localOnly?: boolean | null }): NoteDeliveryScope {
	if (note.localOnly || note.visibility === 'private') {
		return { federate: false, followers: false, relays: false };
	}

	switch (note.visibility) {
		case 'public':
			return { federate: true, followers: true, relays: true };
		case 'home':
		case 'followers':
			return { federate: true, followers: true, relays: false };
		case 'specified':
			return { federate: true, followers: false, relays: false };
		default:
			// 未知の公開範囲は配送しない
			return { federate: false, followers: false, relays: false };
	}
}
