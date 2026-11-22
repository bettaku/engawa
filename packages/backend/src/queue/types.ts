/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Antenna } from '@/server/api/endpoints/i/import-antennas.js';
import type { MiChatMessage } from '@/models/ChatMessage.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiSignin } from '@/models/Signin.js';
import type { SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { UserWebhookPayload } from '@/core/UserWebhookService.js';
import type httpSignature from '@peertube/http-signature';

/*
 * ジョブpayloadの形（pre-rust-tech-debt.md P2-4）
 *
 * - すべてのジョブpayloadは版`v`を持つ。生成側は`v: 1`（形を変えた種別は、切り替えた後の版）を書く。
 * - 処理側は、`v`がないジョブを`v: 1`とみなし、知らない版は再試行しない失敗にする（job-version.ts）。
 * - 形を変える種別は、処理側が新旧両方の版を受け付けるリリースを先に出し、生成側を切り替えるのはその後にする。
 *   旧版のジョブがなくなったことを確認してから、旧版の処理を削除する。
 *
 * 一覧は docs/rust-migration/queue-jobs.md にまとめている。
 */

/** 形を変えていない種別のpayloadの版 */
export type JobDataV1 = {
	/** payloadの版。古いジョブにはない（1とみなす） */
	v?: 1;
};

export type DeliverJobData = JobDataV1 & {
	/** Actor */
	user: ThinUser;
	/** Activity */
	content: string;
	/** Digest header */
	digest: string;
	/** inbox URL to deliver */
	to: string;
	/** whether it is sharedInbox */
	isSharedInbox: boolean;
};

export type InboxJobData = InboxJobDataV1 | InboxJobDataV2;

/** 旧形式。`@peertube/http-signature`の解析結果をそのまま持つ */
export type InboxJobDataV1 = JobDataV1 & {
	activity: IActivity;
	signature: httpSignature.IParsedSignature;
};

/**
 * 新形式。外部ライブラリの型に依存しない、署名の検証に必要な材料だけを持つ。
 *
 * 検証の担当（v1と同じ）:
 * - digestの検証: 受信時（ActivityPubServerService）。ここに入るのは検証済みのdigestである
 * - 署名の暗号的な検証: worker（InboxProcessorService）。`signingString`・`algorithm`・`signature`と、`keyId`で引いた公開鍵で検証する
 */
export type InboxJobDataV2 = {
	v: 2;
	/** 本文（JSONとして解析したもの） */
	activity: IActivity;
	signature: {
		/** `keyId`パラメータ */
		keyId: string;
		/** `algorithm`パラメータ（小文字にしたもの。`httpSignature.parseRequest`の`params.algorithm`と同じ） */
		algorithm: string;
		/** 署名対象のヘッダー名の一覧（小文字。`(request-target)`などの擬似ヘッダーを含む） */
		headers: string[];
		/** 署名値（base64） */
		signature: string;
		/** 署名対象の文字列（受信時に組み立てたもの） */
		signingString: string;
	};
	request: {
		/** 生のHTTPメソッド */
		method: string;
		/** 生のrequest-target（パスとクエリ） */
		target: string;
		/** `digest`ヘッダー（受信時に検証済み） */
		digest: string | null;
	};
};

export type RelationshipJobData = JobDataV1 & {
	from: ThinUser;
	to: ThinUser;
	silent?: boolean;
	requestId?: string;
	withReplies?: boolean;
};

export type DbJobData<T extends keyof DbJobMap> = DbJobMap[T];

export type DbJobMap = {
	deleteDriveFiles: DbJobDataWithUser;
	exportCustomEmojis: DbJobDataWithUser;
	exportAntennas: DBExportAntennasData;
	exportNotes: DbJobDataWithUser;
	exportClips: DbJobDataWithUser;
	exportFavorites: DbJobDataWithUser;
	exportFollowing: DbExportFollowingData;
	exportMuting: DbJobDataWithUser;
	exportBlocking: DbJobDataWithUser;
	exportUserLists: DbJobDataWithUser;
	importAntennas: DBAntennaImportJobData;
	importFollowing: DbUserImportJobData;
	importFollowingToDb: DbUserImportToDbJobData;
	importMuting: DbUserImportJobData;
	importBlocking: DbUserImportJobData;
	importBlockingToDb: DbUserImportToDbJobData;
	importUserLists: DbUserImportJobData;
	importCustomEmojis: DbUserImportJobData;
	deleteAccount: DbUserDeleteJobData;
	truncateAccount: DbUserTruncateJobData;
	autoDeleteUserNotes: DbJobDataWithUser;
	syncNoteIndex: DbSyncNoteIndexJobData;
	processNoteOutbox: DbProcessNoteOutboxJobData;
	unreadNotification: DbUnreadNotificationJobData;
	unreadChatMessage: DbUnreadChatMessageJobData;
	signinNotification: DbSigninNotificationJobData;
};

/**
 * 通知を作ってから一定時間後に、まだ既読になっていなければ「未読の通知がある」ことを知らせる（P3-2）。
 * 通知の内容はRedisのStream（`notificationTimeline:<userId>`）にあり、payloadには持たせない
 */
export type DbUnreadNotificationJobData = JobDataV1 & {
	userId: MiUser['id'];
	/** 通知のStream ID */
	streamId: string;
};

/** チャットのメッセージを送ってから一定時間後に、まだ既読になっていない受信者に知らせる（P3-2）。内容はDBから読み直す */
export type DbUnreadChatMessageJobData = JobDataV1 & {
	messageId: MiChatMessage['id'];
};

/** サインインの記録（`signin`テーブル）を作った後の、通知・ストリーム・メールの送信（P3-2）。内容はDBから読み直す */
export type DbSigninNotificationJobData = JobDataV1 & {
	signinId: MiSignin['id'];
};

/** ノートの後処理のoutboxのレコード（P3-1）。内容はDBのレコードにあり、payloadには持たせない */
export type DbProcessNoteOutboxJobData = JobDataV1 & {
	seq: string;
};

export type DbSyncNoteIndexJobData = JobDataV1 & {
	noteId: MiNote['id'];
};

export type DbJobDataWithUser = JobDataV1 & {
	user: ThinUser;
};

export type DbExportFollowingData = JobDataV1 & {
	user: ThinUser;
	excludeMuting: boolean;
	excludeInactive: boolean;
};

export type DBExportAntennasData = JobDataV1 & {
	user: ThinUser
};

export type DbUserDeleteJobData = JobDataV1 & {
	user: ThinUser;
	soft?: boolean;
};

export type DbUserTruncateJobData = JobDataV1 & {
	user: ThinUser;
};

export type DbUserImportJobData = JobDataV1 & {
	user: ThinUser;
	fileId: MiDriveFile['id'];
	withReplies?: boolean;
};

export type DBAntennaImportJobData = DBAntennaImportJobDataV1 | DBAntennaImportJobDataV2;

/** 旧形式。利用者がアップロードしたアンテナの定義をそのまま持つ */
export type DBAntennaImportJobDataV1 = JobDataV1 & {
	user: ThinUser,
	antenna: Antenna
};

/** 新形式。ファイルのIDだけを持ち、中身は処理時にドライブから読む */
export type DBAntennaImportJobDataV2 = {
	v: 2;
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbUserImportToDbJobData = JobDataV1 & {
	user: ThinUser;
	target: string;
	withReplies?: boolean;
};

export type ObjectStorageJobData = ObjectStorageFileJobData | JobDataV1;

export type ObjectStorageFileJobData = JobDataV1 & {
	key: string;
};

export type EndedPollNotificationJobData = JobDataV1 & {
	noteId: MiNote['id'];
};

export type PostScheduledNoteJobData = JobDataV1 & {
	noteDraftId: string;
};

export type SystemWebhookDeliverJobData<T extends SystemWebhookEventType = SystemWebhookEventType> =
	SystemWebhookDeliverJobDataV1<T> | SystemWebhookDeliverJobDataV2<T>;

/** 旧形式。送信先と`secret`を平文で持つ。テスト送信（WebhookTestService）は、保存前の値で送るためこの形式を使う */
export type SystemWebhookDeliverJobDataV1<T extends SystemWebhookEventType = SystemWebhookEventType> = JobDataV1 & {
	type: T;
	content: SystemWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
};

/** 新形式。送信先と`secret`は、処理時にDBから読む。webhookが削除・無効化されていれば送らない */
export type SystemWebhookDeliverJobDataV2<T extends SystemWebhookEventType = SystemWebhookEventType> = {
	v: 2;
	type: T;
	content: SystemWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	createdAt: number;
	eventId: string;
};

export type UserWebhookDeliverJobData<T extends WebhookEventTypes = WebhookEventTypes> =
	UserWebhookDeliverJobDataV1<T> | UserWebhookDeliverJobDataV2<T>;

/** 旧形式。送信先と`secret`を平文で持つ。テスト送信（WebhookTestService）は、保存前の値で送るためこの形式を使う */
export type UserWebhookDeliverJobDataV1<T extends WebhookEventTypes = WebhookEventTypes> = JobDataV1 & {
	type: T;
	content: UserWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	userId: MiUser['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
};

/** 新形式。送信先と`secret`は、処理時にDBから読む。webhookが削除・無効化されているか、所有者が異なれば送らない */
export type UserWebhookDeliverJobDataV2<T extends WebhookEventTypes = WebhookEventTypes> = {
	v: 2;
	type: T;
	content: UserWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	userId: MiUser['id'];
	createdAt: number;
	eventId: string;
};

export type ThinUser = {
	id: MiUser['id'];
};

export type ScheduledNoteDeleteJobData = JobDataV1 & {
	noteId: MiNote['id'];
};
