/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as OTPAuth from 'otpauth';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'object',
		properties: {
			backupCodes: {
				type: 'array',
				optional: false,
				items: {
					type: 'string',
				},
			},
		},
	},

	errors: {
		twoFactorSetupNotStarted: {
			message: 'Two-factor authentication setup has not been started.',
			code: 'TWO_FACTOR_SETUP_NOT_STARTED',
			id: '2d4eaad5-6c99-4c79-ab93-6d067831994d',
		},
		invalidOtp: {
			message: 'The one-time password is invalid.',
			code: 'INVALID_OTP',
			id: '8583a999-00a6-48e8-acf0-a77b529f1147',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		token: { type: 'string' },
	},
	required: ['token'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const token = ps.token.replace(/\s/g, '');

			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (profile.twoFactorTempSecret == null) {
				throw new ApiError(meta.errors.twoFactorSetupNotStarted);
			}

			const delta = OTPAuth.TOTP.validate({
				secret: OTPAuth.Secret.fromBase32(profile.twoFactorTempSecret),
				digits: 6,
				token,
				window: 5,
			});

			if (delta === null) {
				throw new ApiError(meta.errors.invalidOtp);
			}

			const backupCodes = Array.from({ length: 5 }, () => new OTPAuth.Secret().base32);

			await this.userProfilesRepository.update(me.id, {
				twoFactorSecret: profile.twoFactorTempSecret,
				twoFactorBackupSecret: backupCodes,
				twoFactorEnabled: true,
			});
			await this.cacheService.userProfileCache.delete(me.id);

			// Publish meUpdated event
			this.globalEventService.publishMainStream(me.id, 'meUpdated', await this.userEntityService.pack(me.id, me, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));

			return {
				backupCodes: backupCodes,
			};
		});
	}
}
