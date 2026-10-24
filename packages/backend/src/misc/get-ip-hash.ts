/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';

function toPrefixBigInt(ip: string): bigint {
	// `process` unwraps IPv4-mapped IPv6 addresses (`::ffff:203.0.113.7`) into
	// plain IPv4, which is what Node reports for IPv4 clients on dual-stack sockets.
	const address = ipaddr.process(ip);

	if (address.kind() === 'ipv4') {
		// for IPv4 the entire 32-bit address is used
		return (address as ipaddr.IPv4).octets.reduce((acc, octet) => (acc << 8n) | BigInt(octet), 0n);
	}

	// because a single person may control many IPv6 addresses,
	// only a /64 subnet prefix of any IP will be taken into account.
	return (address as ipaddr.IPv6).parts.slice(0, 4).reduce((acc, part) => (acc << 16n) | BigInt(part), 0n);
}

export function getIpHash(ip: string): string {
	try {
		return 'ip-' + toPrefixBigInt(ip).toString(36);
	} catch (e) {
		// e.g. `203.0.113.7:51234` — strip a trailing port and retry
		return 'ip-' + toPrefixBigInt(ip.replace(/:[0-9]+$/, '')).toString(36);
	}
}
