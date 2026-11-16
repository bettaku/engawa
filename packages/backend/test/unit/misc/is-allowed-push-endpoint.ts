/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isAllowedPushEndpoint } from '@/misc/is-allowed-push-endpoint.js';

describe('isAllowedPushEndpoint', () => {
	test.each([
		'https://fcm.googleapis.com/fcm/send/abc',
		'https://updates.push.services.mozilla.com/wpush/v2/abc',
		'https://web.push.apple.com/abc',
		'https://push.example.com:8443/abc',
	])('Pushサービスの %s を許可する', (endpoint) => {
		expect(isAllowedPushEndpoint(endpoint)).toBe(true);
	});

	test.each([
		'http://fcm.googleapis.com/fcm/send/abc',
		'https://127.0.0.1/',
		'https://10.0.0.5:6379/',
		'https://169.254.169.254/latest/meta-data/',
		'https://[::1]/',
		'https://[fd00::1]/',
		'https://2130706433/',
		'https://0x7f.1/',
		'https://localhost/',
		'https://foo.localhost/',
		'https://redis/',
		'https://db.internal/',
		'https://printer.local/',
		'https://user:pass@push.example.com/',
		'ftp://push.example.com/',
		'not a url',
		'',
		null,
		42,
	])('%j を拒否する', (endpoint) => {
		expect(isAllowedPushEndpoint(endpoint)).toBe(false);
	});
});
