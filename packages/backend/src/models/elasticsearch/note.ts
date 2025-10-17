/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { estypes } from '@elastic/elasticsearch';
import { IndicesIndexSettings } from '@/misc/elasticsearch.js';

export const noteMapping: estypes.MappingTypeMapping = {
	properties: {
		text: {
			type: 'text',
			analyzer: 'sudachi_analyzer',
		},
		cw: {
			type: 'text',
			analyzer: 'sudachi_analyzer',
		},
		visibility: { type: 'keyword' },
		createdAt: { type: 'date' },
		userId: { type: 'keyword' },
		userHost: { type: 'keyword' },
		channelId: { type: 'keyword' },
		tags: {
			type: 'text',
			analyzer: 'sudachi_analyzer',
		},
		replyId: { type: 'keyword' },
		renoteId: { type: 'keyword' },
		fileIds: { type: 'keyword' },
		isQuote: { type: 'boolean' },
		searchableBy: { type: 'keyword' },
		isBot: { type: 'boolean' },
	},
};

export const noteSettings: IndicesIndexSettings = {
	settings: {
		index: {
			analysis: {
				analyzer: {
					sudachi_analyzer: {
						type: 'custom',
						tokenizer: 'sudachi_tokenizer',
						filter: [
							'sudachi_baseform',
							'sudachi_normalizedform',
							'sudachi_readingform',
						],
					},
				},
				tokenizer: {
					sudachi_tokenizer: {
						type: 'sudachi_tokenizer',
						discard_punctuation: true,
						additional_settings: '{"systemDict": "system_full.dic"}',
					},
				},
			},
		},
	},
};
