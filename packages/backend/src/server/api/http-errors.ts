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
 * エンドポイントの外（ルーティング、本文の解析、認証の前段）で返すエラー。
 * `/api`以下の非2xxの応答は、すべて`{ error: { message, code, id, kind } }`の形にする（P2-6）。
 */
export const httpErrors = {
	invalidRequest: {
		message: 'Invalid request.',
		code: 'INVALID_REQUEST',
		id: 'e14897ec-106a-4c0e-a57b-d5fdc893ee6e',
		httpStatusCode: 400,
	},
	invalidCredentialFormat: {
		message: 'The credential must be a string.',
		code: 'INVALID_PARAM',
		id: '3d81ceae-475f-4600-b2a8-2bc116157532',
		httpStatusCode: 400,
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

export function errorBody(err: ApiError | ErrorDefinition, info?: unknown) {
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
