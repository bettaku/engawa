/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiUser, SystemWebhooksRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { ReloadableList, replaceById } from '@/misc/reloadable-list.js';
import { GlobalEvents, GlobalEventService, isInternalEventRef, toInternalEventRef } from '@/core/GlobalEventService.js';
import { MiSystemWebhook, type SystemWebhookEventType } from '@/models/SystemWebhook.js';
import { IdService } from '@/core/IdService.js';
import { QueueService } from '@/core/QueueService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { LoggerService } from '@/core/LoggerService.js';
import Logger from '@/logger.js';
import { Packed } from '@/misc/json-schema.js';
import { AbuseReportResolveType } from '@/models/AbuseUserReport.js';
import { ModeratorInactivityRemainingTime } from '@/queue/processors/CheckModeratorsActivityProcessorService.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import { onRedisReconnected } from '@/misc/redis-reconnected.js';

export type AbuseReportPayload = {
	id: string;
	targetUserId: string;
	targetUser: Packed<'UserLite'> | null;
	targetUserHost: string | null;
	reporterId: string;
	reporter: Packed<'UserLite'> | null;
	reporterHost: string | null;
	assigneeId: string | null;
	assignee: Packed<'UserLite'> | null;
	resolved: boolean;
	forwarded: boolean;
	comment: string;
	moderationNote: string;
	resolvedAs: AbuseReportResolveType | null;
};

export type InactiveModeratorsWarningPayload = {
	remainingTime: ModeratorInactivityRemainingTime;
};

export type SystemWebhookPayload<T extends SystemWebhookEventType> =
	T extends 'abuseReport' | 'abuseReportResolved' ? AbuseReportPayload :
	T extends 'userCreated' ? Packed<'UserLite'> :
	T extends 'inactiveModeratorsWarning' ? InactiveModeratorsWarningPayload :
	T extends 'inactiveModeratorsInvitationOnlyChanged' ? Record<string, never> :
	T extends 'inactiveModeratorsDisablePublicNoteChanged' ? Record<string, never> :
	never;

@Injectable()
export class SystemWebhookService implements OnApplicationShutdown {
	private readonly offRedisReconnected: () => void;
	private readonly activeSystemWebhooks: ReloadableList<MiSystemWebhook>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,
		@Inject(DI.systemWebhooksRepository)
		private systemWebhooksRepository: SystemWebhooksRepository,
		private idService: IdService,
		private queueService: QueueService,
		private moderationLogService: ModerationLogService,
		private globalEventService: GlobalEventService,
		loggerService: LoggerService,
	) {
		const logger = loggerService.getLogger('system-webhook');
		this.activeSystemWebhooks = new ReloadableList(
			() => this.systemWebhooksRepository.findBy({ isActive: true }),
			{ onError: err => logger.error('Failed to load active system webhooks', { e: err }) },
		);
		this.redisForSub.on('message', this.onMessage);
		this.offRedisReconnected = onRedisReconnected(this.redisForSub, this.onRedisReconnected);
	}

	@bindThis
	public async fetchActiveSystemWebhooks() {
		return await this.activeSystemWebhooks.get();
	}

	/**
	 * SystemWebhook の一覧を取得する.
	 */
	@bindThis
	public fetchSystemWebhooks(params?: {
		ids?: MiSystemWebhook['id'][];
		isActive?: MiSystemWebhook['isActive'];
		on?: MiSystemWebhook['on'];
	}): Promise<MiSystemWebhook[]> {
		const query = this.systemWebhooksRepository.createQueryBuilder('systemWebhook');
		if (params) {
			if (params.ids && params.ids.length > 0) {
				query.andWhere('systemWebhook.id IN (:...ids)', { ids: params.ids });
			}
			if (params.isActive !== undefined) {
				query.andWhere('systemWebhook.isActive = :isActive', { isActive: params.isActive });
			}
			if (params.on && params.on.length > 0) {
				query.andWhere(':on <@ systemWebhook.on', { on: params.on });
			}
		}

		return query.getMany();
	}

	/**
	 * SystemWebhook を作成する.
	 */
	@bindThis
	public async createSystemWebhook(
		params: {
			isActive: MiSystemWebhook['isActive'];
			name: MiSystemWebhook['name'];
			on: MiSystemWebhook['on'];
			url: MiSystemWebhook['url'];
			secret: MiSystemWebhook['secret'];
		},
		updater: MiUser,
	): Promise<MiSystemWebhook> {
		const id = this.idService.gen();
		await this.systemWebhooksRepository.insert({
			...params,
			id,
		});

		const webhook = await this.systemWebhooksRepository.findOneByOrFail({ id });
		this.globalEventService.publishInternalEvent('systemWebhookCreated', toInternalEventRef(webhook));
		this.moderationLogService
			.log(updater, 'createSystemWebhook', {
				systemWebhookId: webhook.id,
				webhook: webhook,
			});

		return webhook;
	}

	/**
	 * SystemWebhook を更新する.
	 */
	@bindThis
	public async updateSystemWebhook(
		params: {
			id: MiSystemWebhook['id'];
			isActive: MiSystemWebhook['isActive'];
			name: MiSystemWebhook['name'];
			on: MiSystemWebhook['on'];
			url: MiSystemWebhook['url'];
			secret: MiSystemWebhook['secret'];
		},
		updater: MiUser,
	): Promise<MiSystemWebhook> {
		const beforeEntity = await this.systemWebhooksRepository.findOneByOrFail({ id: params.id });
		await this.systemWebhooksRepository.update(beforeEntity.id, {
			updatedAt: new Date(),
			isActive: params.isActive,
			name: params.name,
			on: params.on,
			url: params.url,
			secret: params.secret,
		});

		const afterEntity = await this.systemWebhooksRepository.findOneByOrFail({ id: beforeEntity.id });
		this.globalEventService.publishInternalEvent('systemWebhookUpdated', toInternalEventRef(afterEntity));
		this.moderationLogService
			.log(updater, 'updateSystemWebhook', {
				systemWebhookId: beforeEntity.id,
				before: beforeEntity,
				after: afterEntity,
			});

		return afterEntity;
	}

	/**
	 * SystemWebhook を削除する.
	 */
	@bindThis
	public async deleteSystemWebhook(id: MiSystemWebhook['id'], updater: MiUser) {
		const webhook = await this.systemWebhooksRepository.findOneByOrFail({ id });
		await this.systemWebhooksRepository.delete(id);

		this.globalEventService.publishInternalEvent('systemWebhookDeleted', toInternalEventRef(webhook));
		this.moderationLogService
			.log(updater, 'deleteSystemWebhook', {
				systemWebhookId: webhook.id,
				webhook,
			});
	}

	/**
	 * SystemWebhook をWebhook配送キューに追加する
	 * @see QueueService.systemWebhookDeliver
	 */
	@bindThis
	public async enqueueSystemWebhook<T extends SystemWebhookEventType>(
		type: T,
		content: SystemWebhookPayload<T>,
		opts?: {
			excludes?: MiSystemWebhook['id'][];
		},
	) {
		const webhooks = await this.fetchActiveSystemWebhooks()
			.then(webhooks => {
				return webhooks.filter(webhook => !opts?.excludes?.includes(webhook.id) && webhook.on.includes(type));
			});
		return Promise.all(
			webhooks.map(webhook => {
				return this.queueService.systemWebhookDeliver(webhook, type, content);
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
			case 'systemWebhookCreated':
			case 'systemWebhookUpdated':
			case 'systemWebhookDeleted': {
				if (!isInternalEventRef(body)) break;
				// 新本文は値を持たないので、一覧を捨てて次の取得でDBから読み直す。
				// 1件ずつ読み直すと、読み込み中に届いた後続のイベントや、取得中の一覧との順序が入れ替わる
				this.activeSystemWebhooks.invalidate();
				return;
			}
			default:
				break;
		}

		// 旧本文（エンティティ全体）。読み込み済みの一覧に差分を反映する（読み込み中の一覧は保存しない）
		if (isInternalEventRef(body)) return;
		switch (type) {
			case 'systemWebhookCreated':
			case 'systemWebhookUpdated':
			case 'systemWebhookDeleted': {
				const webhook = type !== 'systemWebhookDeleted' && body.isActive ? MiSystemWebhook.deserialize(body) : null;
				this.activeSystemWebhooks.modify(webhooks => replaceById(webhooks, body.id, webhook));
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
		this.activeSystemWebhooks.invalidate();
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
