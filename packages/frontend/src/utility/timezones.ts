/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';

export const timezones = () => {
	const locale = miLocalStorage.getItem('lang') ?? navigator.language;
	const formatter = new Intl.DateTimeFormat(locale, {
		timeZoneName: 'short',
	});

	const timezone = Intl.supportedValuesOf('timeZone').map((tz) => {
		return {
			name: tz,
		};
	});
	return timezone.sort((a, b) => a.name.localeCompare(b.name));
};
