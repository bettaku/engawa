/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiDriveFolder } from '@/models/DriveFolder.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiUserGroup } from '@/models/UserGroup.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiPage } from '@/models/Page.js';
import type { MiWebhook } from '@/models/Webhook.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiNotification } from '@/models/Notification.js';
import { MiAvatarDecoration, MiChatMessage, MiChatRoom, MiRole, MiRoleAssignment } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { Serialized } from '@/types.js';
import type Emitter from 'strict-event-emitter-types';
import type { EventEmitter } from 'events';

//#region Stream type-body definitions
export interface BroadcastTypes {
	emojiAdded: {
		emoji: Packed<'EmojiDetailed'>;
	};
	emojiUpdated: {
		emojis: Packed<'EmojiDetailed'>[];
	};
	emojiDeleted: {
		emojis: {
			id?: string;
			name: string;
			[other: string]: any;
		}[];
	};
	announcementCreated: {
		announcement: Packed<'Announcement'>;
	};
}

export interface MainEventTypes {
	notification: Packed<'Notification'>;
	mention: Packed<'Note'>;
	reply: Packed<'Note'>;
	renote: Packed<'Note'>;
	follow: Packed<'UserDetailedNotMe'>;
	followed: Packed<'UserLite'>;
	unfollow: Packed<'UserDetailedNotMe'>;
	meUpdated: Packed<'MeDetailed'>;
	pageEvent: {
		pageId: MiPage['id'];
		event: string;
		var: any;
		userId: MiUser['id'];
		user: Packed<'UserDetailed'>;
	};
	urlUploadFinished: {
		marker?: string | null;
		file: Packed<'DriveFile'>;
	};
	readAllNotifications: undefined;
	notificationFlushed: undefined;
	notificationDeleted: MiNotification['id'];
	unreadNotification: Packed<'Notification'>;
	unreadAntenna: MiAntenna;
	newChatMessage: Packed<'ChatMessage'>;
	readAllAnnouncements: undefined;
	myTokenRegenerated: undefined;
	signin: {
		id: MiSignin['id'];
		createdAt: string;
		ip: string;
		headers: Record<string, any>;
		success: boolean;
	};
	registryUpdated: {
		scope?: string[];
		key: string;
		value: any | null;
	};
	driveFileCreated: Packed<'DriveFile'>;
	readAntenna: MiAntenna;
	receiveFollowRequest: Packed<'UserLite'>;
	announcementCreated: {
		announcement: Packed<'Announcement'>;
	};
}

export interface DriveEventTypes {
	fileCreated: Packed<'DriveFile'>;
	fileDeleted: MiDriveFile['id'];
	fileUpdated: Packed<'DriveFile'>;
	folderCreated: Packed<'DriveFolder'>;
	folderDeleted: MiDriveFolder['id'];
	folderUpdated: Packed<'DriveFolder'>;
}

export interface NoteEventTypes {
	pollVoted: {
		choice: number;
		userId: MiUser['id'];
	};
	deleted: {
		deletedAt: Date;
	};
	updated: {
		cw: string | null;
		text: string | null;
		disableRightClick: boolean | null;
		deleteAt: Date | null;
	};
	reacted: {
		reaction: string;
		emoji?: {
			name: string;
			url: string;
		} | null;
		userId: MiUser['id'];
	};
	unreacted: {
		reaction: string;
		userId: MiUser['id'];
	};
}
type NoteStreamEventTypes = {
	[key in keyof NoteEventTypes]: {
		id: MiNote['id'];
		userId: MiNote['userId'];
		visibility: MiNote['visibility'];
		visibleUserIds: MiNote['visibleUserIds'];
		body: NoteEventTypes[key];
	};
};

export interface ChannelEventTypes {
	typing: MiUser['id'];
}

export interface UserListEventTypes {
	userAdded: Packed<'UserLite'>;
	userRemoved: Packed<'UserLite'>;
}

export interface AntennaEventTypes {
	note: MiNote;
}

export interface RoleTimelineEventTypes {
	note: Packed<'Note'>;
}

export interface AdminEventTypes {
	newAbuseUserReport: {
		id: MiAbuseUserReport['id'];
		targetUserId: MiUser['id'],
		reporterId: MiUser['id'],
		comment: string;
	};
}

export interface ChatEventTypes {
	message: Packed<'ChatMessageLite'>;
	deleted: Packed<'ChatMessageLite'>['id'];
	react: {
		reaction: string;
		user?: Packed<'UserLite'>;
		messageId: MiChatMessage['id'];
	};
	unreact: {
		reaction: string;
		user?: Packed<'UserLite'>;
		messageId: MiChatMessage['id'];
	};
}
//#endregion

// 辞書(interface or type)から{ type, body }ユニオンを定義
// https://stackoverflow.com/questions/49311989/can-i-infer-the-type-of-a-value-using-extends-keyof-type
// VS Codeの展開を防止するためにEvents型を定義
type Events<T extends object> = { [K in keyof T]: { type: K; body: T[K]; } };
type EventUnionFromDictionary<
	T extends object,
	U = Events<T>,
> = U[keyof U];

type SerializedAll<T> = {
	[K in keyof T]: Serialized<T[K]>;
};

type UndefinedAsNullAll<T> = {
	[K in keyof T]: T[K] extends undefined ? null : T[K];
};

/**
 * 内部イベントの新しい本文（P2-3）。エンティティを載せず、受信側がDBから読み直す。
 *
 * 第1リリースで受信側が新本文を処理できるようにし、第2リリースで発行側を新本文に切り替えた。
 * 受信側は、第1リリースへの切り戻しや入れ替えの途中に備えて、旧本文（エンティティ全体）も引き続き処理する。
 * 一覧は docs/rust-migration/internal-events.md を参照。
 */
export const INTERNAL_EVENT_REF_VERSION = 2;

/** 行を指す新本文 */
export type InternalEventRef<T extends { id: string }> = { v: typeof INTERNAL_EVENT_REF_VERSION; id: T['id']; };

/** ロールの割り当ての新本文。受信側のキャッシュはユーザーごとなので、ユーザーIDも持つ */
export type RoleAssignmentEventRef = InternalEventRef<MiRoleAssignment> & { userId: MiRoleAssignment['userId']; roleId: MiRoleAssignment['roleId']; };

/** `metaUpdated`の新本文。値は載せず、変わった列の名前だけを持つ */
export type MetaUpdatedEventRef = { v: typeof INTERNAL_EVENT_REF_VERSION; changedKeys: (keyof MiMeta)[]; };

/**
 * 新本文かどうか。受信側は、旧本文（エンティティ全体）と新本文の両方を処理する
 */
export function isInternalEventRef<T>(body: T): body is Extract<T, { v: typeof INTERNAL_EVENT_REF_VERSION }> {
	return typeof body === 'object' && body != null && (body as { v?: unknown }).v === INTERNAL_EVENT_REF_VERSION;
}

/** 新本文を作る */
export function toInternalEventRef<T extends { id: string }>(entity: T): InternalEventRef<T> {
	return { v: INTERNAL_EVENT_REF_VERSION, id: entity.id };
}

export function toRoleAssignmentEventRef(assignment: Pick<MiRoleAssignment, 'id' | 'userId' | 'roleId'>): RoleAssignmentEventRef {
	return { v: INTERNAL_EVENT_REF_VERSION, id: assignment.id, userId: assignment.userId, roleId: assignment.roleId };
}

export function toMetaUpdatedEventRef(before: Partial<MiMeta> | undefined, after: Partial<MiMeta>): MetaUpdatedEventRef {
	const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]) as Set<keyof MiMeta>;
	const changedKeys = before == null
		? [...keys]
		: [...keys].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
	return { v: INTERNAL_EVENT_REF_VERSION, changedKeys };
}

export interface InternalEventTypes {
	userChangeSuspendedState: { id: MiUser['id']; isSuspended: MiUser['isSuspended']; };
	userChangeDeletedState: { id: MiUser['id']; isDeleted: MiUser['isDeleted']; };
	userTokenRegenerated: { id: MiUser['id']; oldToken: string; newToken: string; };
	remoteUserUpdated: { id: MiUser['id']; };
	localUserUpdated: { id: MiUser['id']; };
	follow: { followerId: MiUser['id']; followeeId: MiUser['id']; };
	unfollow: { followerId: MiUser['id']; followeeId: MiUser['id']; };
	blockingCreated: { blockerId: MiUser['id']; blockeeId: MiUser['id']; };
	blockingDeleted: { blockerId: MiUser['id']; blockeeId: MiUser['id']; };
	policiesUpdated: MiRole['policies'];
	roleCreated: MiRole | InternalEventRef<MiRole>;
	roleDeleted: MiRole | InternalEventRef<MiRole>;
	roleUpdated: MiRole | InternalEventRef<MiRole>;
	userRoleAssigned: MiRoleAssignment | RoleAssignmentEventRef;
	userRoleUnassigned: MiRoleAssignment | RoleAssignmentEventRef;
	webhookCreated: MiWebhook | InternalEventRef<MiWebhook>;
	webhookDeleted: MiWebhook | InternalEventRef<MiWebhook>;
	webhookUpdated: MiWebhook | InternalEventRef<MiWebhook>;
	systemWebhookCreated: MiSystemWebhook | InternalEventRef<MiSystemWebhook>;
	systemWebhookDeleted: MiSystemWebhook | InternalEventRef<MiSystemWebhook>;
	systemWebhookUpdated: MiSystemWebhook | InternalEventRef<MiSystemWebhook>;
	antennaCreated: MiAntenna | InternalEventRef<MiAntenna>;
	antennaDeleted: MiAntenna | InternalEventRef<MiAntenna>;
	antennaUpdated: MiAntenna | InternalEventRef<MiAntenna>;
	avatarDecorationCreated: MiAvatarDecoration | InternalEventRef<MiAvatarDecoration>;
	avatarDecorationDeleted: MiAvatarDecoration | InternalEventRef<MiAvatarDecoration>;
	avatarDecorationUpdated: MiAvatarDecoration | InternalEventRef<MiAvatarDecoration>;
	metaUpdated: { before?: MiMeta; after: MiMeta; } | MetaUpdatedEventRef;
	userListMemberAdded: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	userListMemberRemoved: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	/**
	 * キャッシュ`cache`のキー`key`（`null`ならすべて）の値が変わった。受け取ったプロセスはメモリ層から消す。
	 * `origin`は発行したプロセスのID（自分が発行したイベントを見分ける）
	 */
	cacheInvalidated: { cache: string; key: string | null; origin: string; };
}

/**
 * 発行側が書く本文。新本文を持つイベントは新本文だけを発行する（旧本文は受信側の互換のためだけに型に残している）。
 */
export type PublishedInternalEventTypes = {
	[K in keyof InternalEventTypes]: [Extract<InternalEventTypes[K], { v: typeof INTERNAL_EVENT_REF_VERSION }>] extends [never]
		? InternalEventTypes[K]
		: Extract<InternalEventTypes[K], { v: typeof INTERNAL_EVENT_REF_VERSION }>;
};

type EventTypesToEventPayload<T> = EventUnionFromDictionary<UndefinedAsNullAll<SerializedAll<T>>>;

// name/messages(spec) pairs dictionary
export type GlobalEvents = {
	internal: {
		name: 'internal';
		payload: EventTypesToEventPayload<InternalEventTypes>;
	};
	broadcast: {
		name: 'broadcast';
		payload: EventTypesToEventPayload<BroadcastTypes>;
	};
	main: {
		name: `mainStream:${MiUser['id']}`;
		payload: EventTypesToEventPayload<MainEventTypes>;
	};
	drive: {
		name: `driveStream:${MiUser['id']}`;
		payload: EventTypesToEventPayload<DriveEventTypes>;
	};
	note: {
		name: `noteStream:${MiNote['id']}`;
		payload: EventTypesToEventPayload<NoteStreamEventTypes>;
	};
	userList: {
		name: `userListStream:${MiUserList['id']}`;
		payload: EventTypesToEventPayload<UserListEventTypes>;
	};
	roleTimeline: {
		name: `roleTimelineStream:${MiRole['id']}`;
		payload: EventTypesToEventPayload<RoleTimelineEventTypes>;
	};
	antenna: {
		name: `antennaStream:${MiAntenna['id']}`;
		payload: EventTypesToEventPayload<AntennaEventTypes>;
	};
	admin: {
		name: `adminStream:${MiUser['id']}`;
		payload: EventTypesToEventPayload<AdminEventTypes>;
	};
	notes: {
		name: 'notesStream';
		payload: Serialized<Packed<'Note'>>;
	};
	chatUser: {
		name: `chatUserStream:${MiUser['id']}-${MiUser['id']}`;
		payload: EventTypesToEventPayload<ChatEventTypes>;
	};
	chatRoom: {
		name: `chatRoomStream:${MiChatRoom['id']}`;
		payload: EventTypesToEventPayload<ChatEventTypes>;
	};
};

// API event definitions
// ストリームごとのEmitterの辞書を用意
type EventEmitterDictionary = { [x in keyof GlobalEvents]: Emitter.default<EventEmitter, { [y in GlobalEvents[x]['name']]: (e: GlobalEvents[x]['payload']) => void }> };
// 共用体型を交差型にする型 https://stackoverflow.com/questions/54938141/typescript-convert-union-to-intersection
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;
// Emitter辞書から共用体型を作り、UnionToIntersectionで交差型にする
export type StreamEventEmitter = UnionToIntersection<EventEmitterDictionary[keyof GlobalEvents]>;
// { [y in name]: (e: spec) => void }をまとめてその交差型をEmitterにかけるとts(2590)にひっかかる

// provide stream channels union
export type StreamChannels = GlobalEvents[keyof GlobalEvents]['name'];

@Injectable()
export class GlobalEventService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redisForPub)
		private redisForPub: Redis.Redis,
	) {
	}

	@bindThis
	private publish(channel: StreamChannels, type: string | null, value?: any): Promise<number> {
		const message = type == null ? value : value == null ?
			{ type: type, body: null } :
			{ type: type, body: value };

		return this.redisForPub.publish(this.config.host, JSON.stringify({
			channel: channel,
			message: message,
		}));
	}

	@bindThis
	public publishInternalEvent<K extends keyof PublishedInternalEventTypes>(type: K, value?: PublishedInternalEventTypes[K]): void {
		this.publish('internal', type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public publishBroadcastStream<K extends keyof BroadcastTypes>(type: K, value?: BroadcastTypes[K]): void {
		this.publish('broadcast', type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public publishMainStream<K extends keyof MainEventTypes>(userId: MiUser['id'], type: K, value?: MainEventTypes[K]): void {
		this.publish(`mainStream:${userId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public publishDriveStream<K extends keyof DriveEventTypes>(userId: MiUser['id'], type: K, value?: DriveEventTypes[K]): void {
		this.publish(`driveStream:${userId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	/** Redisが受け付けるまで待てるように、Promiseを返す（outboxの副作用で失敗を検知するため） */
	public async publishNoteStream<K extends keyof NoteEventTypes>(note: MiNote, type: K, value?: NoteEventTypes[K]): Promise<void> {
		await this.publish(`noteStream:${note.id}`, type, {
			id: note.id,
			userId: note.userId,
			visibility: note.visibility,
			visibleUserIds: note.visibleUserIds,
			body: value,
		});
	}

	@bindThis
	public publishUserListStream<K extends keyof UserListEventTypes>(listId: MiUserList['id'], type: K, value?: UserListEventTypes[K]): void {
		this.publish(`userListStream:${listId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public publishAntennaStream<K extends keyof AntennaEventTypes>(antennaId: MiAntenna['id'], type: K, value?: AntennaEventTypes[K]): void {
		this.publish(`antennaStream:${antennaId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public publishRoleTimelineStream<K extends keyof RoleTimelineEventTypes>(roleId: MiRole['id'], type: K, value?: RoleTimelineEventTypes[K]): void {
		this.publish(`roleTimelineStream:${roleId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	/** Redisが受け付けるまで待てるように、Promiseを返す（outboxの副作用で失敗を検知するため） */
	public async publishNotesStream(note: Packed<'Note'>): Promise<void> {
		await this.publish('notesStream', null, note);
	}

	@bindThis
	public publishAdminStream<K extends keyof AdminEventTypes>(userId: MiUser['id'], type: K, value?: AdminEventTypes[K]): void {
		this.publish(`adminStream:${userId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public publishChatUserStream<K extends keyof ChatEventTypes>(fromUserId: MiUser['id'], toUserId: MiUser['id'], type: K, value?: ChatEventTypes[K]): void {
		this.publish(`chatUserStream:${fromUserId}-${toUserId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public publishChatRoomStream<K extends keyof ChatEventTypes>(toRoomId: MiChatRoom['id'], type: K, value?: ChatEventTypes[K]): void {
		this.publish(`chatRoomStream:${toRoomId}`, type, typeof value === 'undefined' ? null : value);
	}
}
