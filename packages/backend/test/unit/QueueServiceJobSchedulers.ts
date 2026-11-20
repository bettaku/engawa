/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { LoggerService } from '@/core/LoggerService.js';
import {
	OBSOLETE_SYSTEM_JOB_SCHEDULER_NAMES,
	QueueService,
	REPEATABLE_SYSTEM_JOB_DEF,
	shouldRemoveJobScheduler,
} from '@/core/QueueService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('QueueService.registerJobSchedulers', () => {
	const config = loadConfig();
	let redis: Redis.Redis;
	let systemQueue: Bull.Queue;
	let queueService: QueueService;

	beforeAll(() => {
		redis = new Redis.Redis({
			host: config.redisForJobQueue.host,
			port: config.redisForJobQueue.port,
			maxRetriesPerRequest: null,
		});
	});

	afterAll(async () => {
		await redis.quit();
	});

	beforeEach(() => {
		// 実際のsystem queueを汚さないように、テストごとに別のprefixを使う
		systemQueue = new Bull.Queue('system', {
			connection: redis,
			prefix: `test-job-schedulers-${secureRndstr(8)}`,
		});
		const loggerService = new LoggerService(config, null);
		// registerJobSchedulersが使うのはsystem queueだけなので、ほかのキューは渡さない
		const unused = null as never;
		queueService = new QueueService(
			config,
			systemQueue,
			unused, unused, unused, unused, unused, unused, unused, unused, unused, unused,
			loggerService,
		);
	});

	afterEach(async () => {
		await systemQueue.obliterate({ force: true });
		await systemQueue.close();
	});

	async function schedulerKeys(): Promise<string[]> {
		const schedulers = await systemQueue.getJobSchedulers();
		return schedulers.map(s => s.key).sort();
	}

	test('定義にある定期ジョブをすべて登録する', async () => {
		const result = await queueService.registerJobSchedulers();

		const names = REPEATABLE_SYSTEM_JOB_DEF.map(def => def.name).sort();
		expect(result.upserted.sort()).toEqual(names);
		expect(await schedulerKeys()).toEqual(names);

		const tickCharts = await systemQueue.getJobScheduler('tickCharts');
		expect(tickCharts?.pattern).toBe('55 * * * *');
	});

	test('何度呼んでも、定期ジョブは1つずつになる', async () => {
		await queueService.registerJobSchedulers();
		await queueService.registerJobSchedulers();

		expect(await schedulerKeys()).toEqual(REPEATABLE_SYSTEM_JOB_DEF.map(def => def.name).sort());
	});

	test('知らない名前のスケジューラーは削除しない', async () => {
		// 新しい版や別の実装が登録したもの
		await systemQueue.upsertJobScheduler('registeredByAnotherImplementation', { pattern: '0 * * * *' }, { name: 'registeredByAnotherImplementation' });

		const result = await queueService.registerJobSchedulers();

		expect(result.removed).toEqual([]);
		expect(result.kept).toEqual(['registeredByAnotherImplementation']);
		expect(await schedulerKeys()).toContain('registeredByAnotherImplementation');
	});

	test('旧形式で登録された、このアプリの定期ジョブは削除する', async () => {
		// 以前の版は add(…, { repeat }) で登録していた。キーはジョブ名と異なる
		await systemQueue.add('tickCharts', {}, { repeat: { pattern: '55 * * * *' } });
		const legacyKeys = (await systemQueue.getJobSchedulers()).filter(s => s.name === 'tickCharts').map(s => s.key);
		expect(legacyKeys).toHaveLength(1);
		expect(legacyKeys[0]).not.toBe('tickCharts');

		const result = await queueService.registerJobSchedulers();

		expect(result.removed).toEqual(legacyKeys);
		expect(await schedulerKeys()).toEqual(REPEATABLE_SYSTEM_JOB_DEF.map(def => def.name).sort());
	});

	test('旧形式でも、知らない名前のものは削除しない', async () => {
		await systemQueue.add('unknownLegacyJob', {}, { repeat: { pattern: '0 * * * *' } });

		const result = await queueService.registerJobSchedulers();

		expect(result.removed).toEqual([]);
		expect(result.kept).toHaveLength(1);
		expect(await systemQueue.getJobSchedulers()).toEqual(expect.arrayContaining([
			expect.objectContaining({ key: result.kept[0], name: 'unknownLegacyJob' }),
		]));
	});
});

describe('shouldRemoveJobScheduler', () => {
	test('定義にある名前は削除しない', () => {
		expect(shouldRemoveJobScheduler({ key: 'tickCharts', name: 'tickCharts' })).toBe(false);
	});

	test('知らない名前は削除しない', () => {
		expect(shouldRemoveJobScheduler({ key: 'somethingNew', name: 'somethingNew' })).toBe(false);
		expect(shouldRemoveJobScheduler({ key: 'somethingNew:::: 0 * * * *', name: 'somethingNew' })).toBe(false);
	});

	test('旧形式の、定義にある名前は削除する', () => {
		expect(shouldRemoveJobScheduler({ key: 'tickCharts:::55 * * * *', name: 'tickCharts' })).toBe(true);
		expect(shouldRemoveJobScheduler({ key: '433e3e1c64d445790b737c680f4f370d', name: 'tickCharts' })).toBe(true);
	});

	test('既知の旧名と定義は重ならない', () => {
		for (const name of OBSOLETE_SYSTEM_JOB_SCHEDULER_NAMES) {
			expect(REPEATABLE_SYSTEM_JOB_DEF.some(def => def.name === name)).toBe(false);
		}
	});
});
