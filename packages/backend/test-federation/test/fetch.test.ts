import { strictEqual, rejects } from 'node:assert';
import * as Misskey from 'cherrypick-js';
import { createAccount, fetchAdmin, resolveRemoteUser, resolveRemoteNote, sleep, type LoginUser } from './utils.js';

const [aAdmin, bAdmin] = await Promise.all([
	fetchAdmin('a.test'),
	fetchAdmin('b.test'),
]);

describe('Authorized Fetch', () => {
	let alice: LoginUser, bob: LoginUser;
	let aliceInB, bobInA;
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
});
