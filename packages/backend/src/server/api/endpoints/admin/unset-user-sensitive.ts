/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { QueueService } from '@/core/QueueService.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:suspend-user',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'f172d8f7-ccbb-4997-af6d-62184e7b989a',
		},
		cannotChangeSensitiveOfAdministrator: {
			message: 'Cannot change the sensitive flag of an administrator.',
			code: 'CANNOT_CHANGE_SENSITIVE_OF_ADMINISTRATOR',
			id: '5af0bc1d-4f75-4f97-a6f6-5979f8ed1c98',
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
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private roleService: RoleService,
		private moderationLogService: ModerationLogService,
		private queueService: QueueService,
		private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			if (await this.roleService.isAdministrator(user)) {
				throw new ApiError(meta.errors.cannotChangeSensitiveOfAdministrator);
			}

			await this.userProfilesRepository.update(user.id, {
				isSensitive: false,
			});
			await this.cacheService.userProfileCache.delete(user.id);

			await this.usersRepository.update(user.id, {
				isSensitive: false,
			});

			this.moderationLogService.log(me, 'setSensitive', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});
		});
	}
}
