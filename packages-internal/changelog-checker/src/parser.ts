/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';

const RE_RELEASE_HEADER = /^##\s+(.+?)\s*$/
const RE_RELEASE_CATEGORY = /^###\s+(.+?)\s*$/
const RE_RELEASE_ITEM = /^-\s+(.+?)\s*$/

export class Release {
	public readonly releaseName: string;
	public readonly categories: ReleaseCategory[];

	constructor(releaseName: string, categories: ReleaseCategory[] = []) {
		this.releaseName = releaseName;
		this.categories = [...categories];
	}
}

export class ReleaseCategory {
	public readonly categoryName: string;
	public readonly items: string[];

	constructor(categoryName: string, items: string[] = []) {
		this.categoryName = categoryName;
		this.items = [...items];
	}
}

export function parseChangeLog(path: string): Release[] {
	const releases: Release[] = [];
	let release: Release | null = null;
	let category: ReleaseCategory | null = null;
	let inFence = false;

	for (const raw of fs.readFileSync(path, { encoding: 'utf8' }).split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(raw)) {
			inFence = !inFence;
			continue;
		}

		if (inFence) continue;

		const rel = RE_RELEASE_HEADER.exec(raw);
		if (rel) {
			release = new Release(rel[1]);
			releases.push(release);
			category = null;
			continue;
		}

		const cat = RE_RELEASE_CATEGORY.exec(raw);
		if (cat && release) {
			category = new ReleaseCategory(cat[1]);
			release.categories.push(category);
			continue;
		}

		if (category && RE_RELEASE_ITEM.test(raw)) {
			category.items.push(raw.replace(RE_RELEASE_ITEM, '$1'));
		}
	}
	return releases;
}
