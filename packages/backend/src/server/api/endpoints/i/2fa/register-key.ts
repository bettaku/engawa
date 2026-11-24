/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comparePassword } from '@/misc/password.js';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import { ApiError } from '@/server/api/error.js';
import { TwoFactorAuthenticationError, UserAuthService } from '@/core/UserAuthService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		twoFactorAuthenticationFailed: {
			message: 'Two-factor authentication failed.',
			code: 'TWO_FACTOR_AUTHENTICATION_FAILED',
			id: '21f272ca-aee2-4ac8-88ba-e2bccbd5fb68',
		},
		userNotFound: {
			message: 'User not found.',
			code: 'USER_NOT_FOUND',
			id: '652f899f-66d4-490e-993e-6606c8ec04c3',
		},

		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '38769596-efe2-4faf-9bec-abbb3f2cd9ba',
		},

		twoFactorNotEnabled: {
			message: '2fa not enabled.',
			code: 'TWO_FACTOR_NOT_ENABLED',
			id: 'bf32b864-449b-47b8-974e-f9a5468546f1',
		},
	},

	res: {
		type: 'object',
		nullable: false,
		optional: false,
		properties: {
			rp: {
				type: 'object',
				optional: false,
				properties: {
					id: {
						type: 'string',
						optional: true,
					},
				},
			},
			user: {
				type: 'object',
				optional: false,
				properties: {
					id: {
						type: 'string',
						optional: false,
					},
					name: {
						type: 'string',
						optional: false,
					},
					displayName: {
						type: 'string',
						optional: false,
					},
				},
			},
			challenge: {
				type: 'string',
				optional: false,
			},
			pubKeyCredParams: {
				type: 'array',
				optional: false,
				items: {
					type: 'object',
					optional: false,
					properties: {
						type: {
							type: 'string',
							optional: false,
						},
						alg: {
							type: 'number',
							optional: false,
						},
					},
				},
			},
			timeout: {
				type: 'number',
				optional: true,
				nullable: true,
			},
			excludeCredentials: {
				type: 'array',
				optional: true,
				nullable: true,
				items: {
					type: 'object',
					optional: false,
					properties: {
						id: {
							type: 'string',
							optional: false,
						},
						type: {
							type: 'string',
							optional: false,
						},
						transports: {
							type: 'array',
							optional: true,
							items: {
								type: 'string',
								optional: false,
								enum: [
									'ble',
									'cable',
									'hybrid',
									'internal',
									'nfc',
									'smart-card',
									'usb',
								],
							},
						},
					},
				},
			},
			authenticatorSelection: {
				type: 'object',
				optional: true,
				nullable: true,
				properties: {
					authenticatorAttachment: {
						type: 'string',
						optional: true,
						enum: [
							'cross-platform',
							'platform',
						],
					},
					requireResidentKey: {
						type: 'boolean',
						optional: true,
					},
					userVerification: {
						type: 'string',
						optional: true,
						enum: [
							'discouraged',
							'preferred',
							'required',
						],
					},
				},
			},
			attestation: {
				type: 'string',
				optional: true,
				nullable: true,
				enum: [
					'direct',
					'enterprise',
					'indirect',
					'none',
					null,
				],
			},
			extensions: {
				type: 'object',
				optional: true,
				nullable: true,
				properties: {
					appid: {
						type: 'string',
						optional: true,
						nullable: true,
					},
					credProps: {
						type: 'boolean',
						optional: true,
						nullable: true,
					},
					hmacCreateSecret: {
						type: 'boolean',
						optional: true,
						nullable: true,
					},
				},
			},
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
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private webAuthnService: WebAuthnService,
		private userAuthService: UserAuthService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const token = ps.token;
			const profile = await this.userProfilesRepository.findOne({
				where: {
					userId: me.id,
				},
				relations: ['user'],
			});

			if (profile == null) {
				throw new ApiError(meta.errors.userNotFound);
			}

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

			const passwordMatched = await comparePassword(ps.password, profile.password ?? '');
			if (!passwordMatched) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			if (!profile.twoFactorEnabled) {
				throw new ApiError(meta.errors.twoFactorNotEnabled);
			}

			return await this.webAuthnService.initiateRegistration(
				me.id,
				profile.user?.username ?? me.id,
				profile.user?.name ?? undefined,
			);
		});
	}
}
