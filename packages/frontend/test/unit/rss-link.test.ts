/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { rssLink } from '@/utility/rss-link.js';
import { readFileSync } from 'node:fs';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';

describe('RSS article links', () => {
	test.each([
		undefined, null, '', {}, 42, 'javascript:alert(1)', 'JaVaScRiPt:alert(1)',
		' \tjavascript:alert(1)', 'java\nscript:alert(1)', 'java\tscript:alert(1)',
		'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///tmp/a',
		'//example.com/path', '/article', 'not a URL', 'https://',
	])('does not create a link for %j', (input) => {
		expect(rssLink(input)).toBeUndefined();
	});

	test.each([
		['https://example.com/news?q=hello#item', 'https://example.com/news?q=hello#item'],
		['http://example.com/news', 'http://example.com/news'],
		[' HTTPS://example.com/news ', 'https://example.com/news'],
	])('preserves safe HTTP(S) links: %s', (input, expected) => {
		expect(rssLink(input)).toBe(expected);
	});
});

describe.each([
	'src/widgets/WidgetRss.vue',
	'src/widgets/WidgetRssTicker.vue',
	'src/ui/_common_/statusbar-rss.vue',
])('RSS template %s', (path) => {
	test.each(['javascript:alert(1)', 'java\tscript:alert(1)', 'https://example.com/article'])('renders safe navigation for %s', (link) => {
		const source = readFileSync(path, 'utf8');
		const template = parse(source).descriptor.template!.content;
		// Execute the actual template with controlled feed data, without the
		// widget lifecycle/network timers.
		const compiled = compileTemplate({
			source: template, filename: path, id: 'rss-test',
			compilerOptions: { mode: 'function', prefixIdentifiers: false, cacheHandlers: false },
		});
		expect(compiled.errors).toEqual([]);
		const render = new Function('Vue', compiled.code)(Vue);
		const app = Vue.createApp({
			render,
			setup: () => ({
				items: [{ title: 'Article', link }], fetching: false, rssLink,
				widgetProps: { showHeader: true }, display: 'marquee', key: 0,
				marqueeDuration: 10, marqueeReverse: false, configure: () => {},
			}),
		});
		const slotsOnly = Vue.defineComponent({ setup: (_, { slots }) => () => slots.default?.() });
		app.component('MkContainer', slotsOnly);
		app.component('MkMarqueeText', slotsOnly);
		app.component('MkLoading', slotsOnly);
		app.component('MkResult', slotsOnly);
		app.config.globalProperties.$style = {};
		const container = document.createElement('div');
		try {
			app.mount(container);
			const anchor = container.querySelector('a')!;
			expect(anchor.textContent).toBe('Article');
			expect(anchor.getAttribute('href')).toBe(link.startsWith('https:') ? link : null);
		} finally {
			app.unmount();
		}
	});
});
