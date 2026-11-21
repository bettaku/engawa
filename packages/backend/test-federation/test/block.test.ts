import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import * as Misskey from 'cherrypick-js';
import { assertNotificationReceived, createAccount, type LoginUser, resolveRemoteNote, resolveRemoteUser, sleep, waitFor } from './utils.js';

describe('Block', () => {
	describe('Check follow', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot follow if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();
			await rejects(
				async () => await bob.client.request('following/create', { userId: aliceInB.id }),
				(err: any) => {
					strictEqual(err.code, 'BLOCKED');
					return true;
				},
			);

			const following = await bob.client.request('users/following', { userId: bob.id });
			strictEqual(following.length, 0);
			const followers = await alice.client.request('users/followers', { userId: alice.id });
			strictEqual(followers.length, 0);
		});

		// ブロックの解除はキューのプロセスが受け取るので、以前はAPIのプロセスのキャッシュが古いまま残り、解除後もフォローできなかった
		test('Can follow if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			await bob.client.request('following/create', { userId: aliceInB.id });

			const following = await waitFor(
				async () => await bob.client.request('users/following', { userId: bob.id }),
				following => following.length > 0,
			);
			strictEqual(following.length, 1);
			const followers = await waitFor(
				async () => await alice.client.request('users/followers', { userId: alice.id }),
				followers => followers.length > 0,
			);
			strictEqual(followers.length, 1);
		});

		test.skip('Remove follower when block them', async () => {
			test('before block', async () => {
				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 1);
				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 1);
			});

			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			test('after block', async () => {
				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 0);
				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 0);
			});
		});
	});

	describe('Check reply', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot reply if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			await rejects(
				async () => await bob.client.request('notes/create', { text: 'b', replyId: resolvedNote.id }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
		});

		test('Can reply if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			const reply = (await bob.client.request('notes/create', { text: 'b', replyId: resolvedNote.id })).createdNote;

			await resolveRemoteNote('b.test', reply.id, alice);
		});
	});

	describe('Check reaction', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot reaction if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			await rejects(
				async () => await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
		});

		// 同上。以前は解除後もリアクションできなかった
		test('Can reaction if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' });

			const reactions = await waitFor(
				async () => await alice.client.request('notes/reactions', { noteId: note.id }),
				reactions => reactions.length > 0,
			);
			strictEqual(reactions.length, 1);
			strictEqual(reactions[0].type, '😅');
		});
	});

	describe('Check mention', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		/** NOTE: You should mute the target to stop receiving notifications */
		test('Can mention and notified even if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			const text = `@${alice.username}@a.test plz unblock me!`;
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('notes/create', { text }),
				notification => notification.type === 'mention' && notification.userId === bobInA.id && notification.note.text === text,
				false, // ミュートしてるので
			);
		});
	});
});
