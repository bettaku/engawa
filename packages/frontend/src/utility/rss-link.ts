/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Untrusted feed links must not become executable navigation targets. */
export function rssLink(link: unknown): string | undefined {
	if (typeof link !== 'string') return undefined;
	try {
		const url = new URL(link);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
	} catch {
		return undefined;
	}
}
