/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const timezones = () => {
	const timezone = Intl.supportedValuesOf('timeZone').map((tz) => {
		return {
			name: tz,
		};
	});
	return timezone.sort((a, b) => a.name.localeCompare(b.name));
};
