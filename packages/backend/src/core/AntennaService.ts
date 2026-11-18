/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { isInternalEventRef, type GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { ReloadableList, replaceById } from '@/misc/reloadable-list.js';
import { DI } from '@/di-symbols.js';
import * as Acct from '@/misc/acct.js';
import type { Packed } from '@/misc/json-schema.js';
import type { AntennasRepository, UserGroupJoiningsRepository, UserListMembershipsRepository } from '@/models/_.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { CacheService } from '@/core/CacheService.js';
import { deserializeAntenna } from '@/core/deserializeAntenna.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import { onRedisReconnected } from '@/misc/redis-reconnected.js';

@Injectable()
export class AntennaService implements OnApplicationShutdown {
	private readonly offRedisReconnected: () => void;
	private readonly logger: Logger;
	private readonly antennas: ReloadableList<MiAntenna>;

	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.userGroupJoiningsRepository)
		private userGroupJoiningsRepository: UserGroupJoiningsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private cacheService: CacheService,
		private utilityService: UtilityService,
		private globalEventService: GlobalEventService,
		private fanoutTimelineService: FanoutTimelineService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('antenna');
		this.antennas = new ReloadableList(
			() => this.antennasRepository.findBy({ isActive: true }),
			{ onError: err => this.logger.error('Failed to load active antennas', { e: err }) },
		);

		this.redisForSub.on('message', this.onRedisMessage);
		this.offRedisReconnected = onRedisReconnected(this.redisForSub, this.onRedisReconnected);
	}

	@bindThis
	private async onRedisMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			if (isInternalEventRef(body) && (type === 'antennaCreated' || type === 'antennaUpdated' || type === 'antennaDeleted')) {
				// 新本文は値を持たないので、一覧を捨てて次の取得でDBから読み直す。
				// 1件ずつ読み直すと、読み込み中に届いた後続のイベントや、取得中の一覧との順序が入れ替わる
				this.antennas.invalidate();
				return;
			}

			// 旧本文（エンティティ全体）。読み込み済みの一覧に差分を反映する（読み込み中の一覧は保存しない）
			if (isInternalEventRef(body)) return;
			switch (type) {
				case 'antennaCreated':
				case 'antennaUpdated':
				case 'antennaDeleted': {
					// 旧本文の作成・更新は、これまでどおり無効なアンテナも一覧に入れる
					const antenna = type === 'antennaDeleted' ? null : deserializeAntenna(body);
					this.antennas.modify(antennas => replaceById(antennas, body.id, antenna));
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async addNoteToAntennas(note: MiNote, noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean; }): Promise<void> {
		let antennas: MiAntenna[];
		try {
			antennas = await this.getAntennas();
		} catch {
			// 再試行しても読み込めなかった（ログは読み込み側で出している）。呼び出し元はこの処理を待たないので、ここで止める
			return;
		}
		const antennasWithMatchResult = await Promise.all(antennas.map(antenna => this.checkHitAntenna(antenna, note, noteUser).then(hit => [antenna, hit] as const)));
		const matchedAntennas = antennasWithMatchResult.filter(([, hit]) => hit).map(([antenna]) => antenna);

		const redisPipeline = this.redisForTimelines.pipeline();

		for (const antenna of matchedAntennas) {
			this.fanoutTimelineService.push(`antennaTimeline:${antenna.id}`, note.id, 200, redisPipeline);
			this.globalEventService.publishAntennaStream(antenna.id, 'note', note);
		}

		redisPipeline.exec();
	}

	// NOTE: フォローしているユーザーのノート、リストのユーザーのノート、グループのユーザーのノート指定はパフォーマンス上の理由で無効になっている

	@bindThis
	public async checkHitAntenna(antenna: MiAntenna, note: (MiNote | Packed<'Note'>), noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean; }): Promise<boolean> {
		if (antenna.excludeBots && noteUser.isBot) return false;

		if (antenna.localOnly && noteUser.host != null) return false;

		if (!antenna.withReplies && note.replyId != null) return false;

		if (note.visibility === 'specified' || note.visibility === 'private') {
			if (note.userId !== antenna.userId) {
				if (note.visibleUserIds == null) return false;
				if (!note.visibleUserIds.includes(antenna.userId)) return false;
			}
		}

		if (note.visibility === 'followers') {
			const isFollowing = Object.hasOwn(await this.cacheService.userFollowingsCache.fetch(antenna.userId), note.userId);
			if (!isFollowing && antenna.userId !== note.userId) return false;
		}

		if (antenna.src === 'home') {
			// TODO
		} else if (antenna.src === 'list') {
			if (antenna.userListId == null) return false;
			const exists = await this.userListMembershipsRepository.exists({
				where: {
					userListId: antenna.userListId,
					userId: note.userId,
				},
			});
			if (!exists) return false;
		} else if (antenna.src === 'group') {
			const joining = await this.userGroupJoiningsRepository.findOneByOrFail({ id: antenna.userGroupJoiningId! });

			if (antenna.userGroupJoiningId == null) return false;
			const exists = await this.userGroupJoiningsRepository.exists({
				where: {
					userGroupId: joining.userGroupId,
					userId: note.userId,
				},
			});
			if (!exists) return false;
		} else if (antenna.src === 'users') {
			const accts = antenna.users.map(x => {
				const { username, host } = Acct.parse(x);
				return this.utilityService.getFullApAccount(username, host).toLowerCase();
			});
			if (!accts.includes(this.utilityService.getFullApAccount(noteUser.username, noteUser.host).toLowerCase())) return false;
		} else if (antenna.src === 'users_blacklist') {
			const accts = antenna.users.map(x => {
				const { username, host } = Acct.parse(x);
				return this.utilityService.getFullApAccount(username, host).toLowerCase();
			});
			if (accts.includes(this.utilityService.getFullApAccount(noteUser.username, noteUser.host).toLowerCase())) return false;
		}

		const keywords = antenna.keywords
			// Clean up
			.map(xs => xs.filter(x => x !== ''))
			.filter(xs => xs.length > 0);

		if (keywords.length > 0) {
			if (note.text == null && note.cw == null) return false;

			const _text = (note.text ?? '') + '\n' + (note.cw ?? '');

			const matched = keywords.some(and =>
				and.every(keyword =>
					antenna.caseSensitive
						? _text.includes(keyword)
						: _text.toLowerCase().includes(keyword.toLowerCase()),
				));

			if (!matched) return false;
		}

		const excludeKeywords = antenna.excludeKeywords
			// Clean up
			.map(xs => xs.filter(x => x !== ''))
			.filter(xs => xs.length > 0);

		if (excludeKeywords.length > 0) {
			if (note.text == null && note.cw == null) return false;

			const _text = (note.text ?? '') + '\n' + (note.cw ?? '');

			const matched = excludeKeywords.some(and =>
				and.every(keyword =>
					antenna.caseSensitive
						? _text.includes(keyword)
						: _text.toLowerCase().includes(keyword.toLowerCase()),
				));

			if (matched) return false;
		}

		if (antenna.withFile) {
			if (note.fileIds && note.fileIds.length === 0) return false;
		}

		// TODO: eval expression

		return true;
	}

	@bindThis
	public async getAntennas() {
		return await this.antennas.get();
	}

	@bindThis
	public async onMoveAccount(src: MiUser, dst: MiUser): Promise<void> {
		// There is a possibility for users to add the srcUser to their antennas, but it's low, so we don't check it.

		// Get MiAntenna[] from cache and filter to select antennas with the src user is in the users list
		const srcUserAcct = this.utilityService.getFullApAccount(src.username, src.host).toLowerCase();
		const antennasToMigrate = (await this.getAntennas()).filter(antenna => {
			return antenna.users.some(user => {
				const { username, host } = Acct.parse(user);
				return this.utilityService.getFullApAccount(username, host).toLowerCase() === srcUserAcct;
			});
		});

		if (antennasToMigrate.length === 0) return;

		const antennaIds = antennasToMigrate.map(x => x.id);

		// Update the antennas by appending dst users acct to the users list
		const dstUserAcct = '@' + Acct.toString({ username: dst.username, host: dst.host });

		await this.antennasRepository.createQueryBuilder('antenna')
			.update()
			.set({
				users: () => 'array_append(antenna.users, :dstUserAcct)',
			})
			.where('antenna.id IN (:...antennaIds)', { antennaIds })
			.setParameters({ dstUserAcct })
			.execute();

		// announce update to event
		for (const newAntenna of await this.antennasRepository.findBy({ id: In(antennaIds) })) {
			this.globalEventService.publishInternalEvent('antennaUpdated', newAntenna);
		}
	}

	/**
	 * Pub/Subをつなぎ直したとき。切れている間のイベントを受け取れていないので、イベントで更新しているキャッシュを捨てる
	 */
	@bindThis
	private onRedisReconnected(): void {
		this.antennas.invalidate();
	}

	@bindThis
	public dispose(): void {
		this.offRedisReconnected();
		this.redisForSub.off('message', this.onRedisMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
