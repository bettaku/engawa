/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comparePassword } from '@/misc/password.js';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { DI } from '@/di-symbols.js';
import { UserAuthService } from '@/core/UserAuthService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		twoFactorAuthenticationFailed: {
			message: 'Two-factor authentication failed.',
			code: 'TWO_FACTOR_AUTHENTICATION_FAILED',
			id: '20f8e0fb-5b39-4e9b-810f-a48290239317',
		},
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: 'fb700b60-c9de-412f-bdc4-d14bc2edb676',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		password: { type: 'string' },
		token: { type: 'string', nullable: true },
	},
	required: ['password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userAuthService: UserAuthService,
		private deleteAccountService: DeleteAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const token = ps.token;
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (profile.twoFactorEnabled) {
				if (token == null) {
					throw new ApiError(meta.errors.twoFactorAuthenticationFailed);
				}

				try {
					await this.userAuthService.twoFactorAuthenticate(profile, token);
				} catch (e) {
					throw new ApiError(meta.errors.twoFactorAuthenticationFailed);
				}
			}

			const userDetailed = await this.usersRepository.findOneByOrFail({ id: me.id });
			if (userDetailed.isDeleted) {
				return;
			}

			const passwordMatched = await comparePassword(ps.password, profile.password!);
			if (!passwordMatched) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			await this.deleteAccountService.deleteAccount(me);
		});
	}
}
