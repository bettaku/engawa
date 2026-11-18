/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { MiUser, type WebhooksRepository } from '@/models/_.js';
import { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ReloadableList, replaceById } from '@/misc/reloadable-list.js';
import { GlobalEvents, isInternalEventRef } from '@/core/GlobalEventService.js';
import type { Packed } from '@/misc/json-schema.js';
import { QueueService } from '@/core/QueueService.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import { onRedisReconnected } from '@/misc/redis-reconnected.js';

export type UserWebhookPayload<T extends WebhookEventTypes> =
	T extends 'note' | 'reply' | 'renote' | 'mention' ? {
		note: Packed<'Note'>,
	} :
	T extends 'follow' | 'unfollow' ? {
		user: Packed<'UserDetailedNotMe'>,
	} :
	T extends 'followed' ? {
		user: Packed<'UserLite'>,
	} : never;

@Injectable()
export class UserWebhookService implements OnApplicationShutdown {
	private readonly offRedisReconnected: () => void;
	private readonly activeWebhooks: ReloadableList<MiWebhook>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,
		@Inject(DI.webhooksRepository)
		private webhooksRepository: WebhooksRepository,
		private queueService: QueueService,
		loggerService: LoggerService,
	) {
		const logger = loggerService.getLogger('user-webhook');
		this.activeWebhooks = new ReloadableList(
			() => this.webhooksRepository.findBy({ active: true }),
			{ onError: err => logger.error('Failed to load active webhooks', { e: err }) },
		);
		this.redisForSub.on('message', this.onMessage);
		this.offRedisReconnected = onRedisReconnected(this.redisForSub, this.onRedisReconnected);
	}

	@bindThis
	public async getActiveWebhooks() {
		return await this.activeWebhooks.get();
	}

	/**
	 * UserWebhook の一覧を取得する.
	 */
	@bindThis
	public fetchWebhooks(params?: {
		ids?: MiWebhook['id'][];
		isActive?: MiWebhook['active'];
		on?: MiWebhook['on'];
	}): Promise<MiWebhook[]> {
		const query = this.webhooksRepository.createQueryBuilder('webhook');
		if (params) {
			if (params.ids && params.ids.length > 0) {
				query.andWhere('webhook.id IN (:...ids)', { ids: params.ids });
			}
			if (params.isActive !== undefined) {
				query.andWhere('webhook.active = :isActive', { isActive: params.isActive });
			}
			if (params.on && params.on.length > 0) {
				query.andWhere(':on <@ webhook.on', { on: params.on });
			}
		}

		return query.getMany();
	}

	/**
	 * UserWebhook をWebhook配送キューに追加する
	 * @see QueueService.userWebhookDeliver
	 */
	@bindThis
	public async enqueueUserWebhook<T extends WebhookEventTypes>(
		userId: MiUser['id'],
		type: T,
		content: UserWebhookPayload<T>,
	) {
		const webhooks = await this.getActiveWebhooks()
			.then(webhooks => webhooks.filter(webhook => webhook.userId === userId && webhook.on.includes(type)));
		return Promise.all(
			webhooks.map(webhook => {
				return this.queueService.userWebhookDeliver(webhook, type, content);
			}),
		);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);
		if (obj.channel !== 'internal') {
			return;
		}

		const { type, body } = obj.message as GlobalEvents['internal']['payload'];
		switch (type) {
			case 'webhookCreated':
			case 'webhookUpdated':
			case 'webhookDeleted': {
				if (!isInternalEventRef(body)) break;
				// 新本文は値を持たないので、一覧を捨てて次の取得でDBから読み直す。
				// 1件ずつ読み直すと、読み込み中に届いた後続のイベントや、取得中の一覧との順序が入れ替わる
				this.activeWebhooks.invalidate();
				return;
			}
			default:
				break;
		}

		// 旧本文（エンティティ全体）。読み込み済みの一覧に差分を反映する（読み込み中の一覧は保存しない）
		if (isInternalEventRef(body)) return;
		switch (type) {
			case 'webhookCreated':
			case 'webhookUpdated':
			case 'webhookDeleted': {
				const webhook: MiWebhook | null = type !== 'webhookDeleted' && body.active ? { // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
					...body,
					latestSentAt: body.latestSentAt ? new Date(body.latestSentAt) : null,
					user: null, // joinなカラムは通常取ってこないので
				} : null;
				this.activeWebhooks.modify(webhooks => replaceById(webhooks, body.id, webhook));
				break;
			}
			default:
				break;
		}
	}

	/**
	 * Pub/Subをつなぎ直したとき。切れている間のイベントを受け取れていないので、イベントで更新しているキャッシュを捨てる
	 */
	@bindThis
	private onRedisReconnected(): void {
		this.activeWebhooks.invalidate();
	}

	@bindThis
	public dispose(): void {
		this.offRedisReconnected();
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
