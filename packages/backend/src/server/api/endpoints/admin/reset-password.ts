/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository, UserProfilesRepository, MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { hashPassword } from '@/misc/password.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:reset-password',

	errors: {
		cannotResetPasswordOfAdmin: {
			message: 'Only administrators can reset the password of an administrator.',
			code: 'CANNOT_RESET_PASSWORD_OF_ADMIN',
			id: '6c2f1c1b-2a0e-4b2a-8d1f-0b7f0f6f2c35',
			kind: 'permission',
			httpStatusCode: 403,
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			password: {
				type: 'string',
				optional: false, nullable: false,
				minLength: 16,
				maxLength: 16,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private moderationLogService: ModerationLogService,
		private roleService: RoleService,
		private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new Error('user not found');
			}

			if (this.serverSettings.rootUserId === user.id) {
				throw new Error('cannot reset password of root');
			}

			// 管理者のパスワードは管理者にしか再設定させない（モデレーターが管理者になりすませないようにする）
			if (await this.roleService.isAdministrator(user) && !(await this.roleService.isAdministrator(me))) {
				throw new ApiError(meta.errors.cannotResetPasswordOfAdmin);
			}

			const passwd = secureRndstr(16);

			// Generate hash of password
			const hash = await hashPassword(passwd);

			await this.userProfilesRepository.update({
				userId: user.id,
			}, {
				password: hash,
			});
			await this.cacheService.userProfileCache.delete(user.id);

			this.moderationLogService.log(me, 'resetPassword', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});

			return {
				password: passwd,
			};
		});
	}
}
