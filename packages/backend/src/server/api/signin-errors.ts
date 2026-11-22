/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { errorBody } from './http-errors.js';

/**
 * サインイン（signin-flow・signin-with-passkey）のエラー。
 * 以前はidだけを返していた。フロントエンドはidで判定しているので、idはそのままにする（P2-6）
 */
const signinErrors = {
	'6cc579cc-885d-43d8-95c2-b8c7fc963280': { message: 'No such user.', code: 'NO_SUCH_USER' },
	'652f899f-66d4-490e-993e-6606c8ec04c3': { message: 'No such user.', code: 'NO_SUCH_USER' },
	'e03a5f46-d309-4865-9b69-56282d94e1eb': { message: 'This account has been suspended.', code: 'YOUR_ACCOUNT_SUSPENDED', kind: 'permission' },
	'932c904e-9460-45b7-9ce6-7ed33be7eb2c': { message: 'Incorrect username or password.', code: 'INCORRECT_CREDENTIALS', kind: 'permission' },
	'cdf1235b-ac71-46d4-a3a6-84ccce48df6f': { message: 'Two-factor authentication failed.', code: 'TWO_FACTOR_AUTHENTICATION_FAILED', kind: 'permission' },
	'93b86c4b-72f9-40eb-9815-798928603d1e': { message: 'Security key authentication failed.', code: 'SECURITY_KEY_AUTHENTICATION_FAILED', kind: 'permission' },
	'2d84773e-f7b7-4d0b-8f72-bb69b584c912': { message: 'Passwordless login is not enabled for this account.', code: 'PASSWORDLESS_LOGIN_DISABLED', kind: 'permission' },
	'1658cc2e-4495-461f-aee4-d403cdf073c1': { message: 'Invalid authentication context.', code: 'INVALID_CONTEXT' },
	'4e30e80c-e338-45a0-8c8f-44455efa3b76': { message: 'Sign in failed.', code: 'SIGNIN_FAILED', kind: 'server' },
	// WebAuthnService.verifySignInWithPasskeyAuthenticationのエラーをそのまま返す
	'2d16e51c-007b-4edd-afd2-f7dd02c947f6': { message: 'No such authentication challenge.', code: 'NO_SUCH_CHALLENGE', kind: 'permission' },
	'36b96a7d-b547-412d-aeed-2d611cdc8cdc': { message: 'Unknown security key.', code: 'UNKNOWN_SECURITY_KEY', kind: 'permission' },
	'b18c89a7-5b5e-4cec-bb5b-0419f332d430': { message: 'Security key authentication failed.', code: 'SECURITY_KEY_AUTHENTICATION_FAILED', kind: 'permission' },
} as const satisfies Record<string, { message: string; code: string; kind?: 'client' | 'server' | 'permission' }>;

export type SigninErrorId = keyof typeof signinErrors;

export function signinErrorBody(id: string) {
	const known = Object.hasOwn(signinErrors, id) ? signinErrors[id as SigninErrorId] : { message: 'Sign in failed.', code: 'SIGNIN_FAILED', kind: 'permission' };
	return errorBody({ ...known, id });
}
