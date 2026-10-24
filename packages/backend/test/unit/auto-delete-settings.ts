/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import UpdateAutoDeleteSettings from '@/server/api/endpoints/i/update-auto-delete-settings.js';
import type { UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';

describe('auto-delete settings response', () => {
	const user = { id: 'user', token: 'native-secret' } as MiLocalUser;

	test.each([
		{ autoDeleteKeepFavorites: false },
		{ autoDeleteNotesAfterDays: null },
		{ autoDeleteNotesAfterDays: 30, autoDeleteKeepFavorites: true },
	])('persists settings without returning the user entity: %j', async (settings) => {
		const repository = {
			update: vi.fn().mockResolvedValue({ affected: 1 }),
			findOneByOrFail: vi.fn().mockResolvedValue(user),
		};
		const endpoint = new UpdateAutoDeleteSettings(repository as unknown as UsersRepository);
		const result = await endpoint.exec(settings, user, null, null);
		expect(repository.update).toHaveBeenCalledWith(user.id, settings);
		expect(result).toBeUndefined();
		expect(repository.findOneByOrFail).not.toHaveBeenCalled();
	});

	test('retains validation and does not persist invalid settings', async () => {
		const repository = { update: vi.fn() };
		const endpoint = new UpdateAutoDeleteSettings(repository as unknown as UsersRepository);
		await expect(endpoint.exec({ autoDeleteNotesAfterDays: 0 }, user, null, null))
			.rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(repository.update).not.toHaveBeenCalled();
	});
});
