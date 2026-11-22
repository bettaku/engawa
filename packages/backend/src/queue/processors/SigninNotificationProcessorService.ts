/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { MiSignin } from '@/models/Signin.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { EmailService } from '@/core/EmailService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import type { DbSigninNotificationJobData } from '../types.js';
import type * as Bull from 'bullmq';

/**
 * サインインの記録を作った後の、ログインの通知・ストリーム・メールの送信（P3-2）。
 * 以前はサインインの応答の後に`setImmediate`で実行しており、プロセスの停止で失われていた。
 */
@Injectable()
export class SigninNotificationProcessorService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private signinEntityService: SigninEntityService,
		private emailService: EmailService,
		private notificationService: NotificationService,
		private globalEventService: GlobalEventService,
	) {
	}

	@bindThis
	public async process(job: Bull.Job<DbSigninNotificationJobData>): Promise<string> {
		// 記録は応答の直前に書いたばかりなので、読み取りレプリカ（`dbReplications`）ではなく書き込み先から読む
		const queryRunner = this.db.createQueryRunner('master');
		let record: MiSignin | null;
		try {
			record = await queryRunner.manager.findOneBy(MiSignin, { id: job.data.signinId });
		} finally {
			await queryRunner.release();
		}
		if (record == null) return 'skip: signin record not found';

		this.notificationService.createNotification(record.userId, 'login', {
			userIp: record.ip,
		});

		this.globalEventService.publishMainStream(record.userId, 'signin', await this.signinEntityService.pack(record));

		const profile = await this.userProfilesRepository.findOneBy({ userId: record.userId });
		if (profile?.email && profile.emailVerified) {
			await this.emailService.sendEmail(profile.email, 'New login / ログインがありました / 로그인 알림',
				'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。/ 새 기기에서 로그인을 시도했어요. 이 로그인이 신뢰할 수 있는 기기에서 한 것이 아니라면, 즉시 비밀번호를 변경하는 등의 조치를 통해 계정의 보안 상태를 업데이트해야 해요.',
				'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。/ 새 기기에서 로그인을 시도했어요. 이 로그인이 신뢰할 수 있는 기기에서 한 것이 아니라면, 즉시 비밀번호를 변경하는 등의 조치를 통해 계정의 보안 상태를 업데이트해야 해요.');
		}

		return 'ok';
	}
}
