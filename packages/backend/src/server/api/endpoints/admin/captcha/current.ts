/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { CaptchaService, supportedCaptchaProviders } from '@/core/CaptchaService.js';

export const meta = {
	tags: ['admin', 'captcha'],

	requireCredential: true,
	requireAdmin: true,

	// 実態はmetaの取得であるため
	kind: 'read:admin:meta',

	res: {
		type: 'object',
		properties: {
			provider: {
				optional: false,
				type: 'string',
				enum: supportedCaptchaProviders,
			},
			hcaptcha: {
				optional: false,
				type: 'object',
				properties: {
					siteKey: { optional: false, type: 'string', nullable: true },
					secretKey: { optional: false, type: 'string', nullable: true },
				},
			},
			mcaptcha: {
				optional: false,
				type: 'object',
				properties: {
					siteKey: { optional: false, type: 'string', nullable: true },
					secretKey: { optional: false, type: 'string', nullable: true },
					instanceUrl: { optional: false, type: 'string', nullable: true },
				},
			},
			recaptcha: {
				optional: false,
				type: 'object',
				properties: {
					siteKey: { optional: false, type: 'string', nullable: true },
					secretKey: { optional: false, type: 'string', nullable: true },
				},
			},
			turnstile: {
				optional: false,
				type: 'object',
				properties: {
					siteKey: { optional: false, type: 'string', nullable: true },
					secretKey: { optional: false, type: 'string', nullable: true },
				},
			},
		},
	},
} as const;

export const paramDef = {} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private captchaService: CaptchaService,
	) {
		super(meta, paramDef, async () => {
			return this.captchaService.get();
		});
	}
}
