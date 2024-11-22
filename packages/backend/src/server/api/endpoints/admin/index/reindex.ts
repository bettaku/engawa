/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SearchService } from '@/core/SearchService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:index:full',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		index: {
			type: 'string',
			enum: ['all', 'notes', 'users'],
		},
	},
	required: ['index'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		private searchService: SearchService,
	) {
		super(meta, paramDef, async (ps, me) => {
			switch (ps.index) {
				case 'all':
					this.searchService.reindexNote();
					this.searchService.reindexUser();
					break;
				case 'notes':
					this.searchService.reindexNote();
					break;
				case 'users':
					this.searchService.reindexUser();
					break;
			}
		});
	}
}
