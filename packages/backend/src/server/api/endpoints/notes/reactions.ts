/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, type FindOptionsWhere } from 'typeorm';
import type { NoteReactionsRepository, NotesRepository } from '@/models/_.js';
import type { MiNoteReaction } from '@/models/NoteReaction.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteReactionEntityService } from '@/core/entities/NoteReactionEntityService.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes', 'reactions'],

	requireCredential: false,

	allowGet: true,
	cacheSec: 60,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'NoteReaction',
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '263fff3d-d0e1-4af4-bea7-8408059b451a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		type: { type: 'string', nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteReactionEntityService: NoteReactionEntityService,
		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 閲覧できないノートのリアクションは返さない（存在しない場合と同じ応答にする）
			const note = await this.notesRepository.findOneBy({ id: ps.noteId });
			if (note == null || !(await this.noteEntityService.isCurrentlyVisibleForMe(note, me?.id ?? null))) {
				throw new ApiError(meta.errors.noSuchNote);
			}

			const query = this.queryService.makePaginationQuery(this.noteReactionsRepository.createQueryBuilder('reaction'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('reaction.noteId = :noteId', { noteId: ps.noteId })
				.leftJoinAndSelect('reaction.user', 'user')
				.leftJoinAndSelect('reaction.note', 'note');

			if (ps.type) {
				// ローカルリアクションはホスト名が . とされているが
				// DB 上ではそうではないので、必要に応じて変換
				const suffix = '@.:';
				const type = ps.type.endsWith(suffix) ? ps.type.slice(0, ps.type.length - suffix.length) + ':' : ps.type;
				query.andWhere('reaction.reaction = :type', { type });
			}

			const reactions = await query.limit(ps.limit).getMany();

			return await this.noteReactionEntityService.packMany(reactions, me);
		});
	}
}
