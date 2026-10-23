/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';

/**
 * 投稿フォームで、このキー入力が投稿の操作かどうか
 * - useEnterToSend: Enter（Shift + Enter は改行）
 * - useShiftEnterToSend: Shift + Enter（alsoUseCtrlEnterToSend なら Ctrl/Cmd + Enter も）
 * - どちらでもない: Ctrl/Cmd + Enter
 */
export function isPostShortcut(ev: KeyboardEvent): boolean {
	if (ev.key !== 'Enter') return false;
	const ctrl = ev.ctrlKey || ev.metaKey;

	if (prefer.s.useEnterToSend && !ev.shiftKey) return true;
	if (prefer.s.useShiftEnterToSend) return ev.shiftKey || (prefer.s.alsoUseCtrlEnterToSend && ctrl);
	return ctrl;
}
