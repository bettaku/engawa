/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { DriveFilesRepository, GalleryPostsRepository } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { GalleryPostEntityService } from '@/core/entities/GalleryPostEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['gallery'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:gallery',

	limit: {
		duration: ms('1hour'),
		max: 300,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'GalleryPost',
	},

	errors: {
		noSuchPost: {
			message: 'No such post.',
			code: 'NO_SUCH_POST',
			id: '15c7b18b-058e-4e96-99e3-5c6813189444',
		},
		noSuchFile: {
			message: 'No valid files are specified.',
			code: 'NO_SUCH_FILE',
			id: 'ad4a11e9-234a-4551-b881-58b4ae6d473d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		postId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string', minLength: 1 },
		description: { type: 'string', nullable: true },
		fileIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 32, items: {
			type: 'string', format: 'misskey:id',
		} },
		isSensitive: { type: 'boolean', default: false },
	},
	required: ['postId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.galleryPostsRepository)
		private galleryPostsRepository: GalleryPostsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private galleryPostEntityService: GalleryPostEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let files: Array<MiDriveFile> | undefined;

			if (ps.fileIds) {
				files = (await Promise.all(ps.fileIds.map(fileId =>
					this.driveFilesRepository.findOneBy({
						id: fileId,
						userId: me.id,
					}),
				))).filter(x => x != null);

				if (files.length === 0) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			}

			const result = await this.galleryPostsRepository.update({
				id: ps.postId,
				userId: me.id,
			}, {
				updatedAt: new Date(),
				title: ps.title,
				description: ps.description,
				isSensitive: ps.isSensitive,
				fileIds: files ? files.map(file => file.id) : undefined,
			});

			if (result.affected === 0) {
				throw new ApiError(meta.errors.noSuchPost);
			}

			const post = await this.galleryPostsRepository.findOneByOrFail({ id: ps.postId });

			return await this.galleryPostEntityService.pack(post, me);
		});
	}
}
