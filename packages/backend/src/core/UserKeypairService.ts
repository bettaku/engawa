/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { MiUser } from '@/models/User.js';
import type { UserKeypairsRepository } from '@/models/_.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

/**
 * ユーザーの鍵ペア。
 *
 * 秘密鍵をRedisに置かないように、プロセスのメモリだけにキャッシュする（pre-rust-tech-debt.md P2-1、アドバイザリ[A5]）。
 * 以前は`kvcache:userKeypair:<userId>`（v1）に24時間保存していた。v2のnamespaceには保存しない。
 * 鍵ペアは作成した後に変わらないので、ほかのプロセスへの無効化の通知は要らない。
 */
@Injectable()
export class UserKeypairService implements OnApplicationShutdown {
	private cache: MemoryKVCache<MiUserKeypair>;

	constructor(
		@Inject(DI.userKeypairsRepository)
		private userKeypairsRepository: UserKeypairsRepository,
	) {
		this.cache = new MemoryKVCache<MiUserKeypair>(1000 * 60 * 60); // 1h
	}

	@bindThis
	public async getUserKeypair(userId: MiUser['id']): Promise<MiUserKeypair> {
		return await this.cache.fetch(userId, () => this.userKeypairsRepository.findOneByOrFail({ userId }));
	}

	@bindThis
	public dispose(): void {
		this.cache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
