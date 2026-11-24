/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { isInstanceMuted, isUserFromMutedInstance } from '@/misc/is-instance-muted.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';

/** mainStreamのイベントのうち、read:account に加えて必要な権限 */
const MAIN_EVENT_PERMISSIONS: Record<string, string | undefined> = {
	notification: 'read:notifications',
	unreadNotification: 'read:notifications',
	readAllNotifications: 'read:notifications',
	notificationFlushed: 'read:notifications',
	notificationDeleted: 'read:notifications',
	newChatMessage: 'read:chat',
};

@Injectable({ scope: Scope.TRANSIENT })
export class MainChannel extends Channel {
	public readonly chName = 'main';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private noteEntityService: NoteEntityService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;

		this.subscriber.on(`mainStream:${this.user.id}`, async data => {
			// アクセストークンでの接続には、イベントごとに対応する権限を要求する
			if (!this.hasPermissionForEvent(data.type)) return;

			switch (data.type) {
				case 'notification': {
					// Ignore notifications from instances the user has muted
					if (isUserFromMutedInstance(data.body, new Set<string>(this.userProfile?.mutedInstances ?? []))) return;
					if (data.body.userId && this.userIdsWhoMeMuting.has(data.body.userId)) return;

					if (data.body.note && data.body.note.isHidden) {
						const note = await this.noteEntityService.pack(data.body.note.id, this.user, {
							detail: true,
						});
						data.body.note = note;
					}
					break;
				}
				case 'mention': {
					if (isInstanceMuted(data.body, new Set<string>(this.userProfile?.mutedInstances ?? []))) return;
					if (!this.isNoteVisibleForMe(data.body)) return;
					if (this.isNoteMutedOrBlocked(data.body)) return;
					if (data.body.isHidden) {
						const note = await this.noteEntityService.pack(data.body.id, this.user, {
							detail: true,
						});
						data.body = note;
					}
					break;
				}
			}

			this.send(data.type, data.body);
		});

		return true;
	}

	/**
	 * このチャンネルは read:account で接続できるが、流れるイベントには通知やチャットの内容も含まれる。
	 * アクセストークンでの接続では、追加の権限が必要なイベントをその権限を持つ場合にだけ配信する。
	 */
	@bindThis
	private hasPermissionForEvent(type: string): boolean {
		const token = this.connection.token;
		if (token == null) return true; // ネイティブ認証

		const required = MAIN_EVENT_PERMISSIONS[type];
		if (required == null) return true;
		return token.permission.includes(required);
	}
}
