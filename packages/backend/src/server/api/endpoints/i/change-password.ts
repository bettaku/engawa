/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { hashPassword, comparePassword } from '@/misc/password.js';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { TwoFactorAuthenticationError, UserAuthService } from '@/core/UserAuthService.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		twoFactorAuthenticationFailed: {
			message: 'Two-factor authentication failed.',
			code: 'TWO_FACTOR_AUTHENTICATION_FAILED',
			id: '1714a23d-a4ab-46ff-b229-8b66069e9bf4',
		},
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '41704ee9-ec74-4e1e-93e7-f40909bfa593',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		currentPassword: { type: 'string' },
		newPassword: { type: 'string', minLength: 1 },
		token: { type: 'string', nullable: true },
	},
	required: ['currentPassword', 'newPassword'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userAuthService: UserAuthService,
		private cacheService: CacheService,
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

			const passwordMatched = await comparePassword(ps.currentPassword, profile.password!);

			if (!passwordMatched) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			// Generate hash of password
			const hash = await hashPassword(ps.newPassword);

			await this.userProfilesRepository.update(me.id, {
				password: hash,
			});
			await this.cacheService.userProfileCache.delete(me.id);
		});
	}
}
