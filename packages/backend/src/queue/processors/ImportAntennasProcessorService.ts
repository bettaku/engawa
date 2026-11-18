/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import _Ajv from 'ajv';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import Logger from '@/logger.js';
import type { AntennasRepository, DriveFilesRepository, MiUser } from '@/models/_.js';
import { DownloadService } from '@/core/DownloadService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { Schema, SchemaType } from '@/misc/json-schema.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { DBAntennaImportJobData } from '../types.js';
import type * as Bull from 'bullmq';

const Ajv = _Ajv.default;

const exportedAntennaSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: ['home', 'all', 'users', 'list', 'users_blacklist'] },
		userListAccts: {
			type: 'array',
			items: {
				type: 'string',
			},
			nullable: true,
		},
		keywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		excludeKeywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		users: { type: 'array', items: {
			type: 'string',
		} },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
		excludeNotesInSensitiveChannel: { type: 'boolean' },
	},
	required: ['name', 'src', 'keywords', 'excludeKeywords', 'users', 'caseSensitive', 'withReplies', 'withFile'],
} as const satisfies Schema;

export type ExportedAntenna = SchemaType<typeof exportedAntennaSchema>;

const validate = new Ajv().compile<ExportedAntenna>(exportedAntennaSchema);

@Injectable()
export class ImportAntennasProcessorService {
	private logger: Logger;

	constructor (
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private downloadService: DownloadService,

		private queueLoggerService: QueueLoggerService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('import-antennas');
	}

	@bindThis
	public async process(job: Bull.Job<DBAntennaImportJobData>): Promise<string> {
		const userId = job.data.user.id;

		let antennas: unknown;
		if (job.data.v === 2) {
			// v2: ファイルのIDだけを受け取り、中身は処理時にドライブから読む
			const file = await this.driveFilesRepository.findOneBy({ id: job.data.fileId, userId });
			if (file == null) return 'skip: file not found';
			try {
				antennas = JSON.parse(await this.downloadService.downloadTextFile(file.url));
			} catch (err) {
				this.logger.warn(`Failed to read the antennas file: ${file.id}`, { error: err });
				return 'skip: failed to read the file';
			}
		} else {
			antennas = job.data.antenna;
		}

		if (!Array.isArray(antennas)) {
			this.logger.warn('Validation Failed: not an array');
			return 'skip: not an array';
		}

		await this.importAntennas(userId, antennas);
		return 'ok';
	}

	@bindThis
	private async importAntennas(userId: MiUser['id'], antennas: unknown[]): Promise<void> {
		const now = new Date();
		try {
			for (const antenna of antennas) {
				if (!validate(antenna)) {
					this.logger.warn('Validation Failed');
					continue;
				}
				if (antenna.keywords.length === 0 || antenna.keywords[0].every(x => x === '')) continue;
				const result = await this.antennasRepository.insertOne({
					id: this.idService.gen(now.getTime()),
					lastUsedAt: now,
					userId,
					name: antenna.name,
					src: antenna.src === 'list' && antenna.userListAccts ? 'users' : antenna.src,
					userListId: null,
					keywords: antenna.keywords,
					excludeKeywords: antenna.excludeKeywords,
					users: (antenna.src === 'list' && antenna.userListAccts != null ? antenna.userListAccts : antenna.users).filter(Boolean),
					caseSensitive: antenna.caseSensitive,
					localOnly: antenna.localOnly,
					excludeBots: antenna.excludeBots,
					withReplies: antenna.withReplies,
					withFile: antenna.withFile,
					excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
				});
				this.logger.succ('Antenna created: ' + result.id);
				this.globalEventService.publishInternalEvent('antennaCreated', result);
			}
		} catch (err: any) {
			this.logger.error(err);
		}
	}
}
