/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import endpoints, { IEndpoint, IEndpointMeta } from '../endpoints.js';
import { errorBody, httpErrors, statusOf } from '../http-errors.js';
import { getSchemas, convertSchemaToOpenApiSchema } from './schemas.js';

export function genOpenapiSpec(config: Config, includeSelfRef = false) {
	const spec = {
		openapi: '3.1.0',

		info: {
			version: `${config.version} (${config.basedMisskeyVersion})`,
			title: 'Engawa API',
		},

		externalDocs: {
			description: 'Repository',
			url: 'https://github.com/bettaku/engawa',
		},

		servers: [{
			url: config.apiUrl,
		}],

		paths: {} as any,

		components: {
			schemas: getSchemas(includeSelfRef),

			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
				},
			},
		},
	};

	// 書き換えたりするのでディープコピーしておく。そのまま編集するとメモリ上の値が汚れて次回以降の出力に影響する
	const copiedEndpoints = JSON.parse(JSON.stringify(endpoints)) as IEndpoint[];
	for (const endpoint of copiedEndpoints) {
		const resSchema = endpoint.meta.res ? convertSchemaToOpenApiSchema(endpoint.meta.res, 'res', includeSelfRef) : {};

		let desc = (endpoint.meta.description ? endpoint.meta.description : 'No description provided.') + '\n\n';

		if (endpoint.meta.secure) {
			desc += '**Internal Endpoint**: This endpoint is an API for the cherrypick mainframe and is not intended for use by third parties.\n';
		}

		desc += `**Credential required**: *${endpoint.meta.requireCredential ? 'Yes' : 'No'}*`;
		if (endpoint.meta.kind) {
			const kind = endpoint.meta.kind;
			desc += ` / **Permission**: *${kind}*`;
		}

		const requestType = endpoint.meta.requireFile ? 'multipart/form-data' : 'application/json';
		const schema = { ...convertSchemaToOpenApiSchema(endpoint.params, 'param', false) };

		if (endpoint.meta.requireFile) {
			schema.properties = {
				...schema.properties,
				file: {
					type: 'string',
					format: 'binary',
					description: 'The file contents.',
				},
			};
			schema.required = [...schema.required ?? [], 'file'];
		}

		if (schema.required && schema.required.length <= 0) {
			// 空配列は許可されない
			schema.required = undefined;
		}

		const hasBody = (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length >= 1)
			|| ['allOf', 'oneOf', 'anyOf'].some(o => (Array.isArray(schema[o]) && schema[o].length >= 0));

		const info = {
			operationId: endpoint.name.replaceAll('/', '___'), // NOTE: スラッシュは使えない
			summary: endpoint.name,
			description: desc,
			externalDocs: {
				description: 'Source code',
				url: `https://github.com/bettaku/engawa/blob/develop/packages/backend/src/server/api/endpoints/${endpoint.name}.ts`,
			},
			...(endpoint.meta.tags ? {
				tags: [endpoint.meta.tags[0]],
			} : {}),
			...(endpoint.meta.requireCredential ? {
				security: [{
					bearerAuth: [],
				}],
			} : {}),
			...(hasBody ? {
				requestBody: {
					required: true,
					content: {
						[requestType]: {
							schema,
						},
					},
				},
			} : {}),
			responses: {
				...(endpoint.meta.res ? {
					'200': {
						description: 'OK (with results)',
						content: {
							'application/json': {
								schema: resSchema,
							},
						},
					},
				} : {
					'204': {
						description: 'OK (without any results)',
					},
				}),
				...(endpoint.meta.res?.optional === true || endpoint.meta.res?.nullable === true ? {
					'204': {
						description: 'OK (without any results)',
					},
				} : {}),
				...errorResponses([...commonErrors(endpoint), ...Object.values(endpoint.meta.errors ?? {})]),
			},
		};

		// GETは本文を読まずにクエリ文字列を読み、真偽値・数値だけをJSONとして変換する（ApiCallService.call）
		const { requestBody: _, ...getInfo } = info as typeof info & { requestBody?: unknown };
		spec.paths['/' + endpoint.name] = {
			...(endpoint.meta.allowGet ? {
				get: {
					...getInfo,
					operationId: 'get___' + info.operationId,
					...(schema.properties && Object.keys(schema.properties).length > 0 ? {
						parameters: Object.entries(schema.properties).map(([name, property]) => ({
							name,
							in: 'query',
							required: (schema.required ?? []).includes(name),
							schema: property,
						})),
					} : {}),
				},
			} : {}),
			post: {
				...info,
				operationId: 'post___' + info.operationId,
			},
		};
	}

	return spec;
}

type ErrorLike = { message: string; code: string; id: string; kind?: string; httpStatusCode?: number };

/**
 * エンドポイントの外（ApiCallService・endpoint-base・/apiのプラグイン）で、そのエンドポイントについて起きうるエラー
 */
function commonErrors(endpoint: IEndpoint): ErrorLike[] {
	const meta: IEndpointMeta = endpoint.meta;
	const errors: ErrorLike[] = [
		httpErrors.invalidRequest,
		httpErrors.invalidCredentialFormat,
		httpErrors.authenticationFailed,
		httpErrors.payloadTooLarge,
		httpErrors.unsupportedMediaType,
		httpErrors.internalError,
	];
	const requireUser = meta.requireCredential || meta.requireModerator || meta.requireAdmin;
	if (meta.secure) errors.push(httpErrors.accessDenied);
	if (meta.limit) errors.push(httpErrors.rateLimitExceeded);
	if (requireUser) errors.push(httpErrors.credentialRequired, httpErrors.accountSuspended);
	if (meta.prohibitMoved) errors.push(httpErrors.accountMoved);
	if (meta.requireModerator) errors.push(httpErrors.notModerator);
	if (meta.requireAdmin) errors.push(httpErrors.notAdministrator);
	if (meta.requiredRolePolicy != null) errors.push(httpErrors.requiredRolePolicy);
	if (meta.kind || requireUser) errors.push(httpErrors.permissionDenied);
	if (meta.kind) errors.push(httpErrors.flashPermissionDenied);
	if (meta.requireFile) errors.push(httpErrors.fileRequired);
	const properties = Object.values(endpoint.params.properties ?? {});
	if (properties.length > 0) errors.push(httpErrors.invalidParam);
	if ((meta.requireFile || meta.allowGet) && properties.some(p => ['boolean', 'number', 'integer'].includes(p.type ?? ''))) {
		errors.push(httpErrors.invalidParamCast);
	}
	return errors;
}

const statusDescriptions: Record<number, string> = {
	400: 'Client error',
	401: 'Authentication error',
	403: 'Forbidden error',
	404: 'Not found',
	409: 'Conflict',
	413: 'Payload too large',
	415: 'Unsupported media type',
	422: 'Unprocessable content',
	429: 'Too many requests',
	500: 'Internal server error',
};

/**
 * エラーを、実行時に返すHTTPステータスごとにまとめる
 */
function errorResponses(errors: ErrorLike[]) {
	const byStatus = new Map<number, ErrorLike[]>();
	for (const e of errors) {
		const status = statusOf(e);
		const list = byStatus.get(status) ?? [];
		if (!list.some(x => x.id === e.id && x.code === e.code && x.message === e.message)) list.push(e);
		byStatus.set(status, list);
	}
	return Object.fromEntries([...byStatus].sort(([a], [b]) => a - b).map(([status, list]) => {
		const examples: Record<string, { value: unknown }> = {};
		for (const e of list) {
			// 同じコードで別のidのエラーがある（ROLE_PERMISSION_DENIEDなど）
			const key = list.filter(x => x.code === e.code).length > 1 ? `${e.code} (${e.id})` : e.code;
			examples[key] = { value: errorBody({ ...e, kind: e.kind ?? 'client' } as Parameters<typeof errorBody>[0]) };
		}
		return [String(status), {
			description: statusDescriptions[status] ?? 'Error',
			content: {
				'application/json': {
					schema: {
						$ref: '#/components/schemas/Error',
					},
					examples,
				},
			},
		}];
	}));
}
