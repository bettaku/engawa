/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { ApInboxService } from '@/core/activitypub/ApInboxService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type {
	ChatRoomsRepository,
	ChatRoomInvitationsRepository,
	ChatRoomMembershipsRepository,
	UsersRepository,
	UserProfilesRepository,
	MiUser,
} from '@/models/_.js';
import type { MiRemoteUser } from '@/models/User.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

/**
 * Regression tests for the ActivityPub chat-federation authority-confusion fixes.
 *
 * The chat inbox handlers used to extract a room id from an attacker-controlled
 * remote URI with the host discarded, and looked rooms up by that bare id. Because
 * local and remote rooms shared one id namespace, a signed remote actor could target
 * a genuine local room. The fixes bind the room to its origin (uri/host columns) and
 * require a genuine invitation before a remote user may join.
 */
describe('ApInboxService (chat federation)', () => {
	let app: TestingModule;
	let inboxService: ApInboxService;
	let idService: IdService;
	let config: Config;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let chatRoomsRepository: ChatRoomsRepository;
	let chatRoomInvitationsRepository: ChatRoomInvitationsRepository;
	let chatRoomMembershipsRepository: ChatRoomMembershipsRepository;

	const remoteHost = 'remote.test';

	async function createLocalUser(): Promise<MiUser> {
		const un = secureRndstr(16);
		const inserted = await usersRepository.insert({
			id: idService.gen(),
			username: un,
			usernameLower: un.toLowerCase(),
			host: null,
			uri: null,
		});
		const user = await usersRepository.findOneByOrFail(inserted.identifiers[0]);
		// Real users always have a profile; notification handling depends on it.
		await userProfilesRepository.insert({ userId: user.id });
		return user;
	}

	async function createRemoteUser(host = remoteHost): Promise<MiRemoteUser> {
		const un = secureRndstr(16);
		const uri = `https://${host}/users/${un.toLowerCase()}`;
		const inserted = await usersRepository.insert({
			id: idService.gen(),
			username: un,
			usernameLower: un.toLowerCase(),
			host,
			uri,
			inbox: `${uri}/inbox`,
		});
		const user = await usersRepository.findOneByOrFail(inserted.identifiers[0]);
		await userProfilesRepository.insert({ userId: user.id, userHost: host });
		return user as MiRemoteUser;
	}

	function createLocalRoom(owner: MiUser) {
		return chatRoomsRepository.insertOne({
			id: idService.gen(),
			name: 'local room',
			description: '',
			ownerId: owner.id,
			isArchived: false,
		});
	}

	function localRoomUri(roomId: string): string {
		return `${config.url}/chat/rooms/${roomId}`;
	}

	function localUserUri(userId: string): string {
		return `${config.url}/users/${userId}`;
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		}).compile();

		await app.init();
		app.enableShutdownHooks();

		inboxService = app.get<ApInboxService>(ApInboxService);
		idService = app.get<IdService>(IdService);
		config = app.get<Config>(DI.config);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		chatRoomsRepository = app.get(DI.chatRoomsRepository);
		chatRoomInvitationsRepository = app.get(DI.chatRoomInvitationsRepository);
		chatRoomMembershipsRepository = app.get(DI.chatRoomMembershipsRepository);

		// invite() fires a fire-and-forget notification; stub it so tests have no side effects.
		const notificationService = app.get<NotificationService>(NotificationService);
		jest.spyOn(notificationService, 'createNotification').mockImplementation(async () => null as any);
	});

	afterAll(async () => {
		await app.close();
	});

	describe('acceptInvite', () => {
		// acceptInvite is normally reached via accept(), which first does a network
		// resolver.resolve() of the object. We call the handler directly to isolate the
		// authorization logic under test.
		test('rejects a cross-host room URI that points at a local room', async () => {
			const owner = await createLocalUser();
			const room = await createLocalRoom(owner);
			const attacker = await createRemoteUser();

			// The room id belongs to a genuine local room, but the attacker wraps it in
			// a URI on their own host.
			const inviteObject = {
				type: 'Invite',
				object: { id: `https://${remoteHost}/chat/rooms/${room.id}`, type: 'Group' },
			};

			const result = await (inboxService as any).acceptInvite(attacker, inviteObject);
			assert.strictEqual(result, 'skip: room is not local');

			const membership = await chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: attacker.id });
			assert.strictEqual(membership, null);
		});

		test('refuses to create a membership when no invitation exists', async () => {
			const owner = await createLocalUser();
			const room = await createLocalRoom(owner);
			const attacker = await createRemoteUser();

			const inviteObject = {
				type: 'Invite',
				object: { id: localRoomUri(room.id), type: 'Group' },
			};

			const result = await (inboxService as any).acceptInvite(attacker, inviteObject);
			assert.strictEqual(result, 'skip: no invitation exists');

			const membership = await chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: attacker.id });
			assert.strictEqual(membership, null);
		});

		test('creates a membership when a genuine invitation exists and consumes it', async () => {
			const owner = await createLocalUser();
			const room = await createLocalRoom(owner);
			const remote = await createRemoteUser();

			await chatRoomInvitationsRepository.insert({
				id: idService.gen(),
				roomId: room.id,
				userId: remote.id,
			});

			const inviteObject = {
				type: 'Invite',
				object: { id: localRoomUri(room.id), type: 'Group' },
			};

			const result = await (inboxService as any).acceptInvite(remote, inviteObject);
			assert.strictEqual(result, 'ok');

			const membership = await chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: remote.id });
			assert.notStrictEqual(membership, null);

			const invitation = await chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: remote.id });
			assert.strictEqual(invitation, null);
		});
	});

	describe('invite', () => {
		test('rejects when the room host does not match the actor host (e.g. a local room)', async () => {
			const invitee = await createLocalUser();
			const owner = await createLocalUser();
			const room = await createLocalRoom(owner);
			const attacker = await createRemoteUser();

			const activity = {
				type: 'Invite',
				actor: attacker.uri,
				object: { id: localRoomUri(room.id), type: 'Group' },
				target: localUserUri(invitee.id),
			};

			const result = await inboxService.performOneActivity(attacker, activity as any);
			assert.strictEqual(result, 'skip: room host mismatch');

			const invitation = await chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: invitee.id });
			assert.strictEqual(invitation, null);
		});

		test('mirrors a remote room with a locally-generated id and ignores a spoofed local owner', async () => {
			const invitee = await createLocalUser();
			const localVictimOwner = await createLocalUser();
			const attacker = await createRemoteUser();

			// attacker-chosen id in the path; must NOT become the local primary key
			const remoteRoomId = secureRndstr(10, { chars: '0123456789abcdefghijklmnopqrstuvwxyz' });
			const roomUri = `https://${remoteHost}/chat/rooms/${remoteRoomId}`;

			const activity = {
				type: 'Invite',
				actor: attacker.uri,
				object: {
					id: roomUri,
					type: 'Group',
					name: 'remote room',
					// attacker tries to make a local user the owner
					attributedTo: localUserUri(localVictimOwner.id),
				},
				target: localUserUri(invitee.id),
			};

			const result = await inboxService.performOneActivity(attacker, activity as any);
			assert.strictEqual(result, 'ok');

			const room = await chatRoomsRepository.findOneByOrFail({ uri: roomUri });
			// primary key is generated locally, never the attacker-supplied path id
			assert.notStrictEqual(room.id, remoteRoomId);
			assert.strictEqual(room.host, remoteHost);
			// the spoofed local owner is ignored; ownership falls back to the inviting remote actor
			assert.strictEqual(room.ownerId, attacker.id);
			assert.notStrictEqual(room.ownerId, localVictimOwner.id);

			// no local room may have been planted under the attacker-chosen id
			const collision = await chatRoomsRepository.findOneBy({ id: remoteRoomId });
			assert.strictEqual(collision, null);

			// the legitimate invitation to the local invitee is created
			const invitation = await chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: invitee.id });
			assert.notStrictEqual(invitation, null);
		});
	});

	describe('remove', () => {
		test('a cross-host target URI cannot remove a membership from a local room', async () => {
			const owner = await createLocalUser();
			const room = await createLocalRoom(owner);
			const member = await createRemoteUser();

			await chatRoomMembershipsRepository.insert({
				id: idService.gen(),
				roomId: room.id,
				userId: member.id,
			});

			const activity = {
				type: 'Remove',
				actor: member.uri,
				target: `https://${remoteHost}/chat/rooms/${room.id}`,
			};

			const result = await inboxService.performOneActivity(member, activity as any);
			assert.strictEqual(result, 'room not found');

			// membership on the genuine local room is untouched
			const membership = await chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: member.id });
			assert.notStrictEqual(membership, null);
		});
	});
});
