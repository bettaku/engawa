/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getNoteDeliveryScope } from '@/misc/note-delivery-scope.js';

describe('getNoteDeliveryScope', () => {
	test('publicはフォロワーとリレーに配送する', () => {
		expect(getNoteDeliveryScope({ visibility: 'public', localOnly: false })).toStrictEqual({ federate: true, followers: true, relays: true });
	});

	test.each(['home', 'followers'])('%s はフォロワーに配送するがリレーには配送しない', (visibility) => {
		expect(getNoteDeliveryScope({ visibility, localOnly: false })).toStrictEqual({ federate: true, followers: true, relays: false });
	});

	test('specifiedはフォロワーにもリレーにも配送しない（宛先への直接配送のみ）', () => {
		expect(getNoteDeliveryScope({ visibility: 'specified', localOnly: false })).toStrictEqual({ federate: true, followers: false, relays: false });
	});

	test('privateはlocalOnlyがfalseでも配送しない', () => {
		expect(getNoteDeliveryScope({ visibility: 'private', localOnly: false })).toStrictEqual({ federate: false, followers: false, relays: false });
	});

	test.each(['public', 'home', 'followers', 'specified', 'private'])('localOnlyの %s は配送しない', (visibility) => {
		expect(getNoteDeliveryScope({ visibility, localOnly: true })).toStrictEqual({ federate: false, followers: false, relays: false });
	});

	test('未知の公開範囲は配送しない', () => {
		expect(getNoteDeliveryScope({ visibility: 'unknown' })).toStrictEqual({ federate: false, followers: false, relays: false });
	});
});
