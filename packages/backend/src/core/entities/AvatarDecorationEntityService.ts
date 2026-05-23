/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { AvatarDecorationsRepository, MiRole, RolesRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { bindThis } from '@/decorators.js';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class AvatarDecorationEntityService {
	constructor(
		@Inject(DI.avatarDecorationsRepository)
		private avatarDecorationsRepository: AvatarDecorationsRepository,

		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,

		private idService: IdService,
	) {}

	@bindThis
	public async packSimple(
		src: MiAvatarDecoration['id'] | MiAvatarDecoration,
	): Promise<Packed<'AvatarDecorationSimple'>> {
		const decoration = typeof src === 'object' ? src : await this.avatarDecorationsRepository.findOneByOrFail({ id: src });

		return {
			name: decoration.name,
			url: decoration.url,
			roleIdsThatCanBeUsedThisDecoration: decoration.roleIdsThatCanBeUsedThisDecoration.length > 0 ? decoration.roleIdsThatCanBeUsedThisDecoration : undefined,
		};
	}

	@bindThis
	public async packSimpleMany(
		decorations: any[],
	) {
		return Promise.all(decorations.map(x => this.packSimple(x)));
	}

	@bindThis
	public async packDetailed(
		src: MiAvatarDecoration['id'] | MiAvatarDecoration,
	): Promise<Packed<'AvatarDecorationDetailed'>> {
		const decoration = typeof src === 'object' ? src : await this.avatarDecorationsRepository.findOneByOrFail({ id: src });

		return {
			id: decoration.id,
			name: decoration.name,
			description: decoration.description,
			host: decoration.host,
			url: decoration.url,
			roleIdsThatCanBeUsedThisDecoration: decoration.roleIdsThatCanBeUsedThisDecoration.length > 0 ? decoration.roleIdsThatCanBeUsedThisDecoration : undefined,
		};
	}

	@bindThis
	public async packDetailedMany(
		decorations: any[],
	) {
		return Promise.all(decorations.map(x => this.packDetailed(x)));
	}

	// memo: EmojiEntityServiceのpackAdminと同様に、hintを導入する?
	@bindThis
	public async packAdmin(
		src: MiAvatarDecoration['id'] | MiAvatarDecoration,
		hint?: {
			roles?: Map<MiRole['id'], MiRole>
		},
	): Promise<Packed<'AvatarDecorationAdmin'>> {
		const decoration = typeof src === 'object' ? src : await this.avatarDecorationsRepository.findOneByOrFail({ id: src });

		const roles = Array.of<MiRole>();
		if (decoration.roleIdsThatCanBeUsedThisDecoration.length > 0) {
			if (hint?.roles) {
				const hintRoles = hint.roles;
				roles.push(
					...decoration.roleIdsThatCanBeUsedThisDecoration
						.filter(x => hintRoles.has(x))
						.map(x => hintRoles.get(x)!),
				);
			} else {
				roles.push(
					...await this.rolesRepository.findBy({ id: In(decoration.roleIdsThatCanBeUsedThisDecoration) }),
				);
			}
		}

		roles.sort((a, b) => {
			if (a.displayOrder !== b.displayOrder) {
				return b.displayOrder - a.displayOrder;
			}

			return a.id.localeCompare(b.id);
		});

		return {
			id: decoration.id,
			createdAt: this.idService.parse(decoration.id).date.toISOString(),
			updatedAt: decoration.updatedAt?.toISOString() ?? null,
			name: decoration.name,
			description: decoration.description,
			host: decoration.host,
			url: decoration.url,
			roleIdsThatCanBeUsedThisDecoration: roles.map(it => ({ id: it.id, name: it.name })),
		};
	}

	@bindThis
	public async packAdminMany(
		decorations: MiAvatarDecoration['id'][] | MiAvatarDecoration[],
		hint?: {
			roles?: Map<MiRole['id'], MiRole>
		},
	): Promise<Packed<'AvatarDecorationAdmin'>[]> {
		const decorationEntities = decorations.filter(x => typeof x === 'object') as MiAvatarDecoration[];
		const decorationIdOnlyList = decorations.filter(x => typeof x === 'string') as string[];
		if (decorationIdOnlyList.length > 0) {
			decorationEntities.push(...await this.avatarDecorationsRepository.findBy({ id: In(decorationIdOnlyList) }));
		}

		let hintRoles: Map<MiRole['id'], MiRole>;
		if (hint?.roles) {
			hintRoles = hint.roles;
		} else {
			const roles = Array.of<MiRole>();
			const roleIds = [...new Set(decorationEntities.flatMap(x => x.roleIdsThatCanBeUsedThisDecoration))];
			if (roleIds.length > 0) {
				roles.push(...await this.rolesRepository.findBy({ id: In(roleIds) }));
			}

			hintRoles = new Map(roles.map(x => [x.id, x]));
		}

		return Promise.all(decorations.map(x => this.packAdmin(x, { roles: hintRoles })));
	}
}
