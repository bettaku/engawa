/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';

/**
 * NestJS の `Test.createTestingModule().useMocker()` で使う、クラストークンから
 * 自動的にモックを生成するヘルパー。
 *
 * jest-mock の `ModuleMocker#generateFromMetadata()` の代替で、プロトタイプチェーンを
 * たどってメソッドを列挙し、それぞれを `vi.fn()` に置き換えたオブジェクトを返す。
 * getter は評価せずにスキップする。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateMock<T>(target: abstract new (...args: any[]) => T): T {
	const mock: Record<string | symbol, unknown> = {};

	for (
		let proto = target.prototype;
		proto != null && proto !== Object.prototype;
		proto = Object.getPrototypeOf(proto)
	) {
		for (const key of Reflect.ownKeys(proto)) {
			if (key === 'constructor' || key in mock) continue;

			// getter を呼び出さないようにディスクリプタ経由で判定する
			const descriptor = Object.getOwnPropertyDescriptor(proto, key);
			if (descriptor == null || typeof descriptor.value !== 'function') continue;

			mock[key] = vi.fn();
		}
	}

	return mock as T;
}
