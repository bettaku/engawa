/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Misskey from 'cherrypick-js';
import { DI } from '@/di-symbols.js';
import type { SigninsRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import type { MiLocalUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { QueueService } from '@/core/QueueService.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class SigninService {
	constructor(
		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		private idService: IdService,
		private queueService: QueueService,
	) {
	}

	/**
	 * サインインを記録し、ログインの通知・ストリーム・メールを送るジョブを登録してから応答する（P3-2）。
	 * 記録とジョブの登録を応答の前に終えるので、応答した後にプロセスが停止しても、記録と通知は失われない。
	 */
	@bindThis
	public async signin(request: FastifyRequest, reply: FastifyReply, user: MiLocalUser) {
		const record = await this.signinsRepository.insertOne({
			id: this.idService.gen(),
			userId: user.id,
			ip: request.ip,
			headers: request.headers as any,
			success: true,
		});

		await this.queueService.createSigninNotificationJob(record.id);

		reply.code(200);
		return {
			finished: true,
			id: user.id,
			i: user.token!,
		} satisfies Misskey.entities.SigninFlowResponse;
	}
}

