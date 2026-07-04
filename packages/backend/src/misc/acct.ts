/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type Acct = {
	username: string;
	host: string | null;
};

export function parse(acct: string): Acct {
	if (acct.startsWith('@')) acct = acct.substring(1);
	const split = acct.split('@', 2);
	return { username: split[0], host: split[1] ?? null };
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: public API named toString by design
export function toString(acct: Acct): string {
	return acct.host == null ? acct.username : `${acct.username}@${acct.host}`;
}
