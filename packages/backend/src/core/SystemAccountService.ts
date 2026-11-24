/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import * as Redis from 'ioredis';
//import bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import { MiLocalUser, MiUser } from '@/models/User.js';
import { MiSystemAccount, MiUsedUsername, MiUserKeypair, MiUserProfile, type UsersRepository, type SystemAccountsRepository } from '@/models/_.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { isInternalEventRef, type GlobalEvents } from '@/core/GlobalEventService.js';
import { MiMeta } from '@/models/Meta.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { IdService } from '@/core/IdService.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import { onRedisReconnected } from '@/misc/redis-reconnected.js';
import { CacheService } from '@/core/CacheService.js';

export const SYSTEM_ACCOUNT_TYPES = ['actor', 'relay', 'proxy'] as const;

@Injectable()
export class SystemAccountService implements OnApplicationShutdown {
	private readonly offRedisReconnected: () => void;
	private cache: MemoryKVCache<MiLocalUser>;
	/** システムアカウントの名前の更新を、イベントが届いた順に1つずつ行うためのキュー（rejectしない） */
	private nameUpdateQueue: Promise<void> = Promise.resolve();

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.systemAccountsRepository)
		private systemAccountsRepository: SystemAccountsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private idService: IdService,
		private cacheService: CacheService,
	) {
		this.cache = new MemoryKVCache<MiLocalUser>(1000 * 60 * 10); // 10m

		this.redisForSub.on('message', this.onMessage);
		this.offRedisReconnected = onRedisReconnected(this.redisForSub, this.onRedisReconnected);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					let getName: () => Promise<string | null | undefined>;
					if (isInternalEventRef(body)) {
						// 新本文は値を持たないので、変わった列にnameがあるときだけ、順番が来てからDBから読む
						if (!body.changedKeys.includes('name')) break;
						getName = async () => (await this.usersRepository.manager.getRepository(MiMeta).findOne({ where: {}, order: { id: 'DESC' } }))?.name;
					} else {
						if (body.before == null || body.before.name === body.after.name) break;
						const name = body.after.name;
						getName = async () => name;
					}
					// 先に届いたイベントの更新が終わる前に後のイベントの更新が始まると、古い名前で上書きすることがあるので、届いた順に1つずつ処理する
					const queued = this.nameUpdateQueue.then(() => this.updateNames(getName));
					this.nameUpdateQueue = queued;
					await queued;
					break;
				}
				default:
					break;
			}
		}
	}

	/**
	 * システムアカウントの名前をサーバー名に合わせる。イベントの処理なので、失敗しても例外を投げない（処理されないrejectionにしない）
	 */
	@bindThis
	private async updateNames(getName: () => Promise<string | null | undefined>): Promise<void> {
		try {
			const name = await getName();
			if (name === undefined) return;
			for (const account of SYSTEM_ACCOUNT_TYPES) {
				await this.updateCorrespondingUserProfile(account, {
					name,
				});
			}
		} catch (err) {
			console.error('Failed to update the names of system accounts', err);
		}
	}

	@bindThis
	public async list(): Promise<MiSystemAccount[]> {
		const accounts = await this.systemAccountsRepository.findBy({});

		return accounts;
	}

	/**
	 * 作成済みのシステムアカウントを返す。`fetch`と違い、なければ作らずにnullを返す（packなど、DBを読むだけの処理から使う。P3-3）
	 */
	@bindThis
	public async fetchIfExists(type: typeof SYSTEM_ACCOUNT_TYPES[number]): Promise<MiLocalUser | null> {
		const cached = this.cache.get(type);
		if (cached) return cached;

		const systemAccount = await this.systemAccountsRepository.findOne({
			where: { type: type },
			relations: ['user'],
		});
		if (systemAccount == null) return null;

		this.cache.set(type, systemAccount.user as MiLocalUser);
		return systemAccount.user as MiLocalUser;
	}

	@bindThis
	public async fetch(type: typeof SYSTEM_ACCOUNT_TYPES[number]): Promise<MiLocalUser> {
		const existing = await this.fetchIfExists(type);
		if (existing) return existing;

		const created = await this.createCorrespondingUser(type, {
			username: `system.${type}`, // NOTE: (できれば避けたいが) . が含まれるかどうかでシステムアカウントかどうかを判定している処理もあるので変えないように
			name: this.meta.name,
		});
		this.cache.set(type, created);
		return created;
	}

	@bindThis
	private async createCorrespondingUser(type: typeof SYSTEM_ACCOUNT_TYPES[number], extra: {
		username: MiUser['username'];
		name?: MiUser['name'];
	}): Promise<MiLocalUser> {
		const password = randomUUID();

		// Generate hash of password
		//const salt = await bcrypt.genSalt(8);
		const hash = await argon2.hash(password);

		// Generate secret
		const secret = generateNativeUserToken();

		const keyPair = await genRsaKeyPair();

		let account!: MiUser;

		// Start transaction
		await this.db.transaction(async transactionalEntityManager => {
			const exist = await transactionalEntityManager.findOneBy(MiUser, {
				usernameLower: extra.username.toLowerCase(),
				host: IsNull(),
			});

			if (exist) {
				account = exist;
				return;
			}

			account = await transactionalEntityManager.insert(MiUser, {
				id: this.idService.gen(),
				username: extra.username,
				usernameLower: extra.username.toLowerCase(),
				host: null,
				token: secret,
				isLocked: true,
				isExplorable: false,
				isBot: true,
				name: extra.name,
			}).then(x => transactionalEntityManager.findOneByOrFail(MiUser, x.identifiers[0]));

			await transactionalEntityManager.insert(MiUserKeypair, {
				publicKey: keyPair.publicKey,
				privateKey: keyPair.privateKey,
				userId: account.id,
			});

			await transactionalEntityManager.insert(MiUserProfile, {
				userId: account.id,
				autoAcceptFollowed: false,
				password: hash,
			});

			await transactionalEntityManager.insert(MiUsedUsername, {
				createdAt: new Date(),
				username: extra.username.toLowerCase(),
			});

			await transactionalEntityManager.insert(MiSystemAccount, {
				id: this.idService.gen(),
				userId: account.id,
				type: type,
			});
		});

		return account as MiLocalUser;
	}

	@bindThis
	public async updateCorrespondingUserProfile(type: typeof SYSTEM_ACCOUNT_TYPES[number], extra: {
		name?: string | null;
		description?: MiUserProfile['description'];
	}): Promise<MiLocalUser> {
		const user = await this.fetch(type);

		const updates = {} as Partial<MiUser>;
		if (extra.name !== undefined) updates.name = extra.name;

		if (Object.keys(updates).length > 0) {
			await this.usersRepository.update(user.id, updates);
		}

		const profileUpdates = {} as Partial<MiUserProfile>;
		if (extra.description !== undefined) profileUpdates.description = extra.description;

		if (Object.keys(profileUpdates).length > 0) {
			await this.userProfilesRepository.update(user.id, profileUpdates);
			await this.cacheService.userProfileCache.delete(user.id);
		}

		const updated = await this.usersRepository.findOneByOrFail({ id: user.id }) as MiLocalUser;
		this.cache.set(type, updated);

		return updated;
	}

	/**
	 * Pub/Subをつなぎ直したとき。切れている間のイベントを受け取れていないので、イベントで更新しているキャッシュを捨てる
	 */
	@bindThis
	private onRedisReconnected(): void {
		this.cache.clear();
	}

	@bindThis
	public dispose(): void {
		this.offRedisReconnected();
		this.redisForSub.off('message', this.onMessage);
		this.cache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string): void {
		this.dispose();
	}
}
