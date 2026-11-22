/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import si from 'systeminformation';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 1,

	tags: ['meta'],
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			machine: {
				optional: false,
				type: 'string',
				nullable: false,
			},
			cpu: {
				optional: false,
				type: 'object',
				nullable: false,
				properties: {
					model: {
						optional: false,
						type: 'string',
						nullable: false,
					},
					cores: {
						optional: false,
						type: 'number',
						nullable: false,
					},
				},
			},
			mem: {
				optional: false,
				type: 'object',
				properties: {
					total: {
						optional: false,
						type: 'number',
						nullable: false,
					},
				},
			},
			fs: {
				optional: false,
				type: 'object',
				nullable: false,
				properties: {
					total: {
						optional: false,
						type: 'number',
						nullable: false,
					},
					used: {
						optional: false,
						type: 'number',
						nullable: false,
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,
	) {
		super(meta, paramDef, async () => {
			if (!this.serverSettings.enableServerMachineStats) return {
				machine: '?',
				cpu: {
					model: '?',
					cores: 0,
				},
				mem: {
					total: 0,
				},
				fs: {
					total: 0,
					used: 0,
				},
			};

			const memStats = await si.mem();
			const fsStats = await si.fsSize();

			return {
				machine: os.hostname(),
				cpu: {
					model: os.cpus()[0].model,
					cores: os.cpus().length,
				},
				mem: {
					total: memStats.total,
				},
				fs: {
					total: fsStats[0].size,
					used: fsStats[0].used,
				},
			};
		});
	}
}
