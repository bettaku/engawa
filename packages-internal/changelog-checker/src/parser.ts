/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';

const RE_RELEASE_HEADER = /^##\s+(.+?)\s*$/
const RE_RELEASE_CATEGORY = /^###\s+(.+?)\s*$/
const RE_RELEASE_ITEM = /^-\s+(.+?)\s*$/
const RE_FENCE = /^\s*(`{3,}|~{3,})(.*)$/

const COMMENT_START = '<!--';
const COMMENT_END = '-->';

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

/**
 * 開いているコードフェンスの情報。
 * 終了フェンスは開始フェンスと同じ文字で、かつ開始フェンス以上の長さである必要がある。
 */
type Fence = {
	readonly marker: string;
	readonly length: number;
};

class CommentState {
	public inComment = false;

	/**
	 * HTMLコメントの中身を取り除いた行を返す。複数行にまたがるコメントも扱う。
	 */
	strip(line: string): string {
		let result = '';
		let rest = line;

		while (rest.length > 0) {
			if (this.inComment) {
				const end = rest.indexOf(COMMENT_END);
				if (end < 0) {
					return result;
				}
				rest = rest.slice(end + COMMENT_END.length);
				this.inComment = false;
			} else {
				const start = rest.indexOf(COMMENT_START);
				if (start < 0) {
					return result + rest;
				}
				result += rest.slice(0, start);
				rest = rest.slice(start + COMMENT_START.length);
				this.inComment = true;
			}
		}

		return result;
	}
}

export function parseChangeLog(path: string): Release[] {
	const releases: Release[] = [];
	let release: Release | null = null;
	let category: ReleaseCategory | null = null;
	let fence: Fence | null = null;
	const comment = new CommentState();

	for (const raw of fs.readFileSync(path, { encoding: 'utf8' }).split(/\r?\n/)) {
		if (fence) {
			// コードフェンスの中身は無視する。開始フェンスと同じ文字・同じ長さ以上で、後続が空白だけの行だけを終了として扱う
			const closing = RE_FENCE.exec(raw);
			if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length && closing[2].trim() === '') {
				fence = null;
			}
			continue;
		}

		// コメントの中のフェンスを開始とみなさないよう、フェンスの判定より先にコメントを取り除く
		const line = comment.strip(raw);

		const opening = RE_FENCE.exec(line);
		if (opening) {
			fence = { marker: opening[1][0], length: opening[1].length };
			continue;
		}

		const rel = RE_RELEASE_HEADER.exec(line);
		if (rel) {
			release = new Release(rel[1]);
			releases.push(release);
			category = null;
			continue;
		}

		const cat = RE_RELEASE_CATEGORY.exec(line);
		if (cat && release) {
			category = new ReleaseCategory(cat[1]);
			release.categories.push(category);
			continue;
		}

		if (category && RE_RELEASE_ITEM.test(line)) {
			category.items.push(line.replace(RE_RELEASE_ITEM, '$1'));
		}
	}
	return releases;
}
