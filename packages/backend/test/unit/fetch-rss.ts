/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import FetchRss, { meta, paramDef } from '@/server/api/endpoints/fetch-rss.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { ApiCallService } from '@/server/api/ApiCallService.js';

const xml = '<rss version="2.0"><channel><title>Feed</title><item><title>Article</title><link>https://example.com/article</link></item></channel></rss>';
const response = () => ({ text: async () => xml });

function fixture() {
	const send = vi.fn().mockResolvedValue(response());
	const endpoint = new FetchRss({ send } as unknown as HttpRequestService);
	const fetch = (url = 'https://example.com/feed') => endpoint.exec({ url }, null, null, null);
	return { send, fetch };
}

afterEach(() => vi.restoreAllMocks());

describe('bounded anonymous RSS fetching', () => {
	test.each(['GET', 'POST'])('enforces the shared rate limiter before fetching for anonymous %s requests', async (method) => {
		const send = vi.fn();
		const endpoint = new FetchRss({ send } as unknown as HttpRequestService);
		const limit = vi.fn().mockResolvedValue({ code: 'RATE_LIMIT_EXCEEDED', info: { resetMs: Date.now() + 60000 } });
		const service = new ApiCallService(
			{ enableIpLogging: false } as never, {} as never, {} as never,
			{ authenticate: async () => [null, null, null] } as never,
			{ limit } as never, {} as never, { logger: {} } as never,
		);
		const reply = { code: vi.fn(), send: vi.fn(), header: vi.fn() };
		try {
			service.handleRequest(
				{ name: 'fetch-rss', meta, params: paramDef, exec: endpoint.exec } as never,
				{ method, body: { url: 'https://example.com/feed' }, query: { url: 'https://example.com/feed' }, headers: {}, ip: '192.0.2.1' } as never,
				reply as never,
			);
			await vi.waitFor(() => expect(reply.code).toHaveBeenCalledWith(429));
			expect(limit).toHaveBeenCalledWith(expect.objectContaining({ key: 'fetch-rss', max: 120, duration: 60000 }), expect.any(String), 1);
			expect(send).not.toHaveBeenCalled();
		} finally {
			service.dispose();
		}
	});

	test('keeps anonymous access and returns normal parsed feeds with a smaller network budget', async () => {
		const f = fixture();
		const feed = await f.fetch();
		expect(feed.title).toBe('Feed');
		expect(feed.items[0]).toMatchObject({ title: 'Article', link: 'https://example.com/article' });
		expect(f.send).toHaveBeenCalledWith('https://example.com/feed', expect.objectContaining({ size: 512 * 1024, timeout: 5000 }));
		expect(meta.requireCredential).toBe(false);
		expect(meta.limit).toEqual({ duration: 60000, max: 120 });
	});

	test('shares simultaneous same-URL fetches and caches successful parsing', async () => {
		const f = fixture();
		let resolve!: (value: ReturnType<typeof response>) => void;
		f.send.mockReturnValue(new Promise(r => { resolve = r; }));
		const first = f.fetch();
		const second = f.fetch();
		resolve(response());
		expect(await first).toEqual(await second);
		await f.fetch();
		expect(f.send).toHaveBeenCalledTimes(1);
	});

	test('rejects distinct work over the concurrency budget and releases capacity', async () => {
		const f = fixture();
		let resolve!: (value: ReturnType<typeof response>) => void;
		f.send.mockReturnValue(new Promise(r => { resolve = r; }));
		const active = Array.from({ length: 4 }, (_, i) => f.fetch('https://example.com/' + i));
		await expect(f.fetch('https://example.com/overflow')).rejects.toMatchObject({ code: 'RSS_FETCH_BUSY', httpStatusCode: 503 });
		expect(f.send).toHaveBeenCalledTimes(4);
		resolve(response());
		await Promise.all(active);
		f.send.mockResolvedValue(response());
		await expect(f.fetch('https://example.com/after')).resolves.toMatchObject({ title: 'Feed' });
	});

	test('does not cache failed retrievals or malformed XML', async () => {
		const f = fixture();
		f.send.mockRejectedValueOnce(new Error('aborted'));
		await expect(f.fetch()).rejects.toThrow('aborted');
		f.send.mockResolvedValueOnce({ text: async () => '<rss><unclosed>' });
		await expect(f.fetch()).rejects.toThrow();
		await expect(f.fetch()).resolves.toMatchObject({ title: 'Feed' });
		expect(f.send).toHaveBeenCalledTimes(3);
	});

	test('rejects oversized UTF-8 input before XML parsing', async () => {
		const f = fixture();
		f.send.mockResolvedValue({ text: async () => 'あ'.repeat(180000) });
		await expect(f.fetch()).rejects.toMatchObject({ code: 'RSS_FEED_TOO_LARGE' });
	});

	test.each(['<rss version="2.0"></rss>', '<feed><entry><link/></entry></feed>'])('releases capacity when valid XML is not a valid feed: %s', async (invalidFeed) => {
		const f = fixture();
		f.send.mockResolvedValue({ text: async () => invalidFeed });
		const results = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => f.fetch('https://example.com/invalid/' + i)));
		expect(results.every(result => result.status === 'rejected')).toBe(true);
		f.send.mockResolvedValue(response());
		await expect(f.fetch()).resolves.toMatchObject({ title: 'Feed' });
	}, 1000);

	test('expires cached responses', async () => {
		const f = fixture();
		const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
		await f.fetch();
		now.mockReturnValue(62000);
		await f.fetch();
		expect(f.send).toHaveBeenCalledTimes(2);
	});

	test('evicts old entries instead of growing without a bound', async () => {
		const f = fixture();
		for (let i = 0; i < 33; i++) await f.fetch('https://example.com/' + i);
		await f.fetch('https://example.com/0');
		expect(f.send).toHaveBeenCalledTimes(34);
	});
});
