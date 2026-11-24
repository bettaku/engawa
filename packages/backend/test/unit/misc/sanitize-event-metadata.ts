/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { sanitizeEventMetadata } from '@/misc/sanitize-event-metadata.js';
import type { EventSchema } from '@/models/Event.js';

const unsafe = [
	'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' \tjavascript:alert(1)', 'java\nscript:alert(1)',
	'javascript://example.com/%0Aalert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)',
	'file:///tmp/a', '//example.com/path', '/relative', 'not a URL', '', 42, {}, ['https://example.com'],
];

describe('sanitizeEventMetadata', () => {
	test.each(unsafe)('removes url %j', (url) => {
		const result = sanitizeEventMetadata({ '@type': 'Event', name: 'x', url } as unknown as EventSchema);
		expect(result).toStrictEqual({ '@type': 'Event', name: 'x' });
	});

	test.each(unsafe)('removes offers.url %j', (url) => {
		const result = sanitizeEventMetadata({ '@type': 'Event', offers: { '@type': 'Offer', price: '100', url } } as unknown as EventSchema);
		expect(result).toStrictEqual({ '@type': 'Event', offers: { '@type': 'Offer', price: '100' } });
	});

	test.each(['https://example.com/event?a=1#b', 'http://example.com/'])('keeps http(s) url %s', (url) => {
		const metadata: EventSchema = { '@type': 'Event', url, offers: { '@type': 'Offer', url }, location: 'somewhere' };
		expect(sanitizeEventMetadata(metadata)).toStrictEqual(metadata);
	});

	test('does not mutate the input', () => {
		const metadata = { '@type': 'Event', url: 'javascript:alert(1)', offers: { '@type': 'Offer', url: 'javascript:alert(1)' } } as EventSchema;
		sanitizeEventMetadata(metadata);
		expect(metadata.url).toBe('javascript:alert(1)');
		expect(metadata.offers?.url).toBe('javascript:alert(1)');
	});

	test.each([null, undefined, 'string', 1, []])('replaces non-object metadata %j', (metadata) => {
		expect(sanitizeEventMetadata(metadata as unknown as EventSchema)).toStrictEqual({ '@type': 'Event' });
	});
});
