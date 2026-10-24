/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Release } from './parser.js';

export class Result {
	public readonly success: boolean;
	public readonly message?: string;

	private constructor(success: boolean, message?: string) {
		this.success = success;
		this.message = message;
	}

	static ofSuccess(): Result {
		return new Result(true);
	}

	static ofFailed(message?: string): Result {
		return new Result(false, message);
	}
}

/**
 * develop -> mainまたはrelease -> mainを想定したパターン。
 * base側の先頭とhead側で追加された分のリリースより1つ前のバージョンが等価であるかチェックする。
 */
export function checkNewRelease(base: Release[], head: Release[]): Result {
	const releaseCountDiff = head.length - base.length;
	if (releaseCountDiff <= 0) {
		return Result.ofFailed('Invalid release count.');
	}

	// base側にリリースがない（初めてのリリース、またはすべてアーカイブ済み）なら、head側で増えた分はすべて新しいリリース
	if (base.length === 0) {
		return Result.ofSuccess();
	}

	const baseLatest = base[0];
	const headPrevious = head[releaseCountDiff];

	if (baseLatest.releaseName !== headPrevious.releaseName) {
		return Result.ofFailed('Contains unexpected releases.');
	}

	return Result.ofSuccess();
}

/**
 * topic -> developまたはtopic -> mainを想定したパターン。
 * head側の最新リリース配下に書き加えられているかをチェックする。
 */
export function checkNewTopic(base: Release[], head: Release[]): Result {
	if (head.length !== base.length) {
		return Result.ofFailed('Invalid release count.');
	}

	const headLatest = head[0];
	for (let relIdx = 0; relIdx < base.length; relIdx++) {
		const baseItem = base[relIdx];
		const headItem = head[relIdx];
		if (baseItem.releaseName !== headItem.releaseName) {
			// リリースの順番が変わってると成立しないのでエラーにする
			return Result.ofFailed(`Release is different. base:${baseItem.releaseName}, head:${headItem.releaseName}`);
		}

		if (baseItem.categories.length !== headItem.categories.length) {
			// カテゴリごと書き加えられたパターン
			if (headLatest.releaseName !== headItem.releaseName) {
				// 最新リリース以外に追記されていた場合
				return Result.ofFailed(`There is an error in the update history. expected additions:${headLatest.releaseName}, actual additions:${headItem.releaseName}`);
			}
		} else {
			// カテゴリ数の変動はないのでリスト項目の数をチェック
			for (let catIdx = 0; catIdx < baseItem.categories.length; catIdx++) {
				const baseCategory = baseItem.categories[catIdx];
				const headCategory = headItem.categories[catIdx];

				if (baseCategory.categoryName !== headCategory.categoryName) {
					// カテゴリの順番が変わっていると成立しないのでエラーにする
					return Result.ofFailed(`Category is different. base:${baseCategory.categoryName}, head:${headCategory.categoryName}`);
				}

				if (baseCategory.items.length !== headCategory.items.length) {
					if (headLatest.releaseName !== headItem.releaseName) {
						// 最新リリース以外に追記されていた場合
						return Result.ofFailed(`There is an error in the update history. expected additions:${headLatest.releaseName}, actual additions:${headItem.releaseName}`);
					}
				}
			}
		}
	}

	return Result.ofSuccess();
}

/**
 * base側のリリースから、アーカイブ（CHANGELOG_engawa_archived.md）に移したものを除く。
 * アーカイブに移したリリースはhead側のCHANGELOG_engawa.mdから消えるので、そのままでは「リリースが減った」と判定される。
 */
export function excludeArchived(base: Release[], archived: Release[]): Release[] {
	const names = new Set(archived.map(r => r.releaseName));
	return base.filter(r => !names.has(r.releaseName));
}
