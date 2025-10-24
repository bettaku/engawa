/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { estypes } from '@elastic/elasticsearch';
import { IndicesIndexSettings, TokenizerType, AnalysisSudachiTokenizer, AnalysisPinyinTokenizer, AnalysisTokenizer, AnalysisSTConvertTokenizer, AnalysisIKTokenizer } from '@/misc/elasticsearch.js';
import { Config } from '@/config.js';

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

function getTokenizerConfig(tokenizer: TokenizerType, config: Config): AnalysisTokenizer {
	switch (tokenizer) {
		case 'sudachi_tokenizer':
			return {
				type: 'sudachi_tokenizer',
				discard_punctuation: true,
				additional_settings: config.elasticsearch?.extra?.sudachi_additional_settings || '{"systemDict": "system_full.dic"}',
			} as AnalysisSudachiTokenizer;

		case 'kuromoji_tokenizer':
			return {
				type: 'kuromoji_tokenizer',
				mode: 'search',
			} as estypes.AnalysisKuromojiTokenizer;

		case 'nori_tokenizer': {
			const baseNoriConfig = {
				type: 'nori_tokenizer',
				decompound_mode: 'mixed',
			};

			const noriConfig = config.elasticsearch?.extra?.nori_user_dict
				? {
					...baseNoriConfig,
					user_dictionary: config.elasticsearch.extra.nori_user_dict,
				} : baseNoriConfig;

			return noriConfig as estypes.AnalysisNoriTokenizer;
		}

		case 'pinyin':
			return {
				type: 'pinyin',
			} as AnalysisPinyinTokenizer;

		case 'stconvert':
			return {
				type: 'stconvert',
				delimiter: '#',
				keep_both: true,
				convert_type: config.elasticsearch?.extra?.stconvert_type || 's2t',
			} as AnalysisSTConvertTokenizer;

		case 'ik_max_word':
			return {
				type: 'ik_max_word',
			} as AnalysisIKTokenizer;

		case 'ik_smart':
			return {
				type: 'ik_smart',
			} as AnalysisIKTokenizer;

		case 'icu_tokenizer':
			return {
				type: 'icu_tokenizer',
				rule_files: config.elasticsearch?.extra?.icu_rule_files || '',
			} as estypes.AnalysisIcuTokenizer;

		case 'ngram':
		default:
			return {
				type: 'ngram',
				max_gram: 20,
				min_gram: 1,
				token_chars: ['whitespace', 'punctuation']
			} as estypes.AnalysisNGramTokenizer;
	}
}

function getAnalyzerConfig(tokenizer: TokenizerType | TokenizerType[], config: Config): estypes.AnalysisAnalyzer {
	switch (tokenizer) {
		case 'sudachi_tokenizer':
			return {
				type: 'custom',
				tokenizer: 'sudachi_tokenizer',
				filter: ['sudachi_baseform', 'sudachi_normalizedform', 'sudachi_readingform'],
			} as estypes.AnalysisCustomAnalyzer;

		case 'kuromoji_tokenizer': {
			if (Array.isArray(tokenizer) && tokenizer.includes('icu_tokenizer')) {
				return {
					type: 'custom',
					tokenizer: 'kuromoji_tokenizer',
					char_filter: ['icu_normalizer'],
					filter: ['kuromoji_baseform', 'kuromoji_part_of_speech', 'cjk_width', 'lowercase', 'ja_stop'],
				} as estypes.AnalysisCustomAnalyzer;
			} else {
				return {
					type: 'custom',
					tokenizer: 'kuromoji_tokenizer',
					filter: ['kuromoji_baseform', 'kuromoji_part_of_speech', 'cjk_width', 'lowercase', 'ja_stop'],
				} as estypes.AnalysisCustomAnalyzer;
			}
		}

		case 'nori_tokenizer':
			return {
				type: 'custom',
				tokenizer: 'nori_tokenizer',
				filter: ['nori_readingform', 'cjk_width', 'lowercase'],
			} as estypes.AnalysisCustomAnalyzer;

		case 'pinyin':
			return {
				type: 'custom',
				tokenizer: 'pinyin',
			} as estypes.AnalysisCustomAnalyzer;

		case 'stconvert':
			return {
				type: 'custom',
				tokenizer: 'stconvert',

			} as estypes.AnalysisCustomAnalyzer;

		default:
			return {
				type: 'custom',
				tokenizer: 'ngram',
				filter: ['cjk_bigram', 'cjk_width', 'lowercase', 'asciifolding'],
			} as estypes.AnalysisCustomAnalyzer;
	}
}
