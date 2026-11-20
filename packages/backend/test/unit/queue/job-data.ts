/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { IncomingMessage } from 'node:http';
import * as Bull from 'bullmq';
import httpSignature from '@peertube/http-signature';
import { vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { LoggerService } from '@/core/LoggerService.js';
import { QueueService } from '@/core/QueueService.js';
import { ApRequestCreator } from '@/core/activitypub/ApRequestService.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { StatusError } from '@/misc/status-error.js';
import { QUEUE } from '@/queue/const.js';
import { buildInboxJobDataV2, toParsedSignature } from '@/queue/inbox-job-data.js';
import { JobResult, toBullOutcome } from '@/queue/job-result.js';
import { JOB_DATA_VERSION, assertSupportedJobDataVersion, getJobDataVersion, isSupportedJobDataVersion } from '@/queue/job-version.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { ImportAntennasProcessorService } from '@/queue/processors/ImportAntennasProcessorService.js';
import { SystemWebhookDeliverProcessorService } from '@/queue/processors/SystemWebhookDeliverProcessorService.js';
import { UserWebhookDeliverProcessorService } from '@/queue/processors/UserWebhookDeliverProcessorService.js';
import type { InboxJobDataV1, SystemWebhookDeliverJobData, UserWebhookDeliverJobData } from '@/queue/types.js';

const config = loadConfig();
const queueLoggerService = new QueueLoggerService(new LoggerService(config, null));

/** BullMQのジョブと同じく、payloadをJSONで往復させる */
function roundTrip<T>(data: T): T {
	return JSON.parse(JSON.stringify(data));
}

describe('ジョブpayloadの版', () => {
	test('vがないジョブは1とみなす', () => {
		expect(getJobDataVersion({ user: { id: 'a' } })).toBe(1);
		expect(getJobDataVersion({})).toBe(1);
		expect(getJobDataVersion(undefined)).toBe(1);
		expect(isSupportedJobDataVersion(QUEUE.DB, 'exportNotes', { user: { id: 'a' } })).toBe(true);
	});

	test('知らない版は再試行しない失敗にする', () => {
		const job = { name: 'exportNotes', data: { v: 99, user: { id: 'a' } } };
		expect(isSupportedJobDataVersion(QUEUE.DB, job.name, job.data)).toBe(false);
		expect(() => assertSupportedJobDataVersion(QUEUE.DB, job)).toThrow(Bull.UnrecoverableError);
	});

	test('数値でない版は知らない版として扱う', () => {
		expect(isSupportedJobDataVersion(QUEUE.DB, 'exportNotes', { v: '1' })).toBe(false);
		expect(isSupportedJobDataVersion(QUEUE.DB, 'exportNotes', { v: null })).toBe(false);
	});

	test('新しい形を受け付ける種別だけがv2を受け付ける', () => {
		expect(isSupportedJobDataVersion(QUEUE.DB, 'importAntennas', { v: 2 })).toBe(true);
		expect(isSupportedJobDataVersion(QUEUE.DB, 'exportNotes', { v: 2 })).toBe(false);
		expect(isSupportedJobDataVersion(QUEUE.INBOX, 'any', { v: 2 })).toBe(true);
		expect(isSupportedJobDataVersion(QUEUE.USER_WEBHOOK_DELIVER, 'any', { v: 2 })).toBe(true);
		expect(isSupportedJobDataVersion(QUEUE.SYSTEM_WEBHOOK_DELIVER, 'any', { v: 2 })).toBe(true);
		expect(isSupportedJobDataVersion(QUEUE.DELIVER, 'any', { v: 2 })).toBe(false);
	});

	test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('ジョブ名が継承したプロパティの名前（%s）でも、`*`の版で判定する', name => {
		// inboxのジョブ名はactivityのidから作るので、外部から任意の名前にできる
		expect(isSupportedJobDataVersion(QUEUE.INBOX, name, { v: 1 })).toBe(true);
		expect(isSupportedJobDataVersion(QUEUE.INBOX, name, { v: 3 })).toBe(false);
		expect(isSupportedJobDataVersion(QUEUE.DB, name, {})).toBe(true);
	});
});

describe('QueueServiceが登録するpayload', () => {
	type Added = { queue: string; name: string; data: unknown; };

	function createQueueService() {
		const added: Added[] = [];
		const fakeQueue = (queue: string) => ({
			add: vi.fn(async (name: string, data: unknown) => {
				added.push({ queue, name, data });
			}),
			addBulk: vi.fn(async (jobs: { name: string; data: unknown; }[]) => {
				for (const job of jobs) added.push({ queue, name: job.name, data: job.data });
			}),
			remove: vi.fn(async () => 0),
		}) as unknown as Bull.Queue;
		const service = new QueueService(
			config,
			fakeQueue(QUEUE.SYSTEM),
			fakeQueue(QUEUE.ENDED_POLL_NOTIFICATION),
			fakeQueue(QUEUE.POST_SCHEDULED_NOTE),
			fakeQueue(QUEUE.DELIVER),
			fakeQueue(QUEUE.INBOX),
			fakeQueue(QUEUE.DB),
			fakeQueue(QUEUE.RELATIONSHIP),
			fakeQueue(QUEUE.OBJECT_STORAGE),
			fakeQueue(QUEUE.USER_WEBHOOK_DELIVER),
			fakeQueue(QUEUE.SYSTEM_WEBHOOK_DELIVER),
			fakeQueue(QUEUE.SCHEDULED_NOTE_DELETE),
			new LoggerService(config, null),
		);
		return { service, added };
	}

	test('生成側は、すべての種別でvに現在の版を書く', async () => {
		const { service, added } = createQueueService();
		const user = { id: 'user1' };
		const other = { id: 'user2' };
		const activity: IActivity = { id: 'https://remote.example.com/activity', type: 'Create', actor: 'https://remote.example.com/users/a', object: 'https://remote.example.com/notes/1' };
		const webhook = { id: 'hook1', userId: user.id, url: 'https://hook.example.com', secret: 'secret' };

		service.deliver(user, activity, 'https://remote.example.com/inbox', false);
		await service.deliverMany(user, activity, new Map([['https://remote.example.com/inbox', false]]));
		service.inbox(activity, { scheme: 'Signature', params: { keyId: 'k', algorithm: 'rsa-sha256', headers: [], signature: 's' }, signingString: '', algorithm: 'RSA-SHA256', keyId: 'k' });
		service.createDeleteDriveFilesJob(user);
		service.createExportCustomEmojisJob(user);
		service.createExportNotesJob(user);
		service.createExportClipsJob(user);
		service.createExportFavoritesJob(user);
		service.createExportFollowingJob(user);
		service.createExportMuteJob(user);
		service.createExportBlockingJob(user);
		service.createExportUserListsJob(user);
		service.createExportAntennasJob(user);
		service.createImportFollowingJob(user, 'file1');
		await service.createImportFollowingToDbJob(user, ['a@example.com']);
		service.createImportMutingJob(user, 'file1');
		service.createImportBlockingJob(user, 'file1');
		await service.createImportBlockingToDbJob(user, ['a@example.com']);
		service.createImportUserListsJob(user, 'file1');
		service.createImportCustomEmojisJob(user, 'file1');
		service.createImportAntennasJob(user, []);
		service.createDeleteAccountJob(user);
		service.createTruncateAccountJob(user);
		await service.createAutoDeleteUserNotesJobs([user]);
		service.createSyncNoteIndexJob('note1');
		await service.createFollowJob([{ from: user, to: other }]);
		await service.createUnfollowJob([{ from: user, to: other }]);
		await service.createDelayedUnfollowJob([{ from: user, to: other }], 1000);
		await service.createBlockJob([{ from: user, to: other }]);
		await service.createUnblockJob([{ from: user, to: other }]);
		service.createDeleteObjectStorageFileJob('key');
		service.createCleanRemoteFilesJob();
		service.userWebhookDeliver(webhook as never, 'note', {} as never);
		service.systemWebhookDeliver({ ...webhook, isActive: true } as never, 'abuseReport', {} as never);
		await service.ensureNoteDeleteScheduled('note1', new Date());
		await service.ensureNotePostScheduled('draft1', new Date());

		// 非同期のaddも記録されるまで待つ
		await new Promise(resolve => setImmediate(resolve));

		expect(added.length).toBeGreaterThanOrEqual(36);
		for (const { queue, name, data } of added) {
			expect({ queue, name, v: (data as { v?: unknown }).v }).toEqual({ queue, name, v: JOB_DATA_VERSION });
		}
	});
});

describe('処理結果', () => {
	test('doneはメッセージを返す', () => {
		expect(toBullOutcome(JobResult.done('ok'))).toBe('ok');
	});

	test('retryは通常の例外を投げる', () => {
		let thrown: unknown;
		try {
			toBullOutcome(JobResult.retry('503'));
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).not.toBeInstanceOf(Bull.UnrecoverableError);
	});

	test('failは再試行しない例外を投げる', () => {
		expect(() => toBullOutcome(JobResult.fail('404'))).toThrow(Bull.UnrecoverableError);
	});
});

describe('inboxジョブのpayload', () => {
	async function signedRequest() {
		const keypair = await genRsaKeyPair();
		const activity: IActivity = { id: 'https://remote.example.com/activity/1', type: 'Create', actor: 'https://remote.example.com/users/alice', object: 'https://remote.example.com/notes/1' };
		const body = JSON.stringify(activity);
		const signed = ApRequestCreator.createSignedPost({
			key: { keyId: 'https://remote.example.com/users/alice#main-key', privateKeyPem: keypair.privateKey },
			url: 'https://local.example.com/inbox',
			body,
			additionalHeaders: {},
		});
		const headers: Record<string, string> = { host: 'local.example.com' };
		for (const [k, v] of Object.entries(signed.request.headers)) headers[k.toLowerCase()] = v;
		const request = {
			method: 'POST',
			url: '/inbox',
			httpVersion: '1.1',
			headers,
		} as unknown as IncomingMessage;
		const parsed = httpSignature.parseRequest(request, { headers: ['(request-target)', 'host', 'date'], authorizationHeaderName: 'signature' });
		return { keypair, activity, parsed, headers };
	}

	test('v2から組み立て直した署名で、受信時と同じく検証できる', async () => {
		const { keypair, activity, parsed, headers } = await signedRequest();

		const data = roundTrip(buildInboxJobDataV2(activity, parsed, { method: 'POST', url: '/inbox', digest: headers.digest }));

		expect(data.v).toBe(2);
		expect(data.signature.keyId).toBe('https://remote.example.com/users/alice#main-key');
		expect(data.signature.headers).toEqual(['(request-target)', 'date', 'host', 'digest']);
		expect(data.request).toEqual({ method: 'POST', target: '/inbox', digest: headers.digest });

		const restored = toParsedSignature(data);
		expect(restored).toEqual({
			scheme: parsed.scheme,
			params: parsed.params,
			signingString: parsed.signingString,
			algorithm: parsed.algorithm,
			keyId: parsed.keyId,
		});
		expect(httpSignature.verifySignature(restored, keypair.publicKey)).toBe(true);
	});

	test('v2の署名値を書き換えると検証に失敗する', async () => {
		const { keypair, activity, parsed, headers } = await signedRequest();
		const data = roundTrip(buildInboxJobDataV2(activity, parsed, { method: 'POST', url: '/inbox', digest: headers.digest }));
		data.signature.signingString = data.signature.signingString.replace('/inbox', '/other');

		expect(httpSignature.verifySignature(toParsedSignature(data), keypair.publicKey)).toBe(false);
	});

	test('v1は解析結果をそのまま使う', async () => {
		const { keypair, activity, parsed } = await signedRequest();
		const data: InboxJobDataV1 = roundTrip({ activity, signature: parsed });

		const restored = toParsedSignature(data);
		expect(restored).toBe(data.signature);
		expect(httpSignature.verifySignature(restored, keypair.publicKey)).toBe(true);
	});
});

describe('webhookジョブのpayload', () => {
	function createUserWebhookProcessor(webhook: Record<string, unknown> | null, send: (url: string, init: { headers: Record<string, string> }) => Promise<unknown>) {
		const webhooksRepository = {
			findOneBy: vi.fn(async () => webhook),
			update: vi.fn(async () => ({})),
		};
		const httpRequestService = { send: vi.fn(send) };
		const processor = new UserWebhookDeliverProcessorService(config, webhooksRepository as never, httpRequestService as never, queueLoggerService);
		return { processor, webhooksRepository, httpRequestService };
	}

	function createSystemWebhookProcessor(webhook: Record<string, unknown> | null, send: (url: string, init: { headers: Record<string, string> }) => Promise<unknown>) {
		const systemWebhooksRepository = {
			findOneBy: vi.fn(async () => webhook),
			update: vi.fn(async () => ({})),
		};
		const httpRequestService = { send: vi.fn(send) };
		const processor = new SystemWebhookDeliverProcessorService(config, systemWebhooksRepository as never, httpRequestService as never, queueLoggerService);
		return { processor, systemWebhooksRepository, httpRequestService };
	}

	const ok = async () => ({ status: 200 });

	const userV1: UserWebhookDeliverJobData = {
		v: 1, type: 'note', content: {} as never, webhookId: 'hook1', userId: 'user1',
		to: 'https://payload.example.com', secret: 'payload-secret', createdAt: 0, eventId: 'e1',
	};
	const userV2: UserWebhookDeliverJobData = {
		v: 2, type: 'note', content: {} as never, webhookId: 'hook1', userId: 'user1', createdAt: 0, eventId: 'e1',
	};
	const dbWebhook = { id: 'hook1', userId: 'user1', url: 'https://db.example.com', secret: 'db-secret', active: true };

	test('v1は、payloadの送信先とsecretで送る', async () => {
		const { processor, httpRequestService, webhooksRepository } = createUserWebhookProcessor(dbWebhook, ok);

		expect(await processor.deliver(roundTrip(userV1))).toEqual(JobResult.done('Success'));
		expect(webhooksRepository.findOneBy).not.toHaveBeenCalled();
		expect(httpRequestService.send.mock.calls[0][0]).toBe('https://payload.example.com');
		expect(httpRequestService.send.mock.calls[0][1].headers['X-Misskey-Hook-Secret']).toBe('payload-secret');
	});

	test('v2は、処理時にDBから送信先とsecretを読む', async () => {
		const { processor, httpRequestService } = createUserWebhookProcessor(dbWebhook, ok);

		expect(await processor.deliver(roundTrip(userV2))).toEqual(JobResult.done('Success'));
		expect(httpRequestService.send.mock.calls[0][0]).toBe('https://db.example.com');
		expect(httpRequestService.send.mock.calls[0][1].headers['X-Misskey-Hook-Secret']).toBe('db-secret');
	});

	test.each([
		['削除された', null],
		['無効化された', { ...dbWebhook, active: false }],
		['所有者が異なる', { ...dbWebhook, userId: 'someone-else' }],
	])('v2は、%s webhookには送らない', async (_, webhook) => {
		const { processor, httpRequestService, webhooksRepository } = createUserWebhookProcessor(webhook, ok);

		const result = await processor.deliver(roundTrip(userV2));
		expect(result.kind).toBe('done');
		expect(httpRequestService.send).not.toHaveBeenCalled();
		expect(webhooksRepository.update).not.toHaveBeenCalled();
	});

	test('相手の4xxは再試行しない失敗、5xxは再試行にする', async () => {
		const notFound = createUserWebhookProcessor(dbWebhook, async () => { throw new StatusError('Not Found', 404, 'Not Found'); });
		expect(await notFound.processor.deliver(userV2)).toEqual(JobResult.fail('404 Not Found'));

		const unavailable = createUserWebhookProcessor(dbWebhook, async () => { throw new StatusError('Service Unavailable', 503, 'Service Unavailable'); });
		expect(await unavailable.processor.deliver(userV2)).toEqual(JobResult.retry('503 Service Unavailable'));
	});

	const systemV2: SystemWebhookDeliverJobData = {
		v: 2, type: 'abuseReport', content: {} as never, webhookId: 'hook1', createdAt: 0, eventId: 'e1',
	};

	test('system webhookのv2は、処理時にDBから送信先とsecretを読む', async () => {
		const { processor, httpRequestService } = createSystemWebhookProcessor({ ...dbWebhook, isActive: true }, ok);

		expect(await processor.deliver(roundTrip(systemV2))).toEqual(JobResult.done('Success'));
		expect(httpRequestService.send.mock.calls[0][0]).toBe('https://db.example.com');
		expect(httpRequestService.send.mock.calls[0][1].headers['X-Misskey-Hook-Secret']).toBe('db-secret');
	});

	test('system webhookのv2は、無効化されたwebhookには送らない', async () => {
		const { processor, httpRequestService } = createSystemWebhookProcessor({ ...dbWebhook, isActive: false }, ok);

		expect((await processor.deliver(roundTrip(systemV2))).kind).toBe('done');
		expect(httpRequestService.send).not.toHaveBeenCalled();
	});
});

describe('importAntennasジョブのpayload', () => {
	const antenna = {
		name: 'antenna',
		src: 'all',
		userListAccts: null,
		keywords: [['keyword']],
		excludeKeywords: [],
		users: [],
		caseSensitive: false,
		localOnly: false,
		excludeBots: false,
		withReplies: false,
		withFile: false,
		excludeNotesInSensitiveChannel: false,
	};

	function createProcessor(file: { id: string; url: string; } | null, fileContent: string) {
		const antennasRepository = { insertOne: vi.fn(async (data: { id: string }) => data) };
		const driveFilesRepository = { findOneBy: vi.fn(async () => file) };
		const downloadService = { downloadTextFile: vi.fn(async () => fileContent) };
		const idService = { gen: vi.fn(() => 'antenna-id') };
		const globalEventService = { publishInternalEvent: vi.fn() };
		const processor = new ImportAntennasProcessorService(
			antennasRepository as never,
			driveFilesRepository as never,
			downloadService as never,
			queueLoggerService,
			idService as never,
			globalEventService as never,
		);
		return { processor, antennasRepository, driveFilesRepository, downloadService };
	}

	function job<T>(data: T) {
		return { data: roundTrip(data) } as Bull.Job<T>;
	}

	test('v1は、payloadのアンテナを作る', async () => {
		const { processor, antennasRepository, downloadService } = createProcessor(null, '');

		await processor.process(job({ v: 1 as const, user: { id: 'user1' }, antenna: [antenna] as never }));

		expect(downloadService.downloadTextFile).not.toHaveBeenCalled();
		expect(antennasRepository.insertOne).toHaveBeenCalledTimes(1);
		expect(antennasRepository.insertOne.mock.calls[0][0]).toMatchObject({ userId: 'user1', name: 'antenna' });
	});

	test('v2は、処理時に利用者のファイルを読んでアンテナを作る', async () => {
		const { processor, antennasRepository, driveFilesRepository } = createProcessor({ id: 'file1', url: 'https://files.example.com/file1' }, JSON.stringify([antenna]));

		expect(await processor.process(job({ v: 2 as const, user: { id: 'user1' }, fileId: 'file1' }))).toBe('ok');

		expect(driveFilesRepository.findOneBy).toHaveBeenCalledWith({ id: 'file1', userId: 'user1' });
		expect(antennasRepository.insertOne).toHaveBeenCalledTimes(1);
		expect(antennasRepository.insertOne.mock.calls[0][0]).toMatchObject({ userId: 'user1', name: 'antenna' });
	});

	test('v2は、ファイルがなければ何もしない', async () => {
		const { processor, antennasRepository } = createProcessor(null, '');

		expect(await processor.process(job({ v: 2 as const, user: { id: 'user1' }, fileId: 'file1' }))).toBe('skip: file not found');
		expect(antennasRepository.insertOne).not.toHaveBeenCalled();
	});

	test('v2は、配列でない・JSONでないファイルを取り込まない', async () => {
		const notArray = createProcessor({ id: 'file1', url: 'https://files.example.com/file1' }, JSON.stringify(antenna));
		expect(await notArray.processor.process(job({ v: 2 as const, user: { id: 'user1' }, fileId: 'file1' }))).toBe('skip: not an array');
		expect(notArray.antennasRepository.insertOne).not.toHaveBeenCalled();

		const notJson = createProcessor({ id: 'file1', url: 'https://files.example.com/file1' }, 'not json');
		expect(await notJson.processor.process(job({ v: 2 as const, user: { id: 'user1' }, fileId: 'file1' }))).toBe('skip: failed to parse the file');
		expect(notJson.antennasRepository.insertOne).not.toHaveBeenCalled();
	});

	test('v2は、ファイルのダウンロードに失敗したらジョブを失敗させる（一時的な失敗を完了扱いにしない）', async () => {
		const { processor, antennasRepository, downloadService } = createProcessor({ id: 'file1', url: 'https://files.example.com/file1' }, '');
		downloadService.downloadTextFile.mockRejectedValueOnce(new StatusError('Service Unavailable', 503, 'Service Unavailable'));

		await expect(processor.process(job({ v: 2 as const, user: { id: 'user1' }, fileId: 'file1' }))).rejects.toThrow(StatusError);
		expect(antennasRepository.insertOne).not.toHaveBeenCalled();
	});

	test('形式が誤っているアンテナは飛ばし、ほかのアンテナは作る', async () => {
		const { processor, antennasRepository } = createProcessor({ id: 'file1', url: 'https://files.example.com/file1' }, JSON.stringify([{ name: 'broken' }, antenna]));

		await processor.process(job({ v: 2 as const, user: { id: 'user1' }, fileId: 'file1' }));

		expect(antennasRepository.insertOne).toHaveBeenCalledTimes(1);
	});
});
