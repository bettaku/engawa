/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { IActivity } from '@/core/activitypub/type.js';
import type { InboxJobData, InboxJobDataV2 } from './types.js';
import type httpSignature from '@peertube/http-signature';

/**
 * inboxジョブの新形式（v2）を組み立てる。受信時（ActivityPubServerService）にdigestを検証した後で使う。
 *
 * @param parsed `httpSignature.parseRequest`の結果
 * @param request 受信したリクエストの生の値
 */
export function buildInboxJobDataV2(
	activity: IActivity,
	parsed: httpSignature.IParsedSignature,
	request: { method: string; url: string; digest: string | null; },
): InboxJobDataV2 {
	return {
		v: 2,
		activity,
		signature: {
			keyId: parsed.params.keyId,
			algorithm: parsed.params.algorithm,
			headers: [...parsed.params.headers],
			signature: parsed.params.signature,
			signingString: parsed.signingString,
		},
		request: {
			method: request.method,
			target: request.url,
			digest: request.digest,
		},
	};
}

/**
 * inboxジョブのpayloadから、署名の検証に使う`httpSignature.IParsedSignature`を得る。
 * v1は解析結果をそのまま持っている。v2は`parseRequest`が返すのと同じ形に組み立て直す。
 */
export function toParsedSignature(data: InboxJobData): httpSignature.IParsedSignature {
	if (data.v !== 2) return data.signature;

	return {
		scheme: 'Signature',
		params: {
			keyId: data.signature.keyId,
			algorithm: data.signature.algorithm,
			headers: [...data.signature.headers],
			signature: data.signature.signature,
		},
		signingString: data.signature.signingString,
		// parseRequestは、paramsのalgorithmを小文字に、トップレベルのalgorithmを大文字にする
		algorithm: data.signature.algorithm.toUpperCase(),
		keyId: data.signature.keyId,
	};
}
