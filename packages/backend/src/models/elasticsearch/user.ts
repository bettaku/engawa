import { IndicesIndexSettings, MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types.js";

export const userMapping: MappingTypeMapping = {
	properties: {
		name: { type: 'text' },
		username: { type: 'text' },
		usernameLower: { type: 'text' },
		updatedAt: { type: 'date' },
		isSuspended: { type: 'boolean' },
		isIndexable: { type: 'boolean' },
		isBot: { type: 'boolean' },
		isCat: { type: 'boolean' },
		host: { type: 'text' },
	},
};

export const userSettings: IndicesIndexSettings = {
	settings: {
		analysis: {
			analyzer: {
				username_analyzer: {
					type: 'custom',
					tokenizer: 'username_tokenizer',
					filter: ['lowercase'],
				},
			},
			tokenizer: {
				username_tokenizer: {
					type: 'edge_ngram',
					min_gram: 1,
					max_gram: 20,
					token_chars: ['letter', 'digit', 'symbol'],
				}
			},
		},
	},
};
