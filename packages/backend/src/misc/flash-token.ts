/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiLocalUser } from '@/models/User.js';

export type FlashToken = {
	permissions: string[];
	userId: MiLocalUser['id'];
};

/**
 * Redisに保存されているflashトークン。
 * 以前の形式（発行時点のユーザー全体を `user` に保存）のものも期限が切れるまで残りうるので、読み込み時は両方を受け付ける。
 */
export type StoredFlashToken = {
	permissions: string[];
	userId?: MiLocalUser['id'];
	user?: { id: MiLocalUser['id'] };
};
