import assert, { deepStrictEqual, strictEqual } from 'assert';
import * as Misskey from 'cherrypick-js';
import { addCustomEmoji, createAccount, type LoginUser, resolveRemoteUser, sleep, waitFor } from './utils.js';

describe('Emoji', () => {
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

		await bob.client.request('following/create', { userId: aliceInB.id });
		await sleep();
	});

	test('Custom emoji are delivered with Note delivery', async () => {
		const emoji = await addCustomEmoji('a.test');
		await alice.client.request('notes/create', { text: `I love :${emoji.name}:` });

		const notes = await waitFor(
			async () => await bob.client.request('notes/timeline', {}),
			notes => notes[0]?.text?.includes(emoji.name) ?? false,
		);
		const noteInB = notes[0];

		strictEqual(noteInB.text, `I love \u200b:${emoji.name}:\u200b`);
		assert(noteInB.emojis != null);
		assert(emoji.name in noteInB.emojis);
		strictEqual(noteInB.emojis[emoji.name], emoji.url);
	});

	test('Custom emoji are delivered with Reaction delivery', async () => {
		const emoji = await addCustomEmoji('a.test');
		const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
		const isTheNote = (n: Misskey.entities.Note | undefined) => n?.uri === `https://a.test/notes/${note.id}`;
		await waitFor(
			async () => await bob.client.request('notes/timeline', {}),
			notes => isTheNote(notes[0]),
		);

		await alice.client.request('notes/reactions/create', { noteId: note.id, reaction: `:${emoji.name}:` });

		const [noteInB] = await waitFor(
			async () => await bob.client.request('notes/timeline', {}),
			notes => isTheNote(notes[0]) && Object.keys(notes[0].reactions).length > 0,
		);
		deepStrictEqual(noteInB.reactions[`:${emoji.name}@a.test:`], 1);
		deepStrictEqual(noteInB.reactionEmojis[`${emoji.name}@a.test`], emoji.url);
	});

	test('Custom emoji are delivered with Profile delivery', async () => {
		const emoji = await addCustomEmoji('a.test');
		const renewedAlice = await alice.client.request('i/update', { name: `:${emoji.name}:` });

		const renewedaliceInB = await waitFor(
			async () => await bob.client.request('users/show', { userId: aliceInB.id }),
			user => user.name === renewedAlice.name,
		);
		strictEqual(renewedaliceInB.name, renewedAlice.name);
		assert(emoji.name in renewedaliceInB.emojis);
		strictEqual(renewedaliceInB.emojis[emoji.name], emoji.url);
	});

	test('Local-only custom emoji aren\'t delivered with Note delivery', async () => {
		const emoji = await addCustomEmoji('a.test', { localOnly: true });
		await alice.client.request('notes/create', { text: `I love :${emoji.name}:` });

		const notes = await waitFor(
			async () => await bob.client.request('notes/timeline', {}),
			notes => notes[0]?.text?.includes(emoji.name) ?? false,
		);
		const noteInB = notes[0];

		strictEqual(noteInB.text, `I love \u200b:${emoji.name}:\u200b`);
		// deepStrictEqual(noteInB.emojis, {}); // TODO: this fails (why?)
		deepStrictEqual({ ...noteInB.emojis }, {});
	});

	test('Local-only custom emoji aren\'t delivered with Reaction delivery', async () => {
		const emoji = await addCustomEmoji('a.test', { localOnly: true });
		const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
		const isTheNote = (n: Misskey.entities.Note | undefined) => n?.uri === `https://a.test/notes/${note.id}`;
		await waitFor(
			async () => await bob.client.request('notes/timeline', {}),
			notes => isTheNote(notes[0]),
		);

		await alice.client.request('notes/reactions/create', { noteId: note.id, reaction: `:${emoji.name}:` });

		const [noteInB] = await waitFor(
			async () => await bob.client.request('notes/timeline', {}),
			notes => isTheNote(notes[0]) && Object.keys(notes[0].reactions).length > 0,
		);
		deepStrictEqual({ ...noteInB.reactions }, { '❤': 1 });
		deepStrictEqual({ ...noteInB.reactionEmojis }, {});
	});

	test('Local-only custom emoji aren\'t delivered with Profile delivery', async () => {
		const emoji = await addCustomEmoji('a.test', { localOnly: true });
		const renewedAlice = await alice.client.request('i/update', { name: `:${emoji.name}:` });

		const renewedaliceInB = await waitFor(
			async () => await bob.client.request('users/show', { userId: aliceInB.id }),
			user => user.name === renewedAlice.name,
		);
		strictEqual(renewedaliceInB.name, renewedAlice.name);
		deepStrictEqual({ ...renewedaliceInB.emojis }, {});
	});
});
