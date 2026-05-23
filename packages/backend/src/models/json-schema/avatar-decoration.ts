/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedAvatarDecorationSimpleSchema = {
	type: 'object',
	properties: {
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		url: {
			type: 'string',
			optional: false, nullable: false,
		},
		roleIdsThatCanBeUsedThisDecoration: {
			type: 'array',
			optional: true, nullable: false,
			items: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
			},
		},
	},
} as const;

export const packedAvatarDecorationDetailedSchema = {
	type: 'object',
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
		description: {
			type: 'string',
			optional: false, nullable: true,
		},
		host: {
			type: 'string',
			optional: false, nullable: true,
			description: 'The local host is represented with `null`.',
		},
		url: {
			type: 'string',
			optional: false, nullable: false,
		},
		roleIdsThatCanBeUsedThisDecoration: {
			type: 'array',
			optional: true, nullable: false,
			items: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
			},
		},
	},
} as const;

export const packedAvatarDecorationAdminSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		updatedAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: true,
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		host: {
			type: 'string',
			optional: false, nullable: true,
			description: 'The local host is represented with `null`.',
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
} as const;
