/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';

// Exercise the real service and renderer with in-memory repositories. No server
// or database is needed to verify the Activity IDs delivered to the remote inbox.
describe('Follow Activity identity', () => {
	const url = 'https://local.example';
	const follower = { id: 'alice', host: null, uri: null, movedToUri: 'moved' };
	const followee = { id: 'bob', host: 'remote.example', uri: 'https://remote.example/users/bob', inbox: 'https://remote.example/inbox', movedToUri: 'moved' };
	let service: UserFollowingService;
	let requests: Map<string, any>;
	let followings: Map<string, any>;
	let deliver: ReturnType<typeof vi.fn>;
	let sequence: number;

	beforeEach(() => {
		requests = new Map();
		followings = new Map();
		sequence = 0;
		deliver = vi.fn();
		const users = {
			isLocalUser: (user: any) => user.host === null,
			isRemoteUser: (user: any) => user.host !== null,
			getUserUri: (user: any) => user.uri ?? `${url}/users/${user.id}`,
			genLocalUserUri: (id: string) => `${url}/users/${id}`,
			pack: vi.fn().mockResolvedValue({}),
		};
		const renderer = Object.assign(Object.create(ApRendererService.prototype), {
			config: { url }, userEntityService: users,
			utilityService: { isUriLocal: (uri: string) => uri.startsWith(`${url}/`) },
		});
		Object.defineProperty(renderer, 'addContext', { value: (activity: unknown) => activity });
		service = Object.assign(Object.create(UserFollowingService.prototype), {
			config: { url }, meta: {}, userEntityService: users, apRendererService: renderer,
			idService: { gen: () => `id-${++sequence}` },
			userBlockingService: { checkBlocked: vi.fn().mockResolvedValue(false) },
			queueService: { deliver },
			followRequestsRepository: {
				insertOne: async (request: any) => { requests.set('pair', request); return request; },
				findOneBy: async () => requests.get('pair') ?? null,
				exists: async () => requests.has('pair'),
				delete: async () => requests.delete('pair'),
			},
			followingsRepository: {
				insert: async (following: any) => followings.set('pair', { ...following, follower, followee }),
				findOne: async () => followings.get('pair') ?? null,
				delete: async () => followings.delete('pair'),
			},
			usersRepository: { findOneByOrFail: async ({ id }: { id: string }) => id === follower.id ? follower : followee },
			cacheService: { userFollowingsCache: { refresh: vi.fn() }, userProfileCache: { fetch: vi.fn().mockResolvedValue({}) } },
			notificationService: { createNotification: vi.fn() },
			globalEventService: { publishInternalEvent: vi.fn(), publishMainStream: vi.fn() },
			webhookService: { enqueueUserWebhook: vi.fn() },
		});
		Object.defineProperty(service, 'decrementFollowing', { value: vi.fn() });
	});

	test('repeated accepted follows undo the original activity with distinct IDs', async () => {
		const undoIds = [];
		for (let i = 0; i < 2; i++) {
			await service.createFollowRequest(follower as any, followee as any);
			const follow = deliver.mock.calls.at(-1)?.[1];
			await service.acceptFollowRequest(followee as any, follower as any);
			expect(requests.size).toBe(0);
			expect(followings.get('pair').requestId).toBe(follow.id);
			await service.unfollow(follower as any, followee as any, true);
			const undo = deliver.mock.calls.at(-1)?.[1];
			expect(undo.type).toBe('Undo');
			expect(undo.object).toEqual(follow);
			expect(undo.id).toBe(`${follow.id}/undo`);
			undoIds.push(undo.id);
		}
		expect(new Set(undoIds).size).toBe(2);
	});

	test('repeated request cancellations undo the original activity with distinct IDs', async () => {
		const undoIds = [];
		for (let i = 0; i < 2; i++) {
			await service.createFollowRequest(follower as any, followee as any);
			const follow = deliver.mock.calls.at(-1)?.[1];
			await service.cancelFollowRequest(followee as any, follower as any);
			const undo = deliver.mock.calls.at(-1)?.[1];
			expect(undo.object).toEqual(follow);
			expect(undo.id).toBe(`${follow.id}/undo`);
			expect(requests.size).toBe(0);
			undoIds.push(undo.id);
		}
		expect(new Set(undoIds).size).toBe(2);
	});

	test.each(['accept', 'cancel'])('preserves an explicit request ID on %s', async (action) => {
		const id = `${url}/custom-follow-id`;
		await service.createFollowRequest(follower as any, followee as any, id);
		if (action === 'accept') {
			await service.acceptFollowRequest(followee as any, follower as any);
			await service.unfollow(follower as any, followee as any, true);
		} else {
			await service.cancelFollowRequest(followee as any, follower as any);
		}
		expect(deliver.mock.calls.at(-1)?.[1]).toMatchObject({ id: `${id}/undo`, object: { id } });
	});

	test('does not deliver an Undo for a missing request', async () => {
		await expect(service.cancelFollowRequest(followee as any, follower as any)).rejects.toThrow('request not found');
		expect(deliver).not.toHaveBeenCalled();
	});

	test('legacy following keeps its object reference but gets a relationship-specific Undo ID', async () => {
		followings.set('pair', { id: 'legacy', requestId: null, follower, followee });
		await service.unfollow(follower as any, followee as any, true);
		expect(deliver.mock.calls.at(-1)?.[1]).toMatchObject({
			id: `${url}/follows/legacy/undo`, object: { id: `${url}/follows/alice/bob` },
		});
	});
});
