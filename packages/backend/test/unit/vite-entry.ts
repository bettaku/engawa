/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { resolveViteEntry, type ViteEntry } from '@/misc/vite-entry.js';

describe(resolveViteEntry, () => {
	test('includes CSS from nested static imports without eagerly loading dynamic imports', () => {
		const manifest: Record<string, ViteEntry> = {
			entry: { file: 'entry.js', css: ['entry.css'], imports: ['note'], dynamicImports: ['settings'] },
			note: { file: 'note.js', css: ['note.css'], imports: ['emoji'] },
			emoji: { file: 'emoji.js', css: ['emoji.css'] },
			settings: { file: 'settings.js', css: ['settings.css'] },
		};

		expect(resolveViteEntry(manifest, 'entry')).toEqual({
			...manifest.entry,
			css: ['entry.css', 'note.css', 'emoji.css'],
		});
		expect(manifest.entry.css).toEqual(['entry.css']);
	});

	test('deduplicates shared styles and terminates circular imports', () => {
		const manifest: Record<string, ViteEntry> = {
			entry: { file: 'entry.js', imports: ['note', 'emoji'] },
			note: { file: 'note.js', css: ['shared.css', 'note.css'], imports: ['emoji'] },
			emoji: { file: 'emoji.js', css: ['shared.css', 'emoji.css'], imports: ['note'] },
		};

		expect(resolveViteEntry(manifest, 'entry').css).toEqual(['shared.css', 'note.css', 'emoji.css']);
	});

	test('collects embed styles through chunks without their own CSS', () => {
		const manifest: Record<string, ViteEntry> = {
			'src/boot.ts': { file: 'embed.js', imports: ['shared'] },
			shared: { file: 'shared.js', imports: ['emoji'] },
			emoji: { file: 'emoji.js', css: ['emoji.css'] },
		};

		expect(resolveViteEntry(manifest, 'src/boot.ts').css).toEqual(['emoji.css']);
	});

	test('supports the development fallback without a built manifest', () => {
		expect(resolveViteEntry({ entry: { file: null } }, 'entry')).toEqual({ file: null, css: [] });
	});
});
