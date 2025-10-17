/*
 * SPDX-FileCopyrightText: esurio and team bettaku, noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { estypes } from '@elastic/elasticsearch';

/**
 * interface for extending AnalysisTokenizer to use Sudachi
 * Sudachi is a tokenizar for Japanese text.
 * for more details, see {@link https://github.com/WorksApplications/elasticsearch-sudachi}
 * @param type: 'sudachi_tokenizer' - fixed value
 * @param split_mode - 'A' | 'B' | 'C' - if not set, default is 'C'
 * @param discard_punctuation - boolean - if true, punctuation will be discarded
 * @param allow_empty_morpheme - boolean - if true, empty morphemes will be allowed
 * @param settings_path - string - path to the settings file
 * @param resources_path - string - path to the resources directory
 * @param additional_settings - string - additional settings in JSON format
*/
export interface AnalysisSudachiTokenizer extends estypes.AnalysisTokenizerBase {
	type: 'sudachi_tokenizer';
	split_mode?: 'A' | 'B' | 'C';
	discard_punctuation?: boolean;
	allow_empty_morpheme?: boolean;
	settings_path?: string;
	resources_path?: string;
	additional_settings?: string;
}

export interface AnalysisPinyinTokenizer extends estypes.AnalysisTokenizerBase {
	type: 'pinyin';
	keep_first_letter?: boolean;
	keep_separate_first_letter?: boolean;
	limit_first_letter_length?: number;
	keep_full_pinyin?: boolean;
	keep_joined_full_pinyin?: boolean;
	keep_none_chinese?: boolean;
	keep_none_chinese_together?: boolean;
	keep_none_chinese_in_first_letter?: boolean;
	keep_none_chinese_in_joined_full_pinyin?: boolean;
	none_chinese_pinyin_tokenize?: boolean;
	keep_original?: boolean;
	lowercase?: boolean;
	trim_whitespace?: boolean;
	remove_duplicated_term?: boolean;
	/**
	 * @deprecated
	 */
	ignore_pinyin_offset?: boolean;
}

export type AnalysisTokenizerDefinition = estypes.AnalysisCharGroupTokenizer | estypes.AnalysisEdgeNGramTokenizer | estypes.AnalysisKeywordTokenizer | estypes.AnalysisLetterTokenizer | estypes.AnalysisLowercaseTokenizer | estypes.AnalysisNGramTokenizer | estypes.AnalysisNoriTokenizer | estypes.AnalysisPathHierarchyTokenizer | estypes.AnalysisStandardTokenizer | estypes.AnalysisUaxEmailUrlTokenizer | estypes.AnalysisWhitespaceTokenizer | estypes.AnalysisKuromojiTokenizer | estypes.AnalysisPatternTokenizer | estypes.AnalysisIcuTokenizer | AnalysisSudachiTokenizer | AnalysisPinyinTokenizer;

export type AnalysisTokenizer = string | AnalysisTokenizerDefinition;

export interface IndicesIndexSettingsAnalysis {
	analyzer?: Record<string, estypes.AnalysisAnalyzer>;
	char_filter?: Record<string, estypes.AnalysisCharFilter>;
	filter?: Record<string, estypes.AnalysisCharFilter>;
	normalizer?: Record<string, estypes.AnalysisNormalizer>;
	tokenizer?: Record<string, AnalysisTokenizer | estypes.AnalysisTokenizer>;
}

// from @elastic/elasticsearch/lib/api/types.ts
export interface IndicesIndexSettingsKeys {
	index?: IndicesIndexSettings;
	mode?: string;
	routing_path?: string | string[];
	soft_deletes?: estypes.IndicesSoftDeletes;
	sort?: estypes.IndicesIndexSegmentSort;
	number_of_shards?: estypes.integer | string;
	number_of_replicas?: estypes.integer | string;
	check_on_startup?: estypes.IndicesIndexCheckOnStartup;
	codec?: string;
	routing_partition_size?: estypes.SpecUtilsStringified<estypes.integer>;
	load_fixed_bitset_filters_eagerly?: boolean;
	hidden?: boolean | string;
	auto_expand_replicas?: string;
	merge?: estypes.IndicesMerge;
	search?: estypes.IndicesSettingsSearch;
	refresh_interval?: estypes.Duration;
	max_result_window?: estypes.integer;
	max_inner_result_window?: estypes.integer;
	max_rescore_window?: estypes.integer;
	max_docvalue_fields_search?: estypes.integer;
	max_script_fields?: estypes.integer;
	max_ngram_diff?: estypes.integer;
	max_shingle_diff?: estypes.integer;
	blocks?: estypes.IndicesIndexSettingBlocks;
	max_refresh_listeners?: estypes.integer;
	analyze?: estypes.IndicesSettingsAnalyze;
	highlight?: estypes.IndicesSettingsHighlight;
	max_terms_count?: estypes.integer;
	max_regex_length?: estypes.integer;
	routing?: estypes.IndicesIndexRouting;
	gc_deletes?: estypes.Duration;
	default_pipeline?: estypes.PipelineName;
	final_pipeline?: estypes.PipelineName;
	lifecycle?: estypes.IndicesIndexSettingsLifecycle;
	provided_name?: estypes.Name;
	creation_date?: estypes.SpecUtilsStringified<estypes.EpochTime<estypes.UnitMillis>>;
	creation_date_string?: estypes.DateTime;
	uuid?: estypes.Uuid;
	version?: estypes.IndicesIndexVersioning;
	verified_before_close?: boolean | string;
	format?: string | estypes.integer;
	max_slices_per_scroll?: estypes.integer;
	translog?: estypes.IndicesTranslog;
	query_string?: estypes.IndicesSettingsQueryString;
	priority?: estypes.integer | string;
	top_metrics_max_size?: estypes.integer;
	analysis?: IndicesIndexSettingsAnalysis; // <-- Modified
	settings?: IndicesIndexSettings; // <-- Modified
	time_series?: estypes.IndicesIndexSettingsTimeSeries;
	queries?: estypes.IndicesQueries;
	similarity?: Record<string, estypes.IndicesSettingsSimilarity>;
	mapping?: estypes.IndicesMappingLimitSettings;
	'indexing.slowlog'?: estypes.IndicesIndexingSlowlogSettings;
	indexing_pressure?: estypes.IndicesIndexingPressure;
	store?: estypes.IndicesStorage;
}

export type IndicesIndexSettings = IndicesIndexSettingsKeys & {
	[property: string]: any;
};

export const tokenizerTypes = ['char_group', 'edge_ngram', 'keyword', 'letter', 'lowercase', 'ngram', 'nori_tokenizer', 'path_hierarchy', 'standard', 'uax_url_email', 'whitespace', 'kuromoji_tokenizer', 'pattern', 'icu_tokenizer', 'sudachi_tokenizer', 'pinyin'] as const;

export type TokenizerType = typeof tokenizerTypes[number];
