/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Parser from 'rss-parser';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { ApiError } from '@/server/api/error.js';

const MAX_FEED_BYTES = 512 * 1024;
const MAX_CONCURRENT_FETCHES = 4;
const MAX_CACHED_FEEDS = 32;
const CACHE_TTL = 60 * 1000;

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 3,
	limit: {
		duration: 60 * 1000,
		max: 120,
	},
	errors: {
		busy: {
			message: 'Too many RSS feeds are being fetched. Please try again later.',
			code: 'RSS_FETCH_BUSY',
			id: '053bbab9-42a4-40de-8b36-744db08084c2',
			kind: 'server',
			httpStatusCode: 503,
		},
		tooLarge: {
			message: 'The RSS feed is too large.',
			code: 'RSS_FEED_TOO_LARGE',
			id: '64079566-e398-4fa0-9cad-711a05f94c9a',
		},
	},

	res: {
		type: 'object',
		properties: {
			image: {
				type: 'object',
				optional: true,
				properties: {
					link: {
						type: 'string',
						optional: true,
					},
					url: {
						type: 'string',
						optional: false,
					},
					title: {
						type: 'string',
						optional: true,
					},
				},
			},
			paginationLinks: {
				type: 'object',
				optional: true,
				properties: {
					self: {
						type: 'string',
						optional: true,
					},
					first: {
						type: 'string',
						optional: true,
					},
					next: {
						type: 'string',
						optional: true,
					},
					last: {
						type: 'string',
						optional: true,
					},
					prev: {
						type: 'string',
						optional: true,
					},
				},
			},
			link: {
				type: 'string',
				optional: true,
			},
			title: {
				type: 'string',
				optional: true,
			},
			items: {
				type: 'array',
				optional: false,
				items: {
					type: 'object',
					properties: {
						link: {
							type: 'string',
							optional: true,
						},
						guid: {
							type: 'string',
							optional: true,
						},
						title: {
							type: 'string',
							optional: true,
						},
						pubDate: {
							type: 'string',
							optional: true,
						},
						creator: {
							type: 'string',
							optional: true,
						},
						summary: {
							type: 'string',
							optional: true,
						},
						content: {
							type: 'string',
							optional: true,
						},
						isoDate: {
							type: 'string',
							optional: true,
						},
						categories: {
							type: 'array',
							optional: true,
							items: {
								type: 'string',
							},
						},
						contentSnippet: {
							type: 'string',
							optional: true,
						},
						enclosure: {
							type: 'object',
							optional: true,
							properties: {
								url: {
									type: 'string',
									optional: false,
								},
								length: {
									type: 'number',
									optional: true,
								},
								type: {
									type: 'string',
									optional: true,
								},
							},
						},
					},
				},
			},
			feedUrl: {
				type: 'string',
				optional: true,
			},
			description: {
				type: 'string',
				optional: true,
			},
			itunes: {
				type: 'object',
				optional: true,
				additionalProperties: true,
				properties: {
					image: {
						type: 'string',
						optional: true,
					},
					owner: {
						type: 'object',
						optional: true,
						properties: {
							name: {
								type: 'string',
								optional: true,
							},
							email: {
								type: 'string',
								optional: true,
							},
						},
					},
					author: {
						type: 'string',
						optional: true,
					},
					summary: {
						type: 'string',
						optional: true,
					},
					explicit: {
						type: 'string',
						optional: true,
					},
					categories: {
						type: 'array',
						optional: true,
						items: {
							type: 'string',
						},
					},
					keywords: {
						type: 'array',
						optional: true,
						items: {
							type: 'string',
						},
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string', maxLength: 2048 },
	},
	required: ['url'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private readonly pending = new Map<string, Promise<Parser.Output<Parser.Item>>>();
	private readonly cache = new Map<string, { expiresAt: number, feed: Parser.Output<Parser.Item> }>();

	constructor(
		private httpRequestService: HttpRequestService,
	) {
		super(meta, paramDef, async (ps) => this.fetchFeed(ps.url));
	}

	private async fetchFeed(url: string): Promise<Parser.Output<Parser.Item>> {
		const cached = this.cache.get(url);
		if (cached && cached.expiresAt > Date.now()) return cached.feed;
		this.cache.delete(url);

		const pending = this.pending.get(url);
		if (pending) return pending;
		// Bound distinct work before starting HTTP or XML parsing. Do not queue
		// arbitrary caller-controlled URLs when the worker is already busy.
		if (this.pending.size >= MAX_CONCURRENT_FETCHES) throw new ApiError(meta.errors.busy);

		const task = (async () => {
			const res = await this.httpRequestService.send(url, {
				method: 'GET',
				headers: {
					Accept: 'application/rss+xml, */*',
				},
				timeout: 5000,
				size: MAX_FEED_BYTES,
			});

			const text = await res.text();
			if (Buffer.byteLength(text, 'utf8') > MAX_FEED_BYTES) throw new ApiError(meta.errors.tooLarge);
			// Keep parser exceptions on the promise's synchronous error path.
			// xml2js async mode can swallow feed-builder errors and leave a
			// parse pending forever. Parsing work is bounded by MAX_FEED_BYTES.
			const feed = await new Parser().parseString(text);
			if (this.cache.size >= MAX_CACHED_FEEDS) {
				this.cache.delete(this.cache.keys().next().value!);
			}
			this.cache.set(url, { expiresAt: Date.now() + CACHE_TTL, feed });
			return feed;
		})();
		this.pending.set(url, task);
		try {
			return await task;
		} finally {
			this.pending.delete(url);
		}
	}
}
