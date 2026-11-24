/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkEvent from '@/components/MkEvent.vue';
import { safeHttpUrl } from '@/utility/safe-http-url.js';

const unsafe = [
	'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' \tjavascript:alert(1)', 'java\nscript:alert(1)',
	'javascript://example.com/%0Aalert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)',
	'file:///tmp/a', '//example.com/path', '/relative', 'not a URL',
];

describe('safeHttpUrl', () => {
	test.each([undefined, null, '', {}, 42, ...unsafe])('rejects %j', (input) => {
		expect(safeHttpUrl(input)).toBeUndefined();
	});

	test.each([
		['https://example.com/event?q=1#a', 'https://example.com/event?q=1#a'],
		['http://example.com/event', 'http://example.com/event'],
	])('keeps %s', (input, expected) => {
		expect(safeHttpUrl(input)).toBe(expected);
	});
});

describe('MkEvent', () => {
	const renderEvent = (metadata: Record<string, unknown>) => render(MkEvent, {
		props: {
			note: {
				event: {
					title: 'Event',
					start: new Date().toJSON(),
					end: null,
					metadata,
				},
			},
		},
		global: { directives, components },
	});

	afterEach(() => {
		cleanup();
	});

	test.each(unsafe)('does not link %j', (url) => {
		const { container } = renderEvent({ url, offers: { url } });
		expect(container.querySelector('a')).toBeNull();
		// 値そのものは文字として見える
		expect(container.textContent).toContain(url.trim());
	});

	test('links http(s) urls in a new tab', () => {
		const { container } = renderEvent({ url: 'https://example.com/event', offers: { url: 'https://example.com/tickets' } });
		const anchors = [...container.querySelectorAll('a')];
		expect(anchors.map(a => a.getAttribute('href'))).toEqual(['https://example.com/event', 'https://example.com/tickets']);
		for (const a of anchors) {
			expect(a.getAttribute('target')).toBe('_blank');
			expect(a.getAttribute('rel')).toBe('nofollow noopener');
		}
	});

	test('a non-array performer does not break rendering', () => {
		const { container } = renderEvent({ performer: 'someone' });
		expect(container.textContent).toContain('someone');
	});
});
