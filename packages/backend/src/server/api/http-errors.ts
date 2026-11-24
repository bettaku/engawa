/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiError } from './error.js';

type ErrorDefinition = {
	message: string;
	code: string;
	id: string;
	kind?: 'client' | 'server' | 'permission';
	httpStatusCode: number;
};

/**
 * エンドポイントの外（ルーティング、本文の解析、認証・権限の確認）で返すエラー。
 * ApiCallService・endpoint-baseはこの定義を投げ、gen-specはこの定義からOpenAPIの応答を作る（実行時と仕様をずらさない）。
 * `/api`以下の非2xxの応答は、すべて`{ error: { message, code, id, kind } }`の形にする（P2-6）。
 */
export const httpErrors = {
	invalidRequest: {
		message: 'Invalid request.',
		code: 'INVALID_REQUEST',
		id: 'e14897ec-106a-4c0e-a57b-d5fdc893ee6e',
		httpStatusCode: 400,
	},
	/** トークン（`i`）が文字列でない。infoで引数を示す */
	invalidCredentialFormat: {
		message: 'Invalid param.',
		code: 'INVALID_PARAM',
		id: '3d81ceae-475f-4600-b2a8-2bc116157532',
		httpStatusCode: 400,
	},
	invalidParam: {
		message: 'Invalid param.',
		code: 'INVALID_PARAM',
		id: '3d81ceae-475f-4600-b2a8-2bc116157532',
		httpStatusCode: 400,
	},
	/** GET・multipartで、真偽値・数値の引数を文字列から変換できない */
	invalidParamCast: {
		message: 'Invalid param.',
		code: 'INVALID_PARAM',
		id: '0b5f1631-7c1a-41a6-b399-cce335f34d85',
		httpStatusCode: 400,
	},
	fileRequired: {
		message: 'File required.',
		code: 'FILE_REQUIRED',
		id: '4267801e-70d1-416a-b011-4ee502885d8b',
		httpStatusCode: 400,
	},
	/** `secure`のエンドポイントを、ネイティブのトークン以外から呼んだ */
	accessDenied: {
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: '56f35758-7dd5-468b-8439-5d6fb8ec9b8e',
		httpStatusCode: 400,
	},
	authenticationFailed: {
		message: 'Authentication failed. Please ensure your token is correct.',
		code: 'AUTHENTICATION_FAILED',
		id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
		httpStatusCode: 401,
	},
	credentialRequired: {
		message: 'Credential required.',
		code: 'CREDENTIAL_REQUIRED',
		id: '1384574d-a912-4b81-8601-c7b1c4085df1',
		httpStatusCode: 401,
	},
	accountSuspended: {
		message: 'Your account has been suspended.',
		code: 'YOUR_ACCOUNT_SUSPENDED',
		id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed6258370',
		kind: 'permission',
		httpStatusCode: 403,
	},
	accountMoved: {
		message: 'You have moved your account.',
		code: 'YOUR_ACCOUNT_MOVED',
		id: '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31',
		kind: 'permission',
		httpStatusCode: 403,
	},
	notModerator: {
		message: 'You are not assigned to a moderator role.',
		code: 'ROLE_PERMISSION_DENIED',
		id: 'd33d5333-db36-423d-a8f9-1a2b9549da41',
		kind: 'permission',
		httpStatusCode: 403,
	},
	notAdministrator: {
		message: 'You are not assigned to an administrator role.',
		code: 'ROLE_PERMISSION_DENIED',
		id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		kind: 'permission',
		httpStatusCode: 403,
	},
	requiredRolePolicy: {
		message: 'You are not assigned to a required role.',
		code: 'ROLE_PERMISSION_DENIED',
		id: '7f86f06f-7e15-4057-8561-f4b6d4ac755a',
		kind: 'permission',
		httpStatusCode: 403,
	},
	permissionDenied: {
		message: 'Your app does not have the necessary permissions to use this endpoint.',
		code: 'PERMISSION_DENIED',
		id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
		kind: 'permission',
		httpStatusCode: 403,
	},
	flashPermissionDenied: {
		message: 'Your flash does not have the necessary permissions to use this endpoint.',
		code: 'PERMISSION_DENIED',
		id: '11924d17-113a-4ab0-954a-c567ee8a6ce5',
		kind: 'permission',
		httpStatusCode: 403,
	},
	forbidden: {
		message: 'Forbidden.',
		code: 'FORBIDDEN',
		id: '3d751c0e-cd95-46a8-bb84-dd5fd2014915',
		kind: 'permission',
		httpStatusCode: 403,
	},
	unknownEndpoint: {
		message: 'Unknown API endpoint.',
		code: 'UNKNOWN_API_ENDPOINT',
		id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
		httpStatusCode: 404,
	},
	methodNotAllowed: {
		message: 'This endpoint does not accept the request method.',
		code: 'METHOD_NOT_ALLOWED',
		id: 'a85548f6-1eff-414c-888a-912c6bccd6a2',
		httpStatusCode: 405,
	},
	payloadTooLarge: {
		message: 'The request body is too large.',
		code: 'PAYLOAD_TOO_LARGE',
		id: 'bfc3cfcc-5722-4709-83dd-03d90212e72a',
		httpStatusCode: 413,
	},
	unsupportedMediaType: {
		message: 'Unsupported content type.',
		code: 'UNSUPPORTED_MEDIA_TYPE',
		id: '5b2b8fff-de7b-4d11-b63d-d933de7f2481',
		httpStatusCode: 415,
	},
	rateLimitExceeded: {
		message: 'Rate limit exceeded. Please try again later.',
		code: 'RATE_LIMIT_EXCEEDED',
		id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
		httpStatusCode: 429,
	},
	internalError: {
		message: 'Internal error occurred. Please contact us if the error persists.',
		code: 'INTERNAL_ERROR',
		id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		kind: 'server',
		httpStatusCode: 500,
	},
} as const satisfies Record<string, ErrorDefinition>;

/**
 * 本文のない非2xxの応答に付けるエラーを、ステータスコードから決める
 */
export function errorForStatus(status: number): ErrorDefinition {
	switch (status) {
		case 403: return httpErrors.forbidden;
		case 404: return httpErrors.unknownEndpoint;
		case 405: return httpErrors.methodNotAllowed;
		case 413: return httpErrors.payloadTooLarge;
		case 415: return httpErrors.unsupportedMediaType;
		case 429: return httpErrors.rateLimitExceeded;
		default: return status >= 500 ? httpErrors.internalError : { ...httpErrors.invalidRequest, httpStatusCode: status };
	}
}

/**
 * エンドポイントのエラー定義が実際に返すHTTPステータス（ApiCallServiceの#sendApiErrorと同じ規則）
 */
export function statusOf(err: { kind?: string; httpStatusCode?: number }): number {
	if (err.httpStatusCode != null) return err.httpStatusCode;
	if (err.kind === 'permission') return 403;
	if (err.kind === 'server') return 500;
	return 400;
}

export function errorBody(err: Pick<ApiError, 'message' | 'code' | 'id'> & { kind?: string }, info?: unknown) {
	return {
		error: {
			message: err.message,
			code: err.code,
			id: err.id,
			kind: err.kind ?? 'client',
			...(info != null ? { info } : {}),
		},
	};
}

/**
 * 非2xxの応答の本文を、共通の形（{ error: { message, code, id, kind } }）にする。
 * すでに共通の形なら、同じ値を返す。文字列以外（ストリームなど）はそのまま返す
 */
export function normalizeErrorPayload(payload: unknown, status: number): unknown {
	const fallback = errorBody(errorForStatus(status));
	if (payload == null || payload === '') return JSON.stringify(fallback);
	if (typeof payload !== 'string') return payload;

	let parsed: unknown;
	try {
		parsed = JSON.parse(payload);
	} catch {
		return JSON.stringify(fallback);
	}
	if (typeof parsed !== 'object' || parsed == null || !('error' in parsed)) return JSON.stringify(fallback);
	const error: unknown = parsed.error;
	if (typeof error !== 'object' || error == null) return JSON.stringify(fallback);

	const e = error as Record<string, unknown>;
	if (['message', 'code', 'id', 'kind'].every(k => typeof e[k] === 'string')) return payload;
	return JSON.stringify({
		...parsed,
		error: {
			...fallback.error,
			...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)),
		},
	});
}
