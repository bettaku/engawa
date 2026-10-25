import { strictEqual, rejects } from 'node:assert';
import * as Misskey from 'cherrypick-js';
import { createAccount, fetchAdmin, resolveRemoteUser, resolveRemoteNote, sleep, type LoginUser } from './utils.js';

const [aAdmin, bAdmin, cAdmin] = await Promise.all([
	fetchAdmin('a.test'),
	fetchAdmin('b.test'),
	fetchAdmin('c.test'),
]);

describe('Authorized Fetch', () => {
	let alice: LoginUser, bob: LoginUser, charlie: LoginUser;
	let aliceInB: Misskey.entities.UserDetailedNotMe, aliceInC: Misskey.entities.UserDetailedNotMe, bobInA: Misskey.entities.UserDetailedNotMe, bobInC: Misskey.entities.UserDetailedNotMe, charlieInA: Misskey.entities.UserDetailedNotMe, charlieInB: Misskey.entities.UserDetailedNotMe;
	beforeAll(async () => {
		[alice, bob, charlie] = await Promise.all([
			createAccount('a.test'),
			createAccount('b.test'),
			createAccount('c.test'),
		]);

		// Each server lazily creates its ActivityPub signing accounts on the first
		// remote fetch. Resolving all users concurrently can race that creation.
		aliceInB = await resolveRemoteUser('a.test', alice.id, bob);
		aliceInC = await resolveRemoteUser('a.test', alice.id, charlie);
		bobInA = await resolveRemoteUser('b.test', bob.id, alice);
		bobInC = await resolveRemoteUser('b.test', bob.id, charlie);
		charlieInA = await resolveRemoteUser('c.test', charlie.id, alice);
		charlieInB = await resolveRemoteUser('c.test', charlie.id, bob);
	});

	test('signed requests are required', async () => {
		await aAdmin.client.request('admin/update-meta', {
			enableAuthorizedFetch: true,
		});
		await sleep();

		const note = (await alice.client.request('notes/create', { text: 'Protected Note' })).createdNote;
		await sleep();

		// 自動で署名されるので通るはず
		const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
		strictEqual(resolvedNote.text, note.text);

		await aAdmin.client.request('admin/update-meta', {
			enableAuthorizedFetch: false,
		});
		await sleep();
	});

	test('reject signed requests if blocked', async () => {
		await aAdmin.client.request('admin/update-meta', {
			enableAuthorizedFetch: true,
		});
		await sleep();

		await aAdmin.client.request('admin/federation/update-instance', {
			host: 'b.test',
			isSuspended: true,
		});
		await sleep();

		await aAdmin.client.request('admin/update-meta', {
			blockedHosts: ['b.test'],
		});
		await sleep();

		const note = (await alice.client.request('notes/create', { text: 'Protected Note' })).createdNote;
		await sleep();

		await rejects(
			async () => await resolveRemoteNote('a.test', note.id, bob),
			(err: any) => {
				if (err.code === 'REQUEST_FAILED') {
					return true;
				}
				console.error('Unexpected error:', err);
				return false;
			},
		);

		await aAdmin.client.request('admin/update-meta', {
			enableAuthorizedFetch: false,
		});
		await sleep();

		await aAdmin.client.request('admin/update-meta', {
			blockedHosts: [],
		});
		await aAdmin.client.request('admin/federation/update-instance', {
			host: 'b.test',
			isSuspended: false,
		});
		await sleep();
	});

	test('renote from b.test of a.test note is note deliverd to c.test', async () => {
		await aAdmin.client.request('admin/update-meta', {
			enableAuthorizedFetch: true,
			blockedHosts: ['c.test'],
		});
		await sleep();

		await bob.client.request('following/create', {
			userId: aliceInB.id,
		});
		await bob.client.request('following/create', {
			userId: charlieInB.id,
		});
		await sleep();

		await alice.client.request('following/create', {
			userId: bobInA.id,
		});
		await sleep();

		await charlie.client.request('following/create', {
			userId: bobInC.id,
		});
		await sleep();

		const aliceNote = (await alice.client.request('notes/create', { text: 'Protected Note' })).createdNote;
		await sleep();

		const bobsView = await resolveRemoteNote('a.test', aliceNote.id, bob);
		strictEqual(bobsView.text, aliceNote.text);

		await bob.client.request('notes/create', {
			renoteId: bobsView.id,
		});
		await sleep(3000);

		const charlieTimeline = await charlie.client.request('notes/timeline', {
			limit: 20,
		});

		const charlieHasAliceNote = charlieTimeline.some((note: Misskey.entities.Note) => {
			return note.renote && (note.renote.text === aliceNote.text );
		});

		strictEqual(charlieHasAliceNote, false);

		await aAdmin.client.request('admin/update-meta', {
			enableAuthorizedFetch: false,
			blockedHosts: [],
		});
		await sleep();

		await bob.client.request('following/delete', {
			userId: aliceInB.id,
		});
		await sleep();
		await bob.client.request('following/delete', {
			userId: charlieInB.id,
		});
		await sleep();
		await alice.client.request('following/delete', {
			userId: bobInA.id,
		});
		await sleep();
		await charlie.client.request('following/delete', {
			userId: bobInC.id,
		});
		await sleep();
	});
});
