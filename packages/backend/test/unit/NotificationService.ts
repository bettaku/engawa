/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { NotificationService } from '@/core/NotificationService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('NotificationService', () => {
	let app: TestingModule;
	let notificationService: NotificationService;
	let globalEventService: GlobalEventService;
	let redis: Redis.Redis;

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] }).compile();
		app.enableShutdownHooks();
		await app.init();
		notificationService = app.get(NotificationService);
		globalEventService = app.get(GlobalEventService);
		redis = app.get(DI.redis);
		vi.spyOn(app.get(PushNotificationService), 'pushNotification').mockResolvedValue(undefined);
	});

	afterAll(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	describe('readAllNotification', () => {
		async function setup(streamIds: string[], latestRead: string | null) {
			const userId = secureRndstr(16);
			for (const id of streamIds) {
				await redis.xadd(`notificationTimeline:${userId}`, id, 'data', '{}');
			}
			if (latestRead != null) await redis.set(`latestReadNotification:${userId}`, latestRead);
			const publish = vi.spyOn(globalEventService, 'publishMainStream');
			publish.mockClear();
			return { userId, publish };
		}

		function readAllPublished(publish: { mock: { calls: unknown[][] } }, userId: string) {
			return publish.mock.calls.some(([id, type]) => id === userId && type === 'readAllNotifications');
		}

		test('同じミリ秒で seq の桁数が違っても、新しい通知を未読と判定する', async () => {
			// 文字列比較では "…-9" >= "…-10" となり、既読と誤判定していた
			const { userId, publish } = await setup(['1700000000000-9', '1700000000000-10'], '1700000000000-9');
			await notificationService.readAllNotification(userId);
			expect(readAllPublished(publish, userId)).toBe(true);
			expect(await redis.get(`latestReadNotification:${userId}`)).toBe('1700000000000-10');
		});

		test('既読位置が最新の通知に達していれば、既読イベントを発行しない', async () => {
			const { userId, publish } = await setup(['1700000000000-9', '1700000000000-10'], '1700000000000-10');
			await notificationService.readAllNotification(userId);
			expect(readAllPublished(publish, userId)).toBe(false);
		});

		test('既読位置が解析できない値なら、未読として扱う', async () => {
			const { userId, publish } = await setup(['1700000000000-1'], 'broken');
			await notificationService.readAllNotification(userId);
			expect(readAllPublished(publish, userId)).toBe(true);
		});
	});
});
