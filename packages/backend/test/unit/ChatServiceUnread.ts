/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import type { MiChatMessage, MiUser } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { IdService } from '@/core/IdService.js';
import { ChatService } from '@/core/ChatService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { QueueService } from '@/core/QueueService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('ChatService: 未読のメッセージのイベント（P3-2）', () => {
	let app: TestingModule;
	let chatService: ChatService;
	let globalEventService: GlobalEventService;
	let redis: Redis.Redis;

	async function createUser(): Promise<MiUser> {
		const id = app.get(IdService).gen();
		const username = secureRndstr(16);
		await app.get(DI.usersRepository).insert({ id, username, usernameLower: username.toLowerCase(), chatScope: 'everyone' });
		await app.get(DI.userProfilesRepository).insert({ userId: id });
		return await app.get(DI.usersRepository).findOneByOrFail({ id });
	}

	async function insertMessage(from: MiUser, to: MiUser): Promise<MiChatMessage> {
		return await app.get(DI.chatMessagesRepository).insertOne({
			id: app.get(IdService).gen(),
			fromUserId: from.id,
			toUserId: to.id,
			text: 'hi',
			reads: [],
		});
	}

	function newChatMessageEvents(publish: { mock: { calls: unknown[][] } }, userId: string) {
		return publish.mock.calls.filter(([id, type]) => id === userId && type === 'newChatMessage').length;
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] }).compile();
		await app.init();
		chatService = app.get(ChatService);
		globalEventService = app.get(GlobalEventService);
		redis = app.get(DI.redis);
		vi.spyOn(app.get(PushNotificationService), 'pushNotification').mockResolvedValue(undefined);
	});

	afterAll(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	test('1対1のメッセージを送ると、3秒後に処理するジョブを登録する', async () => {
		const createJob = vi.spyOn(app.get(QueueService), 'createUnreadChatMessageJob').mockResolvedValue(undefined as never);
		const [alice, bob] = await Promise.all([createUser(), createUser()]);

		const message = await chatService.createMessageToUser(alice, bob, { text: 'hi' });

		expect(createJob).toHaveBeenCalledWith(message.id, 3000);
		createJob.mockRestore();
	});

	test('未読の印が残っていれば、受信者にイベントを送る', async () => {
		const [alice, bob] = await Promise.all([createUser(), createUser()]);
		const message = await insertMessage(alice, bob);
		await redis.set(`newUserChatMessageExists:${bob.id}:${alice.id}`, message.id);
		const publish = vi.spyOn(globalEventService, 'publishMainStream');

		expect(await chatService.processUnreadMessage(message.id)).toBe('ok');
		expect(newChatMessageEvents(publish, bob.id)).toBe(1);
	});

	test('既読（印がない）なら送らない', async () => {
		const [alice, bob] = await Promise.all([createUser(), createUser()]);
		const message = await insertMessage(alice, bob);
		const publish = vi.spyOn(globalEventService, 'publishMainStream');

		expect(await chatService.processUnreadMessage(message.id)).toBe('skip: already read');
		expect(newChatMessageEvents(publish, bob.id)).toBe(0);
	});

	test('削除されたメッセージは送らない', async () => {
		const [alice, bob] = await Promise.all([createUser(), createUser()]);
		const message = await insertMessage(alice, bob);
		await redis.set(`newUserChatMessageExists:${bob.id}:${alice.id}`, message.id);
		await app.get(DI.chatMessagesRepository).delete(message.id);
		const publish = vi.spyOn(globalEventService, 'publishMainStream');

		expect(await chatService.processUnreadMessage(message.id)).toBe('skip: message not found');
		expect(newChatMessageEvents(publish, bob.id)).toBe(0);
	});
});
