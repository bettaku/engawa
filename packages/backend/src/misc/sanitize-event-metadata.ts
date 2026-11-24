/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EventSchema } from '@/models/Event.js';

function isHttpUrl(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

/**
 * イベントのメタデータは投稿API・ActivityPubのどちらからも任意のオブジェクトが届く。
 * クライアントがリンクとして描画するURLは http(s) 以外を取り除く（javascript: などの実行を防ぐ）。
 */
export function sanitizeEventMetadata(metadata: EventSchema): EventSchema {
	if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return { '@type': 'Event' };
	}

	const sanitized: Record<string, unknown> = { ...metadata };

	if ('url' in sanitized && !isHttpUrl(sanitized.url)) {
		delete sanitized.url;
	}

	const offers = sanitized.offers;
	if (offers != null && typeof offers === 'object' && !Array.isArray(offers) && 'url' in offers && !isHttpUrl(offers.url)) {
		const { url: _url, ...rest } = offers as Record<string, unknown>;
		sanitized.offers = rest;
	}

	return sanitized as EventSchema;
}
