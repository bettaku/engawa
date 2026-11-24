/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { InstancesRepository } from '@/models/_.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:federation',

	errors: {
		noSuchInstance: {
			message: 'No such instance.',
			code: 'NO_SUCH_INSTANCE',
			id: '7de9f145-2084-4012-b98b-d95a52eddfbc',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
	},
	required: ['host'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private utilityService: UtilityService,
		private fetchInstanceMetadataService: FetchInstanceMetadataService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.instancesRepository.findOneBy({ host: this.utilityService.toPuny(ps.host) });

			if (instance == null) {
				throw new ApiError(meta.errors.noSuchInstance);
			}

			this.fetchInstanceMetadataService.fetchInstanceMetadata(instance, true);
		});
	}
}
