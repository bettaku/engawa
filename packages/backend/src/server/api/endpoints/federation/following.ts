/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { FollowingsRepository } from '@/models/_.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { QueryService } from '@/core/QueryService.js';
import { FollowingEntityService } from '@/core/entities/FollowingEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Following',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['host'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private followingEntityService: FollowingEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.followingsRepository.createQueryBuilder('following'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('following.followerHost = :host', { host: ps.host })
				// フォロー・フォロワーの公開範囲を「公開」にしていない利用者の関係は、当事者にしか返さない
				.innerJoin(MiUserProfile, 'followeeProfile', 'followeeProfile.userId = following.followeeId')
				.innerJoin(MiUserProfile, 'followerProfile', 'followerProfile.userId = following.followerId')
				.andWhere(new Brackets(qb => {
					qb.where(new Brackets(qb => {
						qb
							.where('followeeProfile.followersVisibility = \'public\'')
							.andWhere('followerProfile.followingVisibility = \'public\'');
					}));
					if (me != null) {
						qb
							.orWhere('following.followeeId = :meId', { meId: me.id })
							.orWhere('following.followerId = :meId', { meId: me.id });
					}
				}));

			const followings = await query
				.limit(ps.limit)
				.getMany();

			return await this.followingEntityService.packMany(followings, me, { populateFollowee: true });
		});
	}
}
