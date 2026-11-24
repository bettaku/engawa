/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NestFactory } from '@nestjs/core';
import { ChartManagementService } from '@/core/chart/ChartManagementService.js';
import { QueueProcessorService } from '@/queue/QueueProcessorService.js';
import { NestLogger } from '@/NestLogger.js';
import { QueueProcessorModule } from '@/queue/QueueProcessorModule.js';
import { QueueStatsService } from '@/daemons/QueueStatsService.js';
import { ServerStatsService } from '@/daemons/ServerStatsService.js';
import { ServerService } from '@/server/ServerService.js';
import { MainModule } from '@/MainModule.js';
import { QueueService } from '@/core/QueueService.js';
import { envOption } from '@/env.js';
import { loadEnvironment } from '@/config/environment.js';

export async function server() {
	const app = await NestFactory.createApplicationContext(MainModule, {
		logger: new NestLogger(),
	});
	app.enableShutdownHooks();

	const serverService = app.get(ServerService);
	await serverService.launch();

	if (!loadEnvironment().runtime.test.disablePeriodicTasks) {
		app.get(ChartManagementService).start();
		app.get(QueueStatsService).start();
		app.get(ServerStatsService).start();
	}

	return app;
}

export async function jobQueue() {
	const jobQueue = await NestFactory.createApplicationContext(QueueProcessorModule, {
		logger: new NestLogger(),
	});
	jobQueue.enableShutdownHooks();

	// 定期ジョブの登録はqueueプロセスだけで行う（serverプロセスでは行わない）。
	// CP_NO_JOB_SCHEDULERSを設定したプロセスでは登録しない。その場合は、登録を担当するプロセスかCLIの register-job-schedulers で登録する
	if (!envOption.noJobSchedulers) {
		await jobQueue.get(QueueService).registerJobSchedulers();
	}

	jobQueue.get(QueueProcessorService).start();
	jobQueue.get(ChartManagementService).start();

	return jobQueue;
}
