/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { ReplyError } from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiNotification } from '@/models/Notification.js';
import { bindThis } from '@/decorators.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { NotificationEntityService } from '@/core/entities/NotificationEntityService.js';
import { IdService } from '@/core/IdService.js';
import { CacheService } from '@/core/CacheService.js';
import type { Config } from '@/config.js';
import { UserListService } from '@/core/UserListService.js';
import { QueueService } from '@/core/QueueService.js';
import { FilterUnionByProperty, groupedNotificationTypes, obsoleteNotificationTypes } from '@/types.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { compareRedisStreamId, parseRedisStreamId, redisStreamIdFromParsedId } from '@/misc/redis-stream-id.js';

@Injectable()
export class NotificationService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private notificationEntityService: NotificationEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private pushNotificationService: PushNotificationService,
		private cacheService: CacheService,
		private userListService: UserListService,
		private queueService: QueueService,
	) {
	}

	@bindThis
	public async readAllNotification(
		userId: MiUser['id'],
		force = false,
	) {
		const latestReadNotificationId = await this.redisClient.get(`latestReadNotification:${userId}`);

		const latestNotificationIdsRes = await this.redisClient.xrevrange(
			`notificationTimeline:${userId}`,
			'+',
			'-',
			'COUNT', 1);
		const latestNotificationId = latestNotificationIdsRes[0]?.[0];

		if (latestNotificationId == null) return;

		this.redisClient.set(`latestReadNotification:${userId}`, latestNotificationId);

		if (force || !this.isReadUpTo(latestReadNotificationId, latestNotificationId)) {
			return this.postReadAllNotifications(userId);
		}
	}

	@bindThis
	private postReadAllNotifications(userId: MiUser['id']) {
		this.globalEventService.publishMainStream(userId, 'readAllNotifications');
		this.pushNotificationService.pushNotification(userId, 'readAllNotifications', undefined);
	}

	@bindThis
	public createNotification<T extends MiNotification['type']>(
		notifieeId: MiUser['id'],
		type: T,
		data: Omit<FilterUnionByProperty<MiNotification, 'type', T>, 'type' | 'id' | 'createdAt' | 'notifierId'>,
		notifierId?: MiUser['id'] | null,
	) {
		trackPromise(
			this.#createNotificationInternal(notifieeId, type, data, notifierId),
		);
	}

	async #createNotificationInternal<T extends MiNotification['type']>(
		notifieeId: MiUser['id'],
		type: T,
		data: Omit<FilterUnionByProperty<MiNotification, 'type', T>, 'type' | 'id' | 'createdAt' | 'notifierId'>,
		notifierId?: MiUser['id'] | null,
	): Promise<MiNotification | null> {
		const profile = await this.cacheService.userProfileCache.fetch(notifieeId);

		// 古いMisskeyバージョンのキャッシュが残っている可能性がある
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const recieveConfig = (profile.notificationRecieveConfig ?? {})[type];
		if (recieveConfig?.type === 'never') {
			return null;
		}

		if (notifierId) {
			if (notifieeId === notifierId) {
				return null;
			}

			const mutings = await this.cacheService.userMutingsCache.fetch(notifieeId);
			if (mutings.has(notifierId)) {
				return null;
			}

			if (recieveConfig?.type === 'following') {
				const isFollowing = await this.cacheService.userFollowingsCache.fetch(notifieeId).then(followings => Object.hasOwn(followings, notifierId));
				if (!isFollowing) {
					return null;
				}
			} else if (recieveConfig?.type === 'follower') {
				const isFollower = await this.cacheService.userFollowingsCache.fetch(notifierId).then(followings => Object.hasOwn(followings, notifieeId));
				if (!isFollower) {
					return null;
				}
			} else if (recieveConfig?.type === 'mutualFollow') {
				const [isFollowing, isFollower] = await Promise.all([
					this.cacheService.userFollowingsCache.fetch(notifieeId).then(followings => Object.hasOwn(followings, notifierId)),
					this.cacheService.userFollowingsCache.fetch(notifierId).then(followings => Object.hasOwn(followings, notifieeId)),
				]);
				if (!(isFollowing && isFollower)) {
					return null;
				}
			} else if (recieveConfig?.type === 'followingOrFollower') {
				const [isFollowing, isFollower] = await Promise.all([
					this.cacheService.userFollowingsCache.fetch(notifieeId).then(followings => Object.hasOwn(followings, notifierId)),
					this.cacheService.userFollowingsCache.fetch(notifierId).then(followings => Object.hasOwn(followings, notifieeId)),
				]);
				if (!isFollowing && !isFollower) {
					return null;
				}
			} else if (recieveConfig?.type === 'list') {
				const isMember = await this.userListService.membersCache.fetch(recieveConfig.userListId).then(members => members.has(notifierId));
				if (!isMember) {
					return null;
				}
			}
		}

		const createdAt = new Date();
		let notification: FilterUnionByProperty<MiNotification, 'type', T>;
		let redisId: string;

		do {
			notification = {
				id: this.idService.gen(),
				createdAt,
				type: type,
				...(notifierId ? {
					notifierId,
				} : {}),
				...data,
			} as unknown as FilterUnionByProperty<MiNotification, 'type', T>;

			try {
				redisId = (await this.redisClient.xadd(
					`notificationTimeline:${notifieeId}`,
					'MAXLEN', '~', this.config.perUserNotificationsMaxCount.toString(),
					this.toXListId(notification.id),
					'data', JSON.stringify(notification)))!;
			} catch (e) {
				// The ID specified in XADD is equal or smaller than the target stream top item で失敗することがあるのでリトライ
				if (e instanceof ReplyError) continue;
				throw e;
			}

			break;
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		} while (true);

		const packed = await this.notificationEntityService.pack(notification, notifieeId, {});

		if (packed == null) return null;

		// Publish notification event
		this.globalEventService.publishMainStream(notifieeId, 'notification', packed);

		// 2秒経っても(今回作成した)通知が既読にならなかったら「未読の通知がありますよ」イベントを発行する
		// テスト通知の場合は即時発行
		// プロセスの停止で失われないよう、ジョブにする（P3-2）
		const delay = notification.type === 'test' ? 0 : 2000;
		await this.queueService.createUnreadNotificationJob(notifieeId, redisId, delay);

		return notification;
	}

	/**
	 * 通知を作ってから一定時間たっても既読になっていなければ、「未読の通知がある」イベントとPush通知を送る（`unreadNotification`ジョブ）。
	 *
	 * 通知はStreamから読み直してpackする。Streamから消えた通知（全削除・件数の上限）や、packできなくなった通知（ノートの削除など）は送らない。
	 */
	@bindThis
	public async processUnreadNotification(userId: MiUser['id'], streamId: string): Promise<string> {
		const latestReadNotificationId = await this.redisClient.get(`latestReadNotification:${userId}`);
		if (this.isReadUpTo(latestReadNotificationId, streamId)) return 'skip: already read';

		const entries = await this.redisClient.xrange(`notificationTimeline:${userId}`, streamId, streamId);
		if (entries.length === 0) return 'skip: notification not found';
		const notification = JSON.parse(entries[0][1][1]) as MiNotification;

		const packed = await this.notificationEntityService.pack(notification, userId, {});
		if (packed == null) return 'skip: notification is no longer available';

		this.globalEventService.publishMainStream(userId, 'unreadNotification', packed);
		this.pushNotificationService.pushNotification(userId, 'notification', packed);

		if (notification.type === 'follow') this.emailNotificationFollow(userId, await this.usersRepository.findOneByOrFail({ id: notification.notifierId }));
		if (notification.type === 'receiveFollowRequest') this.emailNotificationReceiveFollowRequest(userId, await this.usersRepository.findOneByOrFail({ id: notification.notifierId }));

		return 'ok';
	}

	// TODO
	//const locales = await import('../../../../locales/index.js');

	// TODO: locale ファイルをクライアント用とサーバー用で分けたい

	@bindThis
	private async emailNotificationFollow(userId: MiUser['id'], follower: MiUser) {
		/*
		const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
		if (!userProfile.email || !userProfile.emailNotificationTypes.includes('follow')) return;
		const locale = locales[userProfile.lang ?? 'ja-JP'];
		const i18n = new I18n(locale);
		// TODO: render user information html
		sendEmail(userProfile.email, i18n.t('_email._follow.title'), `${follower.name} (@${Acct.toString(follower)})`, `${follower.name} (@${Acct.toString(follower)})`);
		*/
	}

	@bindThis
	private async emailNotificationReceiveFollowRequest(userId: MiUser['id'], follower: MiUser) {
		/*
		const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
		if (!userProfile.email || !userProfile.emailNotificationTypes.includes('receiveFollowRequest')) return;
		const locale = locales[userProfile.lang ?? 'ja-JP'];
		const i18n = new I18n(locale);
		// TODO: render user information html
		sendEmail(userProfile.email, i18n.t('_email._receiveFollowRequest.title'), `${follower.name} (@${Acct.toString(follower)})`, `${follower.name} (@${Acct.toString(follower)})`);
		*/
	}

	@bindThis
	public async flushAllNotifications(userId: MiUser['id']) {
		await Promise.all([
			this.redisClient.del(`notificationTimeline:${userId}`),
			this.redisClient.del(`latestReadNotification:${userId}`),
		]);
		this.globalEventService.publishMainStream(userId, 'notificationFlushed');
	}

	async #getNotifications(userId: MiUser['id'], notificationId: MiNotification['id']) {
		const notificationRes = await this.redisClient.xrange(
			`notificationTimeline:${userId}`,
			`${this.idService.parse(notificationId).date.getTime() - 1000}-0`,
			`${this.idService.parse(notificationId).date.getTime() + 1000}-9999 `,
			'COUNT', 50
		);
		return notificationRes.find(x => JSON.parse(x[1][1]).id === notificationId);
	}

	@bindThis
	public async deleteNotification(userId: MiUser['id'], notificationId: MiNotification['id']) : Promise<MiNotification['id'] | void> {
		const targetResId = (await this.#getNotifications(userId, notificationId))?.[0];
		if (!targetResId) return;

		await this.redisClient.xdel(`notificationTimeline:${userId}`, targetResId);
		this.globalEventService.publishMainStream(userId, 'notificationDeleted', notificationId);
		return notificationId;
	}

	@bindThis
	public async deleteUserGroupInvitation(userId: MiUser['id'], invitationId: string) {
		const streamKey = `notificationTimeline:${userId}`;
		const entries = await this.redisClient.xrange(streamKey, '-', '+');

		for (const [entryId, fields] of entries) {
			const dataIndex = fields.indexOf('data');
			if (dataIndex !== -1) {
				try {
					const data = JSON.parse(fields[dataIndex + 1]);

					if (data.userGroupInvitationId === invitationId) {
						await this.redisClient.xdel(streamKey, entryId);
						break;
					}
				} catch (e) {
					console.error('(UserGroupInvitationNotification) JSON Parsing Error:', e);
				}
			} else console.log('(UserGroupInvitationNotification) Data field not found in fields:', fields);
		}
	}

	private toXListId(id: string): string {
		return redisStreamIdFromParsedId(this.idService.parseFull(id));
	}

	/**
	 * 既読位置 `latestReadId` が、通知の Stream ID `notificationId` 以降に達しているか。
	 * Stream ID は数値として比較する（文字列で比べると、同じミリ秒で seq の桁数が違うときに誤る）。
	 * 既読位置がない、または解析できない場合は未読として扱う。
	 */
	@bindThis
	private isReadUpTo(latestReadId: string | null, notificationId: string): boolean {
		if (latestReadId == null) return false;
		const latestRead = parseRedisStreamId(latestReadId);
		const target = parseRedisStreamId(notificationId);
		if (latestRead == null || target == null) return false;
		return compareRedisStreamId(latestRead, target) >= 0;
	}

	@bindThis
	public async getNotifications(
		userId: MiUser['id'],
		{
			sinceId,
			untilId,
			limit = 20,
			includeTypes,
			excludeTypes,
		}: {
			sinceId?: string,
			untilId?: string,
			limit?: number,
			// any extra types are allowed, those are no-op
			includeTypes?: (MiNotification['type'] | string)[],
			excludeTypes?: (MiNotification['type'] | string)[],
		},
	): Promise<MiNotification[]> {
		let sinceTime = sinceId ? this.toXListId(sinceId) : null;
		let untilTime = untilId ? this.toXListId(untilId) : null;

		let notifications: MiNotification[];
		for (;;) {
			let notificationsRes: [id: string, fields: string[]][];

			// sinceidのみの場合は古い順、そうでない場合は新しい順。 QueryService.makePaginationQueryも参照
			if (sinceTime && !untilTime) {
				notificationsRes = await this.redisClient.xrange(
					`notificationTimeline:${userId}`,
					'(' + sinceTime,
					'+',
					'COUNT', limit);
			} else {
				notificationsRes = await this.redisClient.xrevrange(
					`notificationTimeline:${userId}`,
					untilTime ? '(' + untilTime : '+',
					sinceTime ? '(' + sinceTime : '-',
					'COUNT', limit);
			}

			if (notificationsRes.length === 0) {
				return [];
			}

			notifications = notificationsRes.map(x => JSON.parse(x[1][1])) as MiNotification[];

			if (includeTypes && includeTypes.length > 0) {
				notifications = notifications.filter(notification => includeTypes.includes(notification.type));
			} else if (excludeTypes && excludeTypes.length > 0) {
				notifications = notifications.filter(notification => !excludeTypes.includes(notification.type));
			}

			if (notifications.length !== 0) {
				// 通知が１件以上ある場合は返す
				break;
			}

			// フィルタしたことで通知が0件になった場合、次のページを取得する
			if (sinceId && !untilId) {
				sinceTime = notificationsRes[notificationsRes.length - 1][0];
			} else {
				untilTime = notificationsRes[notificationsRes.length - 1][0];
			}
		}

		return notifications;
	}
}
