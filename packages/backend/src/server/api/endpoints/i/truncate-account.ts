/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//import bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { TruncateAccountService } from '@/core/TruncateAccountService.js';
import { DI } from '@/di-symbols.js';
import { TwoFactorAuthenticationError, UserAuthService } from '@/core/UserAuthService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		twoFactorAuthenticationFailed: {
			message: 'Two-factor authentication failed.',
			code: 'TWO_FACTOR_AUTHENTICATION_FAILED',
			id: '1ad97594-b67e-452c-a8c3-cb891e9e51bd',
		},
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '78874124-8031-41b3-8767-2dd30ca9de22',
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
		private truncateAccountService: TruncateAccountService,
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
					// コードの不一致だけを認証の失敗にする。DB・Redisの障害はそのまま500にする
					if (e instanceof TwoFactorAuthenticationError) throw new ApiError(meta.errors.twoFactorAuthenticationFailed);
					throw e;
				}
			}

			const userDetailed = await this.usersRepository.findOneByOrFail({ id: me.id });
			if (userDetailed.isDeleted) {
				return;
			}

			const passwordMatched = await argon2.verify(profile.password!, ps.password);
			if (!passwordMatched) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			await this.truncateAccountService.truncateAccount(me);
		});
	}
}
