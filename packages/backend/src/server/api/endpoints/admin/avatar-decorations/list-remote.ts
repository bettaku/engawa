/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageAvatarDecorations',
	kind: 'read:admin:avatar-decorations',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
					example: 'xxxxxxxxxx',
				},
				createdAt: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				updatedAt: {
					type: 'string',
					optional: false, nullable: true,
					format: 'date-time',
				},
				name: {
					type: 'string',
					optional: false, nullable: false,
				},
				description: {
					type: 'string',
					optional: false, nullable: false,
				},
				url: {
					type: 'string',
					optional: false, nullable: false,
				},
				roleIdsThatCanBeUsedThisDecoration: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							id: {
								type: 'string',
								optional: false, nullable: false,
								format: 'id',
							},
							name: {
								type: 'string',
								optional: false, nullable: false,
							},
						},
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		host: { type: 'string', nullable: true, default: null, description: 'Use `null` to represent the local host.' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		private avatarDecorationService: AvatarDecorationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const avatarDecorations = await this.avatarDecorationService.getAllPagenatedByAdmin(ps.limit, true, ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate, ps.host);

			return avatarDecorations;
		});
	}
}
