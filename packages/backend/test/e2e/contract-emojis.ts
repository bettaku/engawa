/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { MiAccessToken } from '@/models/AccessToken.js';
import { MiEmoji } from '@/models/Emoji.js';
import { api, createAppToken, initTestDb, port, signup } from '../utils.js';
import { checkAgainstApiJson, performContractCase } from '../misc/contract.js';
import seed from '../fixtures/contract/emojis/seed.json' with { type: 'json' };
import fixture from '../fixtures/contract/emojis/cases.json' with { type: 'json' };
import recorded from '../fixtures/contract/emojis/responses.json' with { type: 'json' };
import apiJson from '../../api.json' with { type: 'json' };
import type { ApiJson, ContractCase, ContractTokens, RecordedResponse } from '../misc/contract.js';
import type { DataSource } from 'typeorm';

// CONTRACT_UPDATE=1 なら、比較せずに応答を responses.json に書き直す（差分はレビューで確かめる）。
// CONTRACT_OUTPUT_DIR があれば、比較の結果にかかわらず実際の応答をそこに書く（CIの成果物にする）
const update = process.env.CONTRACT_UPDATE === '1';
// 更新モードは比較しないので、CIで誤って有効になっても通ってしまう。CIでは使わせない
if (update && process.env.CI) {
	throw new Error('CONTRACT_UPDATE=1 is not allowed on CI. Record the responses locally and commit the diff');
}
const outputDir = process.env.CONTRACT_OUTPUT_DIR;
const responsesPath = fileURLToPath(new URL('../fixtures/contract/emojis/responses.json', import.meta.url));

const cases = fixture.cases as ContractCase[];
const expected = recorded.responses as Record<string, RecordedResponse>;

// RUST-03: 絵文字のHTTP契約（正常・異常・省略・認証あり/なし）を、保存した応答と比べる
describe('HTTPの契約: 絵文字', () => {
	let db: DataSource;
	let tokens: ContractTokens;
	const actual: Record<string, RecordedResponse> = {};

	beforeAll(async () => {
		db = await initTestDb(true);
		await db.getRepository(MiEmoji).insert(seed.emojis);

		const root = await signup({ username: 'contract_root' });
		const alice = await signup({ username: 'contract_alice' });
		const carol = await signup({ username: 'contract_carol' });
		await api('admin/suspend-user', { userId: carol.id }, root);

		tokens = {
			native: alice.token,
			app: await createAppToken(alice, []),
			suspended: carol.token,
		};
	}, 1000 * 60 * 2);

	afterAll(async () => {
		const ordered = Object.fromEntries(cases.filter(c => c.id in actual).map(c => [c.id, actual[c.id]]));
		if (update) {
			await writeFile(responsesPath, JSON.stringify({ $comment: recorded.$comment, responses: ordered }, null, '\t') + '\n');
		}
		if (outputDir) {
			await mkdir(outputDir, { recursive: true });
			await writeFile(join(outputDir, 'emojis.json'), JSON.stringify({ responses: ordered }, null, '\t') + '\n');
		}
		await db.destroy();
	});

	test.each(cases.map(c => [`${c.id}: ${c.name}`, c] as const))('%s', async (_, c) => {
		const res = await performContractCase(`http://127.0.0.1:${port}/`, c, tokens);
		actual[c.id] = res;

		if (c.apiJson !== false) {
			assert.deepStrictEqual(checkAgainstApiJson(apiJson as unknown as ApiJson, c, res), [], JSON.stringify(res));
		}

		if (!update) {
			assert.ok(c.id in expected, `${c.id} has no recorded response. Run with CONTRACT_UPDATE=1`);
			assert.deepStrictEqual(res, expected[c.id]);
		}
	});

	test('保存した応答に、要求のないものが残っていない', () => {
		const ids = new Set(cases.map(c => c.id));
		assert.deepStrictEqual(Object.keys(expected).filter(id => !ids.has(id)), []);
	});

	// 認証に伴う書き込み。参照のエンドポイントでも、アプリのtokenは最終使用日時を更新する（移行計画 §4.1 の副作用）
	test('アプリのtokenで呼ぶと、tokenのlastUsedAtが記録される', async () => {
		const accessTokens = db.getRepository(MiAccessToken);
		await accessTokens.update({ token: tokens.app }, { lastUsedAt: null });

		await performContractCase(`http://127.0.0.1:${port}/`, cases.find(c => c.id === 'emojis/get/app') as ContractCase, tokens);

		// 更新は応答を待たずに行われる
		let lastUsedAt: Date | null = null;
		for (let i = 0; i < 50 && lastUsedAt == null; i++) {
			lastUsedAt = (await accessTokens.findOneByOrFail({ token: tokens.app })).lastUsedAt;
			if (lastUsedAt == null) await setTimeout(100);
		}
		assert.notStrictEqual(lastUsedAt, null);
	});
});
