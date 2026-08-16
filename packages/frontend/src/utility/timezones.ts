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

	// debug
	console.log('locale', locale);

	const timezone = Intl.supportedValuesOf('timeZone').map((tz) => {
		const date = new Date();
		const parts = formatter.formatToParts(date);
		const abbrev = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';

		console.log('tz', tz, 'abbrev', abbrev);

		return {
			name: tz,
			abbrev,
		};
	});
	return timezone.sort((a, b) => a.name.localeCompare(b.name));
};
