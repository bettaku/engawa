/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';

/**
 * Push通知の購読先として受け付けてよいURLかどうかを判定する。
 * Pushサービスは必ず公開されたHTTPSのホスト名で提供されるので、
 * https以外・IPアドレス直指定・認証情報つき・localhostなどの内部向けの名前は受け付けない。
 * （名前解決後の接続先がプライベートアドレスでないことは、送信時のエージェントで別に検査する）
 */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
	if (typeof endpoint !== 'string') return false;

	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}

	if (url.protocol !== 'https:') return false;
	if (url.username !== '' || url.password !== '') return false;

	const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
	if (hostname === '') return false;

	// IPv6リテラルは [] で囲まれている
	const bareHost = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
	if (ipaddr.isValid(bareHost)) return false;

	if (!hostname.includes('.')) return false;
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
	if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

	return true;
}
