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
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
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
	describe('未読の通知のイベント（P3-2）', () => {
		async function createUser() {
			const userId = app.get(IdService).gen();
			const username = secureRndstr(16);
			await app.get(DI.usersRepository).insert({ id: userId, username, usernameLower: username.toLowerCase() });
			await app.get(DI.userProfilesRepository).insert({ userId });
			return userId;
		}

		test('通知を作ると、2秒後に処理するジョブを登録する（テスト通知は遅延なし）', async () => {
			const createJob = vi.spyOn(app.get(QueueService), 'createUnreadNotificationJob').mockResolvedValue(undefined as never);
			const userId = await createUser();

			notificationService.createNotification(userId, 'app', { appAccessTokenId: null, customBody: 'hi', customHeader: null, customIcon: null });
			notificationService.createNotification(userId, 'test', {});
			await vi.waitFor(() => expect(createJob.mock.calls.filter(([id]) => id === userId).length).toBe(2));

			const calls = createJob.mock.calls.filter(([id]) => id === userId);
			expect(calls.map(([, , delay]) => delay).sort()).toEqual([0, 2000]);
			const streamIds = (await redis.xrange(`notificationTimeline:${userId}`, '-', '+')).map(([id]) => id);
			expect(calls.map(([, streamId]) => streamId).sort()).toEqual(streamIds.sort());
			createJob.mockRestore();
		});

		async function addTestNotification(userId: string) {
			const id = app.get(IdService).gen();
			const streamId = await redis.xadd(`notificationTimeline:${userId}`, '*', 'data', JSON.stringify({ id, createdAt: new Date(), type: 'test' }));
			if (streamId == null) throw new Error('xadd failed');
			return streamId;
		}

		function unreadPublished(publish: { mock: { calls: unknown[][] } }, userId: string) {
			return publish.mock.calls.filter(([id, type]) => id === userId && type === 'unreadNotification').length;
		}

		test('未読なら、通知をStreamから読み直してイベントとPush通知を送る', async () => {
			const userId = await createUser();
			const streamId = await addTestNotification(userId);
			const publish = vi.spyOn(globalEventService, 'publishMainStream');
			const push = vi.spyOn(app.get(PushNotificationService), 'pushNotification').mockResolvedValue(undefined);

			expect(await notificationService.processUnreadNotification(userId, streamId)).toBe('ok');
			expect(unreadPublished(publish, userId)).toBe(1);
			expect(push.mock.calls.filter(([id, type]) => id === userId && type === 'notification').length).toBe(1);
		});

		test('既読なら送らない', async () => {
			const userId = await createUser();
			const streamId = await addTestNotification(userId);
			await redis.set(`latestReadNotification:${userId}`, streamId);
			const publish = vi.spyOn(globalEventService, 'publishMainStream');

			expect(await notificationService.processUnreadNotification(userId, streamId)).toBe('skip: already read');
			expect(unreadPublished(publish, userId)).toBe(0);
		});

		test('Streamから消えた通知は送らない', async () => {
			const userId = await createUser();
			const streamId = await addTestNotification(userId);
			await notificationService.flushAllNotifications(userId);
			const publish = vi.spyOn(globalEventService, 'publishMainStream');

			expect(await notificationService.processUnreadNotification(userId, streamId)).toBe('skip: notification not found');
			expect(unreadPublished(publish, userId)).toBe(0);
		});
	});
});
