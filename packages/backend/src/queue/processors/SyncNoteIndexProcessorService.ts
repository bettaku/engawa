/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import type * as Bull from 'bullmq';
import type { DbSyncNoteIndexJobData } from '../types.js';

/**
 * ノートの検索索引を、実行時点のDBの状態に合わせる。
 */
@Injectable()
export class SyncNoteIndexProcessorService {
	constructor(
		private searchService: SearchService,
	) {
	}

	@bindThis
	public async process(job: Bull.Job<DbSyncNoteIndexJobData>): Promise<void> {
		await this.searchService.syncNoteIndex(job.data.noteId);
	}
}
