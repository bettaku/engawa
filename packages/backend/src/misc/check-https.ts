/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * @param requireHttps config.runtime.production.requireHttps（本番以外ではhttpも許す）
 */
export function checkHttps(url: string, requireHttps: boolean): boolean {
	return url.startsWith('https://') ||
		(url.startsWith('http://') && !requireHttps);
}
