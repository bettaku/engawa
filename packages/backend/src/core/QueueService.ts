/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MetricsTime, type JobType } from 'bullmq';
import { parse as parseRedisInfo } from 'redis-info';
import type { IActivity } from '@/core/activitypub/type.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiChatMessage } from '@/models/ChatMessage.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiUser } from '@/models/User.js';
import type { MiNoteDraft } from '@/models/NoteDraft.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import type { Antenna } from '@/server/api/endpoints/i/import-antennas.js';
import { ApRequestCreator } from '@/core/activitypub/ApRequestService.js';
import { JOB_DATA_VERSION } from '@/queue/job-version.js';
import { type SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { Packed } from '@/misc/json-schema.js';
import { type UserWebhookPayload } from './UserWebhookService.js';
import type {
	DbJobData,
	DeliverJobData,
	InboxJobData,
	RelationshipJobData,
	SystemWebhookDeliverJobData,
	ThinUser,
	UserWebhookDeliverJobData,
} from '../queue/types.js';
import type {
	DbQueue,
	DeliverQueue,
	EndedPollNotificationQueue,
	PostScheduledNoteQueue,
	InboxQueue,
	ObjectStorageQueue,
	RelationshipQueue,
	SystemQueue,
	SystemWebhookDeliverQueue,
	UserWebhookDeliverQueue,
	ScheduledNoteDeleteQueue,
} from './QueueModule.js';
import type httpSignature from '@peertube/http-signature';
import type * as Bull from 'bullmq';

export const QUEUE_TYPES = [
	'system',
	'endedPollNotification',
	'postScheduledNote',
	'deliver',
	'inbox',
	'db',
	'relationship',
	'objectStorage',
	'userWebhookDeliver',
	'systemWebhookDeliver',
	'scheduledNoteDelete',
] as const;

export const REPEATABLE_SYSTEM_JOB_DEF: readonly { name: string; pattern: string; }[] = [{
	name: 'tickCharts',
	pattern: '55 * * * *',
}, {
	name: 'resyncCharts',
	pattern: '0 0 * * *',
}, {
	name: 'cleanCharts',
	pattern: '0 0 * * *',
}, {
	name: 'aggregateRetention',
	pattern: '0 0 * * *',
}, {
	name: 'clean',
	pattern: '0 0 * * *',
}, {
	name: 'checkExpiredMutings',
	pattern: '*/5 * * * *',
}, {
	name: 'bakeBufferedReactions',
	pattern: '0 0 * * *',
}, {
	name: 'checkModeratorsActivity',
	// 毎時30分に起動
	pattern: '30 * * * *',
}, {
	name: 'cleanRemoteNotes',
	// 毎日午前4時に起動(最も人の少ない時間帯)
	pattern: '0 4 * * *',
}, {
	name: 'autoDeleteNotes',
	// 매일 오전 3시에 실행
	pattern: '0 3 * * *',
}, {
	name: 'reconcileScheduledNoteDeletes',
	// 削除予定時刻を過ぎても残っているノートを5分ごとに拾う
	pattern: '*/5 * * * *',
}, {
	name: 'reconcileScheduledNotePosts',
	// 予約時刻を過ぎても投稿されていないドラフトと、後処理が終わっていない投稿済みのドラフトを5分ごとに拾う
	pattern: '*/5 * * * *',
}, {
	name: 'sweepNoteOutbox',
	// ノートの後処理のoutboxで、プロセスの停止や失敗で残ったレコードを毎分拾う
	pattern: '* * * * *',
}, {
	name: 'flushInstanceRequestReceived',
	// Redisに集約した連合サーバーの最終受信時刻と自動停止の解除を、5分ごとにDBへ書く
	pattern: '*/5 * * * *',
}];

/**
 * 以前の版で登録していて、いまは使わない定期ジョブの名前。
 *
 * registerJobSchedulersは、ここにある名前のスケジューラーだけを削除する。
 * 定期ジョブをREPEATABLE_SYSTEM_JOB_DEFから外すときは、その名前をここへ移す。
 */
export const OBSOLETE_SYSTEM_JOB_SCHEDULER_NAMES: readonly string[] = [];

/**
 * 登録済みのスケジューラーを削除するかどうか。
 *
 * - 既知の旧名（キーまたは名前がOBSOLETE_SYSTEM_JOB_SCHEDULER_NAMESにある）なら削除する
 * - 旧形式（`add(…, { repeat })`）で登録された、このアプリの定期ジョブなら削除する。
 *   同じ名前のJob Schedulerと二重に実行されるためである。旧形式のキーは、ジョブ名と異なる
 *   （BullMQ 5のハッシュ、またはそれ以前の`name:id:endDate:tz:pattern`）
 * - それ以外（知らない名前）は削除しない
 *
 * 定義にある名前の定期ジョブを、別のキーで登録したもの（別の実装が登録したものを含む）も削除する。
 * 定期ジョブの担当を別の実装へ移すときは、先にREPEATABLE_SYSTEM_JOB_DEFから外す。
 */
export function shouldRemoveJobScheduler(scheduler: { key: string; name?: string | null; }): boolean {
	if (OBSOLETE_SYSTEM_JOB_SCHEDULER_NAMES.includes(scheduler.key)) return true;
	const name = scheduler.name ?? scheduler.key;
	if (OBSOLETE_SYSTEM_JOB_SCHEDULER_NAMES.includes(name)) return true;
	const isLegacyRepeatable = scheduler.key !== name;
	if (isLegacyRepeatable && REPEATABLE_SYSTEM_JOB_DEF.some(def => def.name === name)) return true;
	return false;
}

@Injectable()
export class QueueService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject('queue:system') public systemQueue: SystemQueue,
		@Inject('queue:endedPollNotification') public endedPollNotificationQueue: EndedPollNotificationQueue,
		@Inject('queue:postScheduledNote') public postScheduledNoteQueue: PostScheduledNoteQueue,
		@Inject('queue:deliver') public deliverQueue: DeliverQueue,
		@Inject('queue:inbox') public inboxQueue: InboxQueue,
		@Inject('queue:db') public dbQueue: DbQueue,
		@Inject('queue:relationship') public relationshipQueue: RelationshipQueue,
		@Inject('queue:objectStorage') public objectStorageQueue: ObjectStorageQueue,
		@Inject('queue:userWebhookDeliver') public userWebhookDeliverQueue: UserWebhookDeliverQueue,
		@Inject('queue:systemWebhookDeliver') public systemWebhookDeliverQueue: SystemWebhookDeliverQueue,
		@Inject('queue:scheduledNoteDelete') public scheduledNoteDeleteQueue: ScheduledNoteDeleteQueue,

		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('queue');
	}

	/**
	 * 定期ジョブ（system queueのJob Scheduler）を登録する。
	 *
	 * queueプロセスの起動時（`CP_NO_JOB_SCHEDULERS`を設定していない場合）と、CLIの`register-job-schedulers`だけが呼ぶ。
	 * serverプロセスでは呼ばない。Redisに障害があってもserverの起動を妨げないためである。
	 *
	 * 定義にあるものはupsertする。削除するのは、既知の旧名（OBSOLETE_SYSTEM_JOB_SCHEDULER_NAMES）と、
	 * 旧形式（`add(…, { repeat })`）で登録されたこのアプリの定期ジョブだけである。
	 * 知らない名前のスケジューラーは消さない（新旧の版の混在や、別の実装が登録したものを消さないため）。
	 */
	@bindThis
	public async registerJobSchedulers(): Promise<{ upserted: string[]; removed: string[]; kept: string[]; }> {
		const upserted: string[] = [];
		for (const def of REPEATABLE_SYSTEM_JOB_DEF) {
			await this.systemQueue.upsertJobScheduler(def.name, {
				pattern: def.pattern,
				immediately: false,
			}, {
				name: def.name,
				data: { v: JOB_DATA_VERSION },
				opts: {
					// 期限ではなくcountで設定したいが、ジョブごとではなくキュー全体でカウントされるため、高頻度で実行されるジョブによって低頻度で実行されるジョブのログが消えることになる
					removeOnComplete: {
						age: 3600 * 24 * 7, // keep up to 7 days
					},
					removeOnFail: {
						age: 3600 * 24 * 7, // keep up to 7 days
					},
				},
			});
			upserted.push(def.name);
		}

		const removed: string[] = [];
		const kept: string[] = [];
		const schedulers = await this.systemQueue.getJobSchedulers();
		for (const scheduler of schedulers) {
			// 旧形式でハッシュ化されたキーは、名前を復元できないので対象にしない
			if (scheduler == null) continue;
			if (shouldRemoveJobScheduler(scheduler)) {
				await this.systemQueue.removeJobScheduler(scheduler.key);
				removed.push(scheduler.key);
			} else if (!REPEATABLE_SYSTEM_JOB_DEF.some(def => def.name === scheduler.key)) {
				kept.push(scheduler.key);
			}
		}

		this.logger.info(`Job schedulers registered: ${upserted.length} upserted, ${removed.length} removed${removed.length > 0 ? ` (${removed.join(', ')})` : ''}`);
		if (kept.length > 0) {
			this.logger.warn(`Unknown job schedulers were kept: ${kept.join(', ')}`);
		}

		return { upserted, removed, kept };
	}

	@bindThis
	public deliver(user: ThinUser, content: IActivity | null, to: string | null, isSharedInbox: boolean) {
		if (content == null) return null;
		if (to == null) return null;

		const contentBody = JSON.stringify(content);
		const digest = ApRequestCreator.createDigest(contentBody);

		const data: DeliverJobData = {
			v: JOB_DATA_VERSION,
			user: {
				id: user.id,
			},
			content: contentBody,
			digest,
			to,
			isSharedInbox,
		};

		const label = to.replace('https://', '').replace('/inbox', '');

		return this.deliverQueue.add(label, data, {
			attempts: this.config.deliverJobMaxAttempts ?? 12,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * ApDeliverManager-DeliverManager.execute()からinboxesを突っ込んでaddBulkしたい
	 * @param user `{ id: string; }` この関数ではThinUserに変換しないので前もって変換してください
	 * @param content IActivity | null
	 * @param inboxes `Map<string, boolean>` / key: to (inbox url), value: isSharedInbox (whether it is sharedInbox)
	 * @returns void
	 */
	@bindThis
	public async deliverMany(user: ThinUser, content: IActivity | null, inboxes: Map<string, boolean>) {
		if (content == null) return null;
		const contentBody = JSON.stringify(content);
		const digest = ApRequestCreator.createDigest(contentBody);

		const opts = {
			attempts: this.config.deliverJobMaxAttempts ?? 12,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		};

		await this.deliverQueue.addBulk(Array.from(inboxes.entries(), d => ({
			name: d[0].replace('https://', '').replace('/inbox', ''),
			data: {
				v: JOB_DATA_VERSION,
				user,
				content: contentBody,
				digest,
				to: d[0],
				isSharedInbox: d[1],
			},
			opts,
		})));

		return;
	}

	@bindThis
	public inbox(activity: IActivity, signature: httpSignature.IParsedSignature) {
		const data: InboxJobData = {
			v: JOB_DATA_VERSION,
			activity: activity,
			signature,
		};

		const label = (activity.id ?? '').replace('https://', '').replace('/activity', '');

		return this.inboxQueue.add(label, data, {
			attempts: this.config.inboxJobMaxAttempts ?? 8,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createDeleteDriveFilesJob(user: ThinUser) {
		return this.dbQueue.add('deleteDriveFiles', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportCustomEmojisJob(user: ThinUser) {
		return this.dbQueue.add('exportCustomEmojis', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportNotesJob(user: ThinUser) {
		return this.dbQueue.add('exportNotes', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportClipsJob(user: ThinUser) {
		return this.dbQueue.add('exportClips', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportFavoritesJob(user: ThinUser) {
		return this.dbQueue.add('exportFavorites', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportFollowingJob(user: ThinUser, excludeMuting = false, excludeInactive = false) {
		return this.dbQueue.add('exportFollowing', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			excludeMuting,
			excludeInactive,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportMuteJob(user: ThinUser) {
		return this.dbQueue.add('exportMuting', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportBlockingJob(user: ThinUser) {
		return this.dbQueue.add('exportBlocking', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportUserListsJob(user: ThinUser) {
		return this.dbQueue.add('exportUserLists', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createExportAntennasJob(user: ThinUser) {
		return this.dbQueue.add('exportAntennas', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createImportFollowingJob(user: ThinUser, fileId: MiDriveFile['id'], withReplies?: boolean) {
		return this.dbQueue.add('importFollowing', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			fileId: fileId,
			withReplies,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createImportFollowingToDbJob(user: ThinUser, targets: string[], withReplies?: boolean) {
		const jobs = targets.map(rel => this.generateToDbJobData('importFollowingToDb', { user, target: rel, withReplies }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportMutingJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importMuting', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createImportBlockingJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importBlocking', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createImportBlockingToDbJob(user: ThinUser, targets: string[]) {
		const jobs = targets.map(rel => this.generateToDbJobData('importBlockingToDb', { user, target: rel }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	private generateToDbJobData<T extends 'importFollowingToDb' | 'importBlockingToDb', D extends DbJobData<T>>(name: T, data: D): {
		name: string,
		data: D,
		opts: Bull.JobsOptions,
	} {
		return {
			name,
			data: { ...data, v: JOB_DATA_VERSION },
			opts: {
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 100,
				},
			},
		};
	}

	@bindThis
	public createImportUserListsJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importUserLists', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createImportCustomEmojisJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importCustomEmojis', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createImportAntennasJob(user: ThinUser, antenna: Antenna) {
		return this.dbQueue.add('importAntennas', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			antenna,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createDeleteAccountJob(user: ThinUser, opts: { soft?: boolean; } = {}) {
		return this.dbQueue.add('deleteAccount', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
			soft: opts.soft,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createTruncateAccountJob(user: ThinUser) {
		return this.dbQueue.add('truncateAccount', {
			v: JOB_DATA_VERSION,
			user: { id: user.id },
		}, {
			removeOnComplete: true,
			// 失敗したジョブは残す。処理側が受け付けない版で失敗したジョブを、処理側の更新後に再実行できるようにする
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/** ユーザーごとの自動削除ジョブのjobId。同じユーザーのジョブが待機中・実行中なら重ねて登録しない */
	public static autoDeleteUserNotesJobId(userId: ThinUser['id']) {
		return `autoDeleteUserNotes-${userId}`;
	}

	@bindThis
	public createAutoDeleteUserNotesJobs(users: ThinUser[]) {
		return this.dbQueue.addBulk(users.map(user => ({
			name: 'autoDeleteUserNotes',
			data: { v: JOB_DATA_VERSION, user: { id: user.id } },
			opts: {
				jobId: QueueService.autoDeleteUserNotesJobId(user.id),
				// 同じjobIdのジョブが残っていると翌日の登録が無視されるので、終わったら消す。
				// 処理側が受け付けない版で失敗したジョブも消えるが、定期ジョブ（autoDeleteNotes）が翌日にDBから登録し直す
				removeOnComplete: true,
				removeOnFail: true,
			},
		})));
	}

	/**
	 * ノートの検索索引を、実行時点のDBの状態に合わせるジョブを登録する。
	 *
	 * ジョブはノートIDだけを持つ。同じノートのジョブが重なっても、後から実行したジョブがDBの最新状態を書くので、
	 * 重複を取り除かない（実行中のジョブはDBを読み終えている場合があり、取り除くと最新状態が反映されない）。
	 */
	@bindThis
	public createSyncNoteIndexJob(noteId: MiNote['id']) {
		return this.dbQueue.add('syncNoteIndex', { v: JOB_DATA_VERSION, noteId }, {
			attempts: 5,
			backoff: { type: 'exponential', delay: 10 * 1000 },
			removeOnComplete: true,
			removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
		});
	}

	/**
	 * ノートの後処理のoutboxのレコードを処理するジョブ。同じレコードのジョブがキューにあれば登録しない。
	 * 失敗したときの再試行はoutboxのレコード（lockedUntil・attempts）で管理するので、ジョブ自体は再試行しない。
	 */
	@bindThis
	public createProcessNoteOutboxJob(seq: string) {
		return this.dbQueue.add('processNoteOutbox', { v: JOB_DATA_VERSION, seq }, {
			jobId: `noteOutbox-${seq}`,
			attempts: 1,
			removeOnComplete: true,
			removeOnFail: true,
		});
	}

	/**
	 * 通知を作ってから`delay`ミリ秒後に、未読なら「未読の通知がある」イベントとPush通知を送るジョブ（P3-2）。
	 * 送信の途中で失敗した場合に重ねて送らないよう、再試行しない。
	 */
	@bindThis
	public createUnreadNotificationJob(userId: MiUser['id'], streamId: string, delay: number) {
		return this.dbQueue.add('unreadNotification', { v: JOB_DATA_VERSION, userId, streamId }, {
			delay,
			attempts: 1,
			removeOnComplete: true,
			removeOnFail: { age: 24 * 60 * 60, count: 1000 },
		});
	}

	/**
	 * チャットのメッセージを送ってから`delay`ミリ秒後に、未読の受信者へイベントとPush通知を送るジョブ（P3-2）。
	 * 再試行しない理由は`createUnreadNotificationJob`と同じ。
	 */
	@bindThis
	public createUnreadChatMessageJob(messageId: MiChatMessage['id'], delay: number) {
		return this.dbQueue.add('unreadChatMessage', { v: JOB_DATA_VERSION, messageId }, {
			delay,
			attempts: 1,
			removeOnComplete: true,
			removeOnFail: { age: 24 * 60 * 60, count: 1000 },
		});
	}

	/**
	 * サインインの記録を作った後の、ログインの通知・ストリーム・メールを送るジョブ（P3-2）。
	 * 同じ記録のジョブは1つだけにする。送信の途中で失敗した場合に重ねて送らないよう、再試行しない。
	 */
	@bindThis
	public createSigninNotificationJob(signinId: MiSignin['id']) {
		return this.dbQueue.add('signinNotification', { v: JOB_DATA_VERSION, signinId }, {
			jobId: `signinNotification-${signinId}`,
			attempts: 1,
			removeOnComplete: true,
			removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
		});
	}

	/**
	 * 未登録のリモートユーザー（アカウントの移行先）を取得して登録するジョブ（P3-3）。
	 * 同じURIのジョブは、待っている間は1つだけにする（jobIdに`:`を使えないので、URIのハッシュにする）。
	 * 失敗したジョブを残すと、同じjobIdの後の要求が重複として捨てられるので、失敗したら削除する（完了も同じ）。
	 */
	@bindThis
	public createResolveRemoteUserJob(uri: string) {
		return this.dbQueue.add('resolveRemoteUser', { v: JOB_DATA_VERSION, uri }, {
			jobId: `resolveRemoteUser-${createHash('sha256').update(uri).digest('hex')}`,
			attempts: 3,
			backoff: {
				type: 'exponential',
				delay: 60 * 1000,
			},
			removeOnComplete: true,
			removeOnFail: true,
		});
	}

	@bindThis
	public createFollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string, silent?: boolean, withReplies?: boolean }[]) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('follow', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createUnfollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string }[]) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('unfollow', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createDelayedUnfollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string }[], delay: number) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('unfollow', rel, { delay }));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createBlockJob(blockings: { from: ThinUser, to: ThinUser, silent?: boolean }[]) {
		const jobs = blockings.map(rel => this.generateRelationshipJobData('block', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createUnblockJob(blockings: { from: ThinUser, to: ThinUser, silent?: boolean }[]) {
		const jobs = blockings.map(rel => this.generateRelationshipJobData('unblock', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	private generateRelationshipJobData(name: 'follow' | 'unfollow' | 'block' | 'unblock', data: RelationshipJobData, opts: Bull.JobsOptions = {}): {
		name: string,
		data: RelationshipJobData,
		opts: Bull.JobsOptions,
	} {
		return {
			name,
			data: {
				v: JOB_DATA_VERSION,
				from: { id: data.from.id },
				to: { id: data.to.id },
				silent: data.silent,
				requestId: data.requestId,
				withReplies: data.withReplies,
			},
			opts: {
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 100,
				},
				...opts,
			},
		};
	}

	@bindThis
	public createDeleteObjectStorageFileJob(key: string) {
		return this.objectStorageQueue.add('deleteFile', {
			v: JOB_DATA_VERSION,
			key: key,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public createCleanRemoteFilesJob() {
		return this.objectStorageQueue.add('cleanRemoteFiles', { v: JOB_DATA_VERSION }, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * @see UserWebhookDeliverJobData
	 * @see UserWebhookDeliverProcessorService
	 */
	@bindThis
	public userWebhookDeliver<T extends WebhookEventTypes>(
		webhook: MiWebhook,
		type: T,
		content: UserWebhookPayload<T>,
		opts?: { attempts?: number },
	) {
		const data: UserWebhookDeliverJobData = {
			v: JOB_DATA_VERSION,
			type,
			content,
			webhookId: webhook.id,
			userId: webhook.userId,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: Date.now(),
			eventId: randomUUID(),
		};

		return this.userWebhookDeliverQueue.add(webhook.id, data, {
			attempts: opts?.attempts ?? 4,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * @see SystemWebhookDeliverJobData
	 * @see SystemWebhookDeliverProcessorService
	 */
	@bindThis
	public systemWebhookDeliver<T extends SystemWebhookEventType>(
		webhook: MiSystemWebhook,
		type: T,
		content: SystemWebhookPayload<T>,
		opts?: { attempts?: number },
	) {
		const data: SystemWebhookDeliverJobData = {
			v: JOB_DATA_VERSION,
			type,
			content,
			webhookId: webhook.id,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: Date.now(),
			eventId: randomUUID(),
		};

		return this.systemWebhookDeliverQueue.add(webhook.id, data, {
			attempts: opts?.attempts ?? 4,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * 予約削除ジョブのID。ノートごとに1つに固定し、延期・解除のときにIDで取り消せるようにする。
	 * BullMQは整数だけのIDとコロンを含むIDを拒否するので、この形式にしている。
	 */
	public static scheduledNoteDeleteJobId(noteId: MiNote['id']): string {
		return `scheduledNoteDelete-${noteId}`;
	}

	/**
	 * 予約削除ジョブを、DBのdeleteAtに合わせる。deleteAtがあれば登録し直し、なければ取り消す。
	 *
	 * 失敗しても例外を投げず、記録だけする。ノートの作成・更新の後処理（配信、配送、索引）を止めないためである。
	 * ジョブがずれたままでも、削除するかどうかは処理の時点でDBのdeleteAtから決まり、
	 * 登録できなかった予約は照合ジョブ（reconcileScheduledNoteDeletes）が拾う。
	 */
	@bindThis
	public async syncScheduledNoteDelete(noteId: MiNote['id'], deleteAt: Date | null): Promise<void> {
		try {
			if (deleteAt != null) {
				await this.scheduleNoteDelete(noteId, deleteAt);
			} else {
				await this.cancelScheduledNoteDelete(noteId);
			}
		} catch (err) {
			this.logger.error(`Failed to sync scheduled note delete job: ${noteId}`, { error: err });
		}
	}

	/**
	 * ノートの予約削除ジョブを登録する。すでにジョブがあれば、取り消してから登録し直す。
	 *
	 * 削除するかどうかはDBのdeleteAtで決まる。ジョブは実行のきっかけにすぎないので、
	 * 実行中で取り消せなかった場合や登録に失敗した場合でも、誤って削除されることはない。
	 */
	@bindThis
	public async scheduleNoteDelete(noteId: MiNote['id'], deleteAt: Date): Promise<void> {
		await this.cancelScheduledNoteDelete(noteId);
		await this.ensureNoteDeleteScheduled(noteId, deleteAt);
	}

	/**
	 * ノートの予約削除ジョブがなければ登録する。すでにあれば何もしない。
	 */
	@bindThis
	public async ensureNoteDeleteScheduled(noteId: MiNote['id'], deleteAt: Date): Promise<void> {
		await this.scheduledNoteDeleteQueue.add(noteId, {
			v: JOB_DATA_VERSION,
			noteId,
		}, {
			jobId: QueueService.scheduledNoteDeleteJobId(noteId),
			delay: Math.max(0, deleteAt.getTime() - Date.now()),
			attempts: 3,
			backoff: {
				type: 'exponential',
				delay: 10 * 1000,
			},
			removeOnComplete: true,
			// 失敗したジョブが残っていても、再登録の前に同じIDで取り消すので妨げにならない
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public async cancelScheduledNoteDelete(noteId: MiNote['id']): Promise<void> {
		await this.scheduledNoteDeleteQueue.remove(QueueService.scheduledNoteDeleteJobId(noteId));
	}

	/**
	 * 予約投稿ジョブのID。ドラフトごとに1つに固定し、変更・取り消しのときにIDで取り消せるようにする。
	 * BullMQは整数だけのIDとコロンを含むIDを拒否するので、この形式にしている。
	 */
	public static postScheduledNoteJobId(draftId: MiNoteDraft['id']): string {
		return `postScheduledNote-${draftId}`;
	}

	/**
	 * 予約投稿ジョブを、ドラフトの予約に合わせる。予約があれば登録し直し、なければ取り消す。
	 *
	 * 失敗しても例外を投げず、記録だけする。ドラフトの保存自体は成功しているためである。
	 * 投稿するかどうかは処理の時点でDBのドラフトから決まり、登録できなかった予約は
	 * 照合ジョブ（reconcileScheduledNotePosts）が拾う。
	 */
	@bindThis
	public async syncScheduledNotePost(draftId: MiNoteDraft['id'], scheduledAt: Date | null): Promise<void> {
		try {
			if (scheduledAt != null) {
				await this.scheduleNotePost(draftId, scheduledAt);
			} else {
				await this.cancelScheduledNotePost(draftId);
			}
		} catch (err) {
			this.logger.error(`Failed to sync scheduled note post job: ${draftId}`, { error: err });
		}
	}

	/**
	 * 予約投稿ジョブを登録する。すでにジョブがあれば、取り消してから登録し直す。
	 *
	 * 投稿するかどうかはDBのドラフトで決まる。ジョブは実行のきっかけにすぎないので、
	 * 実行中で取り消せなかった場合でも、変更前の時刻に投稿されることはない。
	 */
	@bindThis
	public async scheduleNotePost(draftId: MiNoteDraft['id'], scheduledAt: Date): Promise<void> {
		await this.cancelScheduledNotePost(draftId);
		await this.ensureNotePostScheduled(draftId, scheduledAt);
	}

	/**
	 * 予約投稿ジョブがなければ登録する。すでにあれば（失敗・完了したものを含む）何もしない。
	 */
	@bindThis
	public async ensureNotePostScheduled(draftId: MiNoteDraft['id'], scheduledAt: Date): Promise<void> {
		await this.postScheduledNoteQueue.add(draftId, {
			v: JOB_DATA_VERSION,
			noteDraftId: draftId,
		}, {
			jobId: QueueService.postScheduledNoteJobId(draftId),
			delay: Math.max(0, scheduledAt.getTime() - Date.now()),
			attempts: 5,
			backoff: {
				type: 'exponential',
				delay: 30 * 1000,
			},
			removeOnComplete: true,
			// 失敗したジョブは調査のために残す。同じIDでの登録を妨げるので、再登録の前に取り消す
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public async cancelScheduledNotePost(draftId: MiNoteDraft['id']): Promise<void> {
		await this.postScheduledNoteQueue.remove(QueueService.postScheduledNoteJobId(draftId));
	}

	@bindThis
	private getQueue(type: typeof QUEUE_TYPES[number]): Bull.Queue {
		switch (type) {
			case 'system': return this.systemQueue;
			case 'endedPollNotification': return this.endedPollNotificationQueue;
			case 'postScheduledNote': return this.postScheduledNoteQueue;
			case 'deliver': return this.deliverQueue;
			case 'inbox': return this.inboxQueue;
			case 'db': return this.dbQueue;
			case 'relationship': return this.relationshipQueue;
			case 'objectStorage': return this.objectStorageQueue;
			case 'userWebhookDeliver': return this.userWebhookDeliverQueue;
			case 'systemWebhookDeliver': return this.systemWebhookDeliverQueue;
			case 'scheduledNoteDelete': return this.scheduledNoteDeleteQueue;
			default: throw new Error(`Unrecognized queue type: ${type}`);
		}
	}

	@bindThis
	public async queueClear(queueType: typeof QUEUE_TYPES[number], state: '*' | 'completed' | 'wait' | 'active' | 'paused' | 'prioritized' | 'delayed' | 'failed') {
		const queue = this.getQueue(queueType);

		if (state === '*') {
			await Promise.all([
				queue.clean(0, 0, 'completed'),
				queue.clean(0, 0, 'wait'),
				queue.clean(0, 0, 'active'),
				queue.clean(0, 0, 'paused'),
				queue.clean(0, 0, 'prioritized'),
				queue.clean(0, 0, 'delayed'),
				queue.clean(0, 0, 'failed'),
			]);
		} else {
			await queue.clean(0, 0, state);
		}
	}

	@bindThis
	public async queuePromoteJobs(queueType: typeof QUEUE_TYPES[number]) {
		const queue = this.getQueue(queueType);
		await queue.promoteJobs();
	}

	@bindThis
	public async queueRetryJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const queue = this.getQueue(queueType);
		const job = await queue.getJob(jobId);
		if (job != null) {
			if (job.finishedOn != null) {
				await job.retry();
			} else {
				await job.promote();
			}
		}
	}

	@bindThis
	public async queueRemoveJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const queue = this.getQueue(queueType);
		const job = await queue.getJob(jobId);
		if (job != null) {
			await job.remove();
		}
	}

	@bindThis
	private packJobData(job: Bull.Job): Packed<'QueueJob'> {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const stacktrace = job.stacktrace ? job.stacktrace.filter(Boolean) : [];
		stacktrace.reverse();

		return {
			id: job.id!,
			name: job.name,
			data: job.data,
			opts: job.opts,
			timestamp: job.timestamp,
			processedOn: job.processedOn,
			processedBy: job.processedBy,
			finishedOn: job.finishedOn,
			progress: job.progress,
			attempts: job.attemptsMade,
			delay: job.delay,
			failedReason: job.failedReason,
			stacktrace: stacktrace,
			returnValue: job.returnvalue,
			isFailed: !!job.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
		};
	}

	@bindThis
	public async queueGetJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const queue = this.getQueue(queueType);
		const job = await queue.getJob(jobId);
		if (job != null) {
			return this.packJobData(job);
		} else {
			throw new Error(`Job not found: ${jobId}`);
		}
	}

	@bindThis
	public async queueGetJobLogs(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const queue = this.getQueue(queueType);
		const result = await queue.getJobLogs(jobId);
		return result.logs;
	}

	@bindThis
	public async queueGetJobs(queueType: typeof QUEUE_TYPES[number], jobTypes: JobType[], search?: string) {
		const RETURN_LIMIT = 100;
		const queue = this.getQueue(queueType);
		let jobs: Bull.Job[];

		if (search) {
			jobs = await queue.getJobs(jobTypes, 0, 1000);

			jobs = jobs.filter(job => {
				const jobString = JSON.stringify(job).toLowerCase();
				return search.toLowerCase().split(' ').every(term => {
					return jobString.includes(term);
				});
			});

			jobs = jobs.slice(0, RETURN_LIMIT);
		} else {
			jobs = await queue.getJobs(jobTypes, 0, RETURN_LIMIT);
		}

		return jobs.map(job => this.packJobData(job));
	}

	@bindThis
	public async queueGetQueues() {
		const fetchings = QUEUE_TYPES.map(async type => {
			const queue = this.getQueue(type);

			const counts = await queue.getJobCounts();
			const isPaused = await queue.isPaused();
			const metrics_completed = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
			const metrics_failed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);

			return {
				name: type,
				counts: counts,
				isPaused,
				metrics: {
					completed: metrics_completed,
					failed: metrics_failed,
				},
			};
		});

		return await Promise.all(fetchings);
	}

	@bindThis
	public async queueGetQueue(queueType: typeof QUEUE_TYPES[number]) {
		const queue = this.getQueue(queueType);
		const counts = await queue.getJobCounts();
		const isPaused = await queue.isPaused();
		const metrics_completed = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
		const metrics_failed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);
		const db = parseRedisInfo(await (await queue.client).info());

		return {
			name: queueType,
			qualifiedName: queue.qualifiedName,
			counts: counts,
			isPaused,
			metrics: {
				completed: metrics_completed,
				failed: metrics_failed,
			},
			db: {
				version: db.redis_version,
				mode: db.redis_mode,
				runId: db.run_id,
				processId: db.process_id,
				port: parseInt(db.tcp_port),
				os: db.os,
				uptime: parseInt(db.uptime_in_seconds),
				memory: {
					total: parseInt(db.total_system_memory) || parseInt(db.maxmemory),
					used: parseInt(db.used_memory),
					fragmentationRatio: parseInt(db.mem_fragmentation_ratio),
					peak: parseInt(db.used_memory_peak),
				},
				clients: {
					connected: parseInt(db.connected_clients),
					blocked: parseInt(db.blocked_clients),
				},
			},
		};
	}
}
