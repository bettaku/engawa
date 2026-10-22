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

/**
 * EnumForm用のタイムゾーン選択肢を地域ごとにグループ化して返す
 */
export const timezoneEnumItems = () => {
	const groups = new Map<string, { label: string; value: string }[]>();
	const others: { label: string; value: string }[] = [];

	for (const tz of timezones()) {
		const item = { label: tz.name, value: tz.name.toLowerCase() };
		const slashIndex = tz.name.indexOf('/');
		if (slashIndex === -1) {
			others.push(item);
			continue;
		}
		const region = tz.name.slice(0, slashIndex);
		const group = groups.get(region);
		if (group) {
			group.push(item);
		} else {
			groups.set(region, [item]);
		}
	}

	return [
		{ label: '(auto)', value: null },
		...others,
		...Array.from(groups, ([label, items]) => ({ type: 'group' as const, label, items })),
	];
};
