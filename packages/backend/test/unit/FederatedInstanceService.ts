/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type * as Redis from 'ioredis';
import type { InstancesRepository } from '@/models/_.js';
import type { MiInstance } from '@/models/Instance.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { IdService } from '@/core/IdService.js';
import {
	FederatedInstanceService,
	INSTANCE_REQUEST_RECEIVED_AT_KEY,
	INSTANCE_UNSUSPEND_REQUESTED_KEY,
} from '@/core/FederatedInstanceService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('FederatedInstanceService: 最終受信時刻の集約（P3-2）', () => {
	let app: TestingModule;
	let service: FederatedInstanceService;
	let instancesRepository: InstancesRepository;
	let redis: Redis.Redis;

	async function createInstance(data: Partial<MiInstance> = {}): Promise<MiInstance> {
		const id = app.get(IdService).gen();
		await instancesRepository.insert({ id, host: `${secureRndstr(16).toLowerCase()}.example.com`, firstRetrievedAt: new Date(), ...data });
		return await instancesRepository.findOneByOrFail({ id });
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [GlobalModule, CoreModule] }).compile();
		await app.init();
		service = app.get(FederatedInstanceService);
		instancesRepository = app.get(DI.instancesRepository);
		redis = app.get(DI.redis);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await redis.del(INSTANCE_REQUEST_RECEIVED_AT_KEY, INSTANCE_UNSUSPEND_REQUESTED_KEY);
	});

	test('受信時刻は最大値を保ち、flushでDBに書いてRedisから消す', async () => {
		const instance = await createInstance({ isNotResponding: true });
		const later = new Date('2026-01-01T00:00:10Z');
		await service.recordRequestReceived(instance, later);
		await service.recordRequestReceived(instance, new Date('2026-01-01T00:00:05Z'));

		expect(await service.flushRequestReceived()).toBe(1);

		const updated = await instancesRepository.findOneByOrFail({ id: instance.id });
		expect(updated.latestRequestReceivedAt?.getTime()).toBe(later.getTime());
		expect(updated.isNotResponding).toBe(false);
		expect(updated.suspensionState).toBe('none');
		expect(await redis.exists(INSTANCE_REQUEST_RECEIVED_AT_KEY, INSTANCE_UNSUSPEND_REQUESTED_KEY)).toBe(0);

		// 2回目は何もしない
		expect(await service.flushRequestReceived()).toBe(0);
	});

	test('DBの値より古い受信時刻では、DBの値を戻さない', async () => {
		const current = new Date('2026-01-01T00:01:00Z');
		const instance = await createInstance({ latestRequestReceivedAt: current });
		await service.recordRequestReceived(instance, new Date('2026-01-01T00:00:00Z'));

		await service.flushRequestReceived();

		const updated = await instancesRepository.findOneByOrFail({ id: instance.id });
		expect(updated.latestRequestReceivedAt?.getTime()).toBe(current.getTime());
	});

	test('自動停止していたサーバーは、受信で停止を解除する', async () => {
		const instance = await createInstance({ suspensionState: 'autoSuspendedForNotResponding' });
		await service.recordRequestReceived(instance);

		await service.flushRequestReceived();

		expect((await instancesRepository.findOneByOrFail({ id: instance.id })).suspensionState).toBe('none');
	});

	test('集約している間に管理者が停止したサーバーは、解除しない', async () => {
		const instance = await createInstance({ suspensionState: 'autoSuspendedForNotResponding' });
		await service.recordRequestReceived(instance);
		await instancesRepository.update(instance.id, { suspensionState: 'manuallySuspended' });

		await service.flushRequestReceived();

		const updated = await instancesRepository.findOneByOrFail({ id: instance.id });
		expect(updated.suspensionState).toBe('manuallySuspended');
		expect(updated.latestRequestReceivedAt).not.toBeNull();
	});

	test('flushした値でキャッシュを更新する', async () => {
		const instance = await createInstance({ suspensionState: 'autoSuspendedForNotResponding' });
		await service.federatedInstanceCache.set(instance.host, instance);
		await service.recordRequestReceived(instance);

		await service.flushRequestReceived();

		expect((await service.fetch(instance.host))?.suspensionState).toBe('none');
	});
});
