/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { hashPassword } from '@/misc/password.js';
import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, PasswordResetRequestsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	tags: ['reset password'],

	requireCredential: false,

	description: 'Complete the password reset that was previously requested.',

	errors: {
		noSuchResetRequest: {
			message: 'No such password reset request.',
			code: 'NO_SUCH_RESET_REQUEST',
			id: 'dce6688c-7066-4d53-afad-f5e489332394',
		},
		expiredToken: {
			message: 'The password reset request has expired.',
			code: 'EXPIRED_TOKEN',
			id: '2412ddc7-f33d-426f-b2b4-ae54de75fd13',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		token: { type: 'string' },
		password: { type: 'string' },
	},
	required: ['token', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.passwordResetRequestsRepository)
		private passwordResetRequestsRepository: PasswordResetRequestsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private idService: IdService,
		private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const req = await this.passwordResetRequestsRepository.findOneBy({
				token: ps.token,
			});
			if (req == null) {
				throw new ApiError(meta.errors.noSuchResetRequest);
			}

			// 発行してから30分以上経過していたら無効
			if (Date.now() - this.idService.parse(req.id).date.getTime() > 1000 * 60 * 30) {
				throw new ApiError(meta.errors.expiredToken);
			}

			// Generate hash of password
			const hash = await hashPassword(ps.password);

			await this.userProfilesRepository.update(req.userId, {
				password: hash,
			});
			await this.cacheService.userProfileCache.delete(req.userId);

			this.passwordResetRequestsRepository.delete(req.id);
		});
	}
}
