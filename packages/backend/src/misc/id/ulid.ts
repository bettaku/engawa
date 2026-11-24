/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Crockford's Base32
// https://github.com/ulid/spec#encoding

const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const ulidRegExp = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

function parseBase32BigInt(str: string): bigint {
	let result = 0n;
	for (let i = 0; i < str.length; i++) {
		const digit = CHARS.indexOf(str[i]);
		if (digit < 0) throw new Error('Invalid ULID');
		result = result * 32n + BigInt(digit);
	}
	return result;
}

function parseBase32(timestamp: string) {
	let time = 0;
	for (let i = 0; i < timestamp.length; i++) {
		time = time * 32 + CHARS.indexOf(timestamp[i]);
	}
	return time;
}

export function parseUlid(id: string): { date: Date; } {
	return { date: new Date(parseBase32(id.slice(0, 10))) };
}

// 乱数部は Crockford's Base32（I・L・O・Uを除く）なので、parseInt(…, 32) では読めない（W〜Zで失敗する）。
// 乱数部は80ビットあるが、additional は64ビットに収める（Redis Stream ID の seq が符号なし64ビットのため）。
// 上位64ビットを取るので、additional の大小は乱数部の大小と矛盾しない（同じ値になることはある）。
export function parseUlidFull(id: string): { date: number; additional: bigint; } {
	return {
		date: parseBase32(id.slice(0, 10)),
		additional: parseBase32BigInt(id.slice(10, 26)) >> 16n,
	};
}
