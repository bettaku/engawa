/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** PostgreSQLがデッドロックを検出して、トランザクションを中断したか */
export function isDeadlockError(err: unknown): boolean {
	if (err == null || typeof err !== 'object') return false;
	const code = (err as { code?: unknown; driverError?: { code?: unknown } }).driverError?.code ?? (err as { code?: unknown }).code;
	return code === '40P01';
}

/**
 * デッドロックで中断されたトランザクションを、最初からやり直す。
 * `fn`はトランザクション全体（ロールバックされると何も残らない処理）でなければならない。
 */
export async function retryOnDeadlock<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= maxAttempts || !isDeadlockError(err)) throw err;
		}
	}
}
