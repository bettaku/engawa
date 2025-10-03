/*
 * SPDX-FileCopyrightText: esurio and cherrypick contiributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { Config } from '@/config.js';

@Injectable()
export class BearcapsUriService {
	constructor(
		@Inject(DI.config)
		private config: Config,
	) {}

	@bindThis
	public generateBearcapsUri(url: string, token: string): string {}

	@bindThis
	public generateChatToken(): string {
		const noise = nanoid(32);
		const id = randomBytes(32).toString('hex');
		const token = `${noise}${id}`;
		return token;
	}
}
