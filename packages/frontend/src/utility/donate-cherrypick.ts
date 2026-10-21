/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';

export function donateCherryPick(ev: MouseEvent) {
	os.popupMenu([{
		text: 'GitHub Sponsers',
		icon: 'ti ti-pig-money',
		action: () => {
			window.open('https://github.com/sponsors/1673beta', '_blank');
		},
	}], ev.currentTarget ?? ev.target);
}
