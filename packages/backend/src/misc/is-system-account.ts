/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from '@/models/User.js';

export function isSystemAccount(user: MiUser): boolean {
	return user.host === null && (user.username === 'instance.actor' || user.username === 'relay.actor' || user.isSystem);
}
