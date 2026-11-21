/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { WebhooksRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { StatusError } from '@/misc/status-error.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import { JobResult, toBullOutcome } from '../job-result.js';
import type { UserWebhookDeliverJobData } from '../types.js';
import type * as Bull from 'bullmq';

@Injectable()
export class UserWebhookDeliverProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.webhooksRepository)
		private webhooksRepository: WebhooksRepository,

		private httpRequestService: HttpRequestService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('webhook');
	}

	@bindThis
	public async process(job: Bull.Job<UserWebhookDeliverJobData>): Promise<string> {
		return toBullOutcome(await this.deliver(job.data));
	}

	/**
	 * 送信先と`secret`を決める。v1はpayloadの値を使う。v2は処理時にDBから読み、
	 * webhookが削除・無効化されているか、所有者が異なれば送らない（nullを返す）。
	 */
	@bindThis
	private async resolveTarget(data: UserWebhookDeliverJobData): Promise<{ url: string; secret: string; } | null> {
		if (data.v === 2) {
			const webhook = await this.webhooksRepository.findOneBy({ id: data.webhookId });
			if (webhook == null || !webhook.active || webhook.userId !== data.userId) return null;
			return { url: webhook.url, secret: webhook.secret };
		}
		return { url: data.to, secret: data.secret };
	}

	@bindThis
	public async deliver(data: UserWebhookDeliverJobData): Promise<JobResult> {
		const target = await this.resolveTarget(data);
		if (target == null) {
			return JobResult.done(`skip: webhook ${data.webhookId} was deleted or deactivated`);
		}

		try {
			this.logger.debug(`delivering ${data.webhookId}`);

			const res = await this.httpRequestService.send(target.url, {
				method: 'POST',
				headers: {
					'User-Agent': 'Misskey-Hooks',
					'X-Misskey-Host': this.config.host,
					'X-Misskey-Hook-Id': data.webhookId,
					'X-Misskey-Hook-Secret': target.secret,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					server: this.config.url,
					hookId: data.webhookId,
					userId: data.userId,
					eventId: data.eventId,
					createdAt: data.createdAt,
					type: data.type,
					body: data.content,
				}),
			});

			this.webhooksRepository.update({ id: data.webhookId }, {
				latestSentAt: new Date(),
				latestStatus: res.status,
			});

			return JobResult.done('Success');
		} catch (res) {
			this.webhooksRepository.update({ id: data.webhookId }, {
				latestSentAt: new Date(),
				latestStatus: res instanceof StatusError ? res.statusCode : 1,
			});

			if (res instanceof StatusError) {
				// 4xx
				if (!res.isRetryable) {
					return JobResult.fail(`${res.statusCode} ${res.statusMessage}`);
				}

				// 5xx etc.
				return JobResult.retry(`${res.statusCode} ${res.statusMessage}`);
			} else {
				// DNS error, socket error, timeout ...
				throw res;
			}
		}
	}
}
