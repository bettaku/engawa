/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getIpHash } from '@/misc/get-ip-hash.js';

describe('getIpHash', () => {
	// expected values were captured from the previous ip-cidr based implementation
	// so that existing rate-limit / signin keys keep their identity.
	test.each([
		['127.0.0.1', 'ip-z8kflt'],
		['192.168.1.100', 'ip-1hge15w'],
		['203.0.113.7', 'ip-1kbq70n'],
		['0.0.0.0', 'ip-0'],
		['255.255.255.255', 'ip-1z141z3'],
		['::1', 'ip-0'],
		['2001:db8::1', 'ip-hir6901su77k'],
		['2001:db8:85a3:8d3:1319:8a2e:370:7348', 'ip-hir6912vp7f7'],
		['2001:0db8:85a3:08d3:1319:8a2e:0370:7348', 'ip-hir6912vp7f7'],
		['fe80::1%eth0', 'ip-3vbtrlnlpfn5s'],
	])('%s -> %s', (ip, expected) => {
		expect(getIpHash(ip)).toBe(expected);
	});

	test('IPv4 with trailing port falls back to the bare address', () => {
		expect(getIpHash('203.0.113.7:51234')).toBe(getIpHash('203.0.113.7'));
	});

	test('IPv4-mapped IPv6 address hashes like the embedded IPv4 address', () => {
		expect(getIpHash('::ffff:203.0.113.7')).toBe(getIpHash('203.0.113.7'));
		expect(getIpHash('::ffff:cb00:7107')).toBe(getIpHash('203.0.113.7'));
	});

	test('addresses in the same IPv6 /64 share a hash, different /64s do not', () => {
		expect(getIpHash('2001:db8:85a3:8d3::1')).toBe(getIpHash('2001:db8:85a3:8d3:ffff:ffff:ffff:ffff'));
		expect(getIpHash('2001:db8:85a3:8d3::1')).not.toBe(getIpHash('2001:db8:85a3:8d4::1'));
	});

	test('throws on garbage', () => {
		expect(() => getIpHash('not an ip')).toThrow();
	});
});
