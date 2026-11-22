/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { IncomingMessage } from 'http';
import {
	api,
	connectStream,
	createAppToken,
	failedApiCall,
	relativeFetch,
	signup,
	successfulApiCall,
	uploadFile,
	waitFire,
} from '../utils.js';
import type * as misskey from 'cherrypick-js';

describe('API', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
	}, 1000 * 60 * 2);

	describe('General validation', () => {
		test('wrong type', async () => {
			const res = await api('test', {
				required: true,
				// @ts-expect-error string must be string
				string: 42,
			});
			assert.strictEqual(res.status, 400);
		});

		test('missing require param', async () => {
			// @ts-expect-error required is required
			const res = await api('test', {
				string: 'a',
			});
			assert.strictEqual(res.status, 400);
		});

		test('invalid misskey:id (empty string)', async () => {
			const res = await api('test', {
				required: true,
				id: '',
			});
			assert.strictEqual(res.status, 400);
		});

		test('valid misskey:id', async () => {
			const res = await api('test', {
				required: true,
				id: '8wvhjghbxu',
			});
			assert.strictEqual(res.status, 200);
		});

		test('default value', async () => {
			const res = await api('test', {
				required: true,
				string: 'a',
			});
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.default, 'hello');
		});

		test('can set null even if it has default value', async () => {
			const res = await api('test', {
				required: true,
				nullableDefault: null,
			});
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.nullableDefault, null);
		});

		test('cannot set undefined if it has default value', async () => {
			const res = await api('test', {
				required: true,
				nullableDefault: undefined,
			});
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.nullableDefault, 'hello');
		});
	});

	test('管理者専用のAPIのアクセス制限', async () => {
		const application = await createAppToken(alice, ['read:account']);
		const application2 = await createAppToken(alice, ['read:admin:index-stats']);
		const application3 = await createAppToken(bob, []);
		const application4 = await createAppToken(bob, ['read:admin:index-stats']);

		// aliceは管理者、APIを使える
		await successfulApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: alice,
		});

		// bobは一般ユーザーだからダメ
		await failedApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: bob,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});

		// publicアクセスももちろんダメ
		await failedApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: undefined,
		}, {
			status: 401,
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
		});

		// ごまがしもダメ
		await failedApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: { token: 'tsukawasete' },
		}, {
			status: 401,
			code: 'AUTHENTICATION_FAILED',
			id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
		});

		await successfulApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: { token: application2 },
		});

		await failedApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: { token: application },
		}, {
			status: 403,
			code: 'PERMISSION_DENIED',
			id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
		});

		await failedApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: { token: application3 },
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});

		await failedApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: { token: application4 },
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});
	});

	describe('Authentication header', () => {
		test('一般リクエスト', async () => {
			await successfulApiCall({
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: {
					token: alice.token,
					bearer: true,
				},
			});
		});

		test('multipartリクエスト', async () => {
			const result = await uploadFile({
				token: alice.token,
				bearer: true,
			});
			assert.strictEqual(result.status, 200);
		});

		test('streaming', async () => {
			const fired = await waitFire(
				{
					token: alice.token,
					bearer: true,
				},
				'homeTimeline',
				() => api('notes/create', { text: 'foo' }, alice),
				msg => msg.type === 'note' && msg.body.text === 'foo',
			);
			assert.strictEqual(fired, true);
		});
	});

	describe('tokenエラー応答でWWW-Authenticate headerを送る', () => {
		describe('invalid_token', () => {
			test('一般リクエスト', async () => {
				const result = await api('admin/get-index-stats', {}, {
					token: 'noridev',
					bearer: true,
				});
				assert.strictEqual(result.status, 401);
				assert.ok(result.headers.get('WWW-Authenticate')?.startsWith('Bearer realm="Engawa", error="invalid_token", error_description'));
			});

			test('multipartリクエスト', async () => {
				const result = await uploadFile({
					token: 'noridev',
					bearer: true,
				});
				assert.strictEqual(result.status, 401);
				assert.ok(result.headers.get('WWW-Authenticate')?.startsWith('Bearer realm="Engawa", error="invalid_token", error_description'));
			});

			test('streaming', async () => {
				await assert.rejects(connectStream(
					{
						token: 'noridev',
						bearer: true,
					},
					'homeTimeline',
					() => { },
				), (err: IncomingMessage) => {
					assert.strictEqual(err.statusCode, 401);
					assert.ok(err.headers['www-authenticate']?.startsWith('Bearer realm="Engawa", error="invalid_token", error_description'));
					return true;
				});
			});
		});

		describe('tokenがないとrealmだけおくる', () => {
			test('一般リクエスト', async () => {
				const result = await api('admin/get-index-stats', {});
				assert.strictEqual(result.status, 401);
				assert.strictEqual(result.headers.get('WWW-Authenticate'), 'Bearer realm="Engawa"');
			});

			test('multipartリクエスト', async () => {
				const result = await uploadFile();
				assert.strictEqual(result.status, 401);
				assert.strictEqual(result.headers.get('WWW-Authenticate'), 'Bearer realm="Engawa"');
			});
		});

		test('invalid_request', async () => {
			// @ts-expect-error text must be string
			const result = await api('notes/create', { text: true }, {
				token: alice.token,
				bearer: true,
			});
			assert.strictEqual(result.status, 400);
			assert.ok(result.headers.get('WWW-Authenticate')?.startsWith('Bearer realm="Engawa", error="invalid_request", error_description'));
		});

		describe('invalid bearer format', () => {
			test('No preceding bearer', async () => {
				const result = await relativeFetch('api/notes/create', {
					method: 'POST',
					headers: {
						Authorization: alice.token,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text: 'test' }),
				});
				assert.strictEqual(result.status, 401);
			});

			test('Lowercase bearer', async () => {
				const result = await relativeFetch('api/notes/create', {
					method: 'POST',
					headers: {
						Authorization: `bearer ${alice.token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text: 'test' }),
				});
				assert.strictEqual(result.status, 401);
			});

			test('No space after bearer', async () => {
				const result = await relativeFetch('api/notes/create', {
					method: 'POST',
					headers: {
						Authorization: `Bearer${alice.token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text: 'test' }),
				});
				assert.strictEqual(result.status, 401);
			});
		});
	});

	// P2-6: /api以下の非2xxの応答は、すべて { error: { message, code, id, kind } } の形にする
	describe('エラー応答の形', () => {
		async function expectError(res: Awaited<ReturnType<typeof relativeFetch>>, status: number, code: string) {
			assert.strictEqual(res.status, status);
			assert.match(res.headers.get('Content-Type') ?? '', /application\/json/);
			const body = await res.json() as { error: { message: string; code: string; id: string; kind: string } };
			assert.strictEqual(body.error.code, code);
			assert.strictEqual(typeof body.error.message, 'string');
			assert.strictEqual(typeof body.error.id, 'string');
			assert.strictEqual(typeof body.error.kind, 'string');
		}
		const json = (body: string) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

		test.each(['GET', 'POST', 'DELETE'])('未知のエンドポイント（%s）は404', async (method) => {
			await expectError(await relativeFetch('api/no-such-endpoint', { method }), 404, 'UNKNOWN_API_ENDPOINT');
		});

		test('GETを受け付けないエンドポイントへのGETは405', async () => {
			await expectError(await relativeFetch('api/notes/create'), 405, 'METHOD_NOT_ALLOWED');
		});

		test('JSONの構文の誤りは400', async () => {
			await expectError(await relativeFetch('api/meta', json('{"detail":')), 400, 'INVALID_REQUEST');
		});

		test('本文の上限を超えると413', async () => {
			await expectError(await relativeFetch('api/meta', json(JSON.stringify({ text: 'a'.repeat(1024 * 1024 + 1) }))), 413, 'PAYLOAD_TOO_LARGE');
		});

		test('未対応のContent-Typeは415', async () => {
			await expectError(await relativeFetch('api/meta', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: '<a/>' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
		});

		test('文字列でないトークンは400（応答を返す）', async () => {
			await expectError(await relativeFetch('api/i', json(JSON.stringify({ i: 1 }))), 400, 'INVALID_PARAM');
		});

		test('multipartでないファイルのアップロードは400', async () => {
			await expectError(await relativeFetch('api/drive/files/create', { method: 'POST', headers: { Authorization: `Bearer ${alice.token}` } }), 400, 'INVALID_REQUEST');
		});

		test('本文なしで400を返していた経路にもエラーを付ける', async () => {
			await expectError(await relativeFetch('api/signin-flow', json(JSON.stringify({}))), 400, 'INVALID_REQUEST');
		});

		test('サインインのエラーはidを保ったまま共通の形にする', async () => {
			const res = await relativeFetch('api/signin-flow', json(JSON.stringify({ username: 'no_such_user_for_signin' })));
			await expectError(res.clone(), 404, 'NO_SUCH_USER');
			assert.strictEqual(((await res.json()) as { error: { id: string } }).error.id, '6cc579cc-885d-43d8-95c2-b8c7fc963280');
		});

		test('プラグインが文字列で返すエラー（CORSのpreflight）も共通の形にする', async () => {
			await expectError(await relativeFetch('api/meta', { method: 'OPTIONS' }), 400, 'INVALID_REQUEST');
		});

		test('パスワードの誤りは500ではなくINCORRECT_PASSWORD', async () => {
			const res = await api('i/change-password', { currentPassword: 'wrong', newPassword: 'new' }, alice);
			assert.strictEqual(res.status, 400);
			assert.strictEqual((res.body as unknown as { error: { code: string } }).error.code, 'INCORRECT_PASSWORD');
		});
	});
});
