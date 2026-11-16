/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';
import type { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type { Packed } from '@/misc/json-schema.js';

type Note = Packed<'Note'>;

function note(id: string, props: Partial<Note> = {}): Note {
	return {
		id,
		userId: `user-${id}`,
		text: `text of ${id}`,
		cw: null,
		fileIds: [],
		files: [],
		visibility: 'public',
		...props,
	} as Note;
}

/** hiddenIds に含まれるノートを「隠すべき」と判定する NoteEntityService の代役 */
function createService(hiddenIds: string[]) {
	const noteEntityService = {
		shouldHideNote: async (n: Note) => hiddenIds.includes(n.id),
		hideNote: (n: Note) => {
			n.text = null;
			n.cw = null;
			n.fileIds = [];
			n.files = [];
			n.poll = undefined;
			n.event = undefined;
			n.isHidden = true;
		},
	} as unknown as NoteEntityService;
	return new NoteStreamingHidingService(noteEntityService);
}

describe('NoteStreamingHidingService', () => {
	test('隠すものがなければ元のノートをそのまま返す', async () => {
		const n = note('a', { reply: note('b'), replyId: 'b' });
		expect(await createService([]).filter(n, null)).toBe(n);
	});

	test('返信先が隠すべきノートなら、返信先の内容を隠す', async () => {
		const n = note('a', { reply: note('b'), replyId: 'b' });
		const filtered = await createService(['b']).filter(n, null);

		expect(filtered).not.toBeNull();
		expect(filtered?.text).toBe('text of a');
		expect(filtered?.reply?.text).toBeNull();
		expect(filtered?.reply?.isHidden).toBe(true);
		// 元のノートは書き換えない
		expect(n.reply?.text).toBe('text of b');
	});

	test('引用元の返信先のように、返信とリノートが入れ子でも隠す', async () => {
		const n = note('a', {
			text: 'quote',
			renoteId: 'b',
			renote: note('b', { replyId: 'c', reply: note('c', { renoteId: 'd', renote: note('d') }) }),
		});
		const filtered = await createService(['c', 'd']).filter(n, null);

		expect(filtered?.renote?.text).toBe('text of b');
		expect(filtered?.renote?.reply?.text).toBeNull();
		expect(filtered?.renote?.reply?.renote?.text).toBeNull();
	});

	test('純粋リノートのリノート元が隠すべきノートなら配信しない', async () => {
		const n = note('a', { text: null, renoteId: 'b', renote: note('b') });
		expect(await createService(['b']).filter(n, null)).toBeNull();
	});

	test('純粋リノートでも、隠すのがリノート元の返信先だけなら配信する', async () => {
		const n = note('a', { text: null, renoteId: 'b', renote: note('b', { replyId: 'c', reply: note('c') }) });
		const filtered = await createService(['c']).filter(n, null);

		expect(filtered).not.toBeNull();
		expect(filtered?.renote?.text).toBe('text of b');
		expect(filtered?.renote?.reply?.text).toBeNull();
	});

	test('引用元が隠すべきノートなら、引用元の内容だけを隠す', async () => {
		const n = note('a', { text: 'quote', renoteId: 'b', renote: note('b') });
		const filtered = await createService(['b']).filter(n, null);

		expect(filtered?.text).toBe('quote');
		expect(filtered?.renote?.text).toBeNull();
	});
});
