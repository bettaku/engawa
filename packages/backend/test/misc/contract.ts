/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// RUST-03: HTTP契約の要求の送り方、応答の記録の形、api.jsonとの照合。
// 実装（Node.js・Rust）やDIに依存させない。公開HTTPと、要求ごとのtokenだけを受け取る

export type ContractAuth =
	| 'none'
	| 'native'
	| 'native-param'
	| 'native-lowercase'
	| 'app'
	| 'suspended'
	| 'invalid'
	| 'non-string-param';

export type ContractCase = {
	id: string;
	name: string;
	request: {
		method: 'GET' | 'POST';
		path: string;
		query?: Record<string, string>;
		body?: Record<string, unknown>;
		rawBody?: string;
		contentType?: string;
		auth: ContractAuth;
	};
	/** falseならapi.jsonで応答を検査しない（api.jsonに載らない要求） */
	apiJson?: boolean;
};

export type ContractTokens = {
	/** ユーザーのtoken（signupの応答のtoken） */
	native: string;
	/** MiAuthで発行したtoken */
	app: string;
	/** 凍結したユーザーのtoken */
	suspended: string;
};

export type RecordedResponse = {
	status: number;
	/** RECORDED_HEADERSのうち、応答にあったもの */
	headers: Record<string, string>;
	/** JSONなら解析した値、本文がなければnull、それ以外は文字列 */
	body: unknown;
};

/**
 * 記録して比較するヘッダー。Date・Content-Length・Connection・Keep-Aliveなど、
 * 実行のたびに変わるものや、本文から決まるものは記録しない
 */
export const RECORDED_HEADERS = [
	'content-type',
	'cache-control',
	'www-authenticate',
	'retry-after',
	'access-control-allow-origin',
] as const;

/**
 * 契約の要求を送り、記録する形にして返す
 * @param baseUrl サーバーの起点（例: http://127.0.0.1:61812/）
 */
export async function performContractCase(baseUrl: string, c: ContractCase, tokens: ContractTokens): Promise<RecordedResponse> {
	const { request } = c;
	const headers: Record<string, string> = {};
	const query: Record<string, string> = { ...request.query };
	let bodyParams: Record<string, unknown> | undefined = request.body != null ? { ...request.body } : undefined;

	switch (request.auth) {
		case 'none': break;
		case 'native': headers.Authorization = `Bearer ${tokens.native}`; break;
		case 'native-lowercase': headers.Authorization = `bearer ${tokens.native}`; break;
		case 'app': headers.Authorization = `Bearer ${tokens.app}`; break;
		case 'suspended': headers.Authorization = `Bearer ${tokens.suspended}`; break;
		case 'invalid': headers.Authorization = 'Bearer no-such-token'; break;
		case 'native-param':
			if (request.method === 'GET') {
				query.i = tokens.native;
			} else {
				bodyParams = { ...bodyParams, i: tokens.native };
			}
			break;
		case 'non-string-param':
			bodyParams = { ...bodyParams, i: 123 };
			break;
	}

	let body: string | undefined;
	if (bodyParams != null) {
		headers['Content-Type'] = 'application/json';
		body = JSON.stringify(bodyParams);
	} else if (request.rawBody != null) {
		if (request.contentType != null) headers['Content-Type'] = request.contentType;
		body = request.rawBody;
	}

	const url = new URL(`api/${request.path}`, baseUrl);
	for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

	const res = await fetch(url, { method: request.method, headers, body, redirect: 'manual' });

	const recordedHeaders: Record<string, string> = {};
	for (const name of RECORDED_HEADERS) {
		const value = res.headers.get(name);
		if (value != null) recordedHeaders[name] = value;
	}

	const text = await res.text();
	let parsed: unknown;
	if (text === '') {
		parsed = null;
	} else if (res.headers.get('content-type')?.startsWith('application/json')) {
		parsed = JSON.parse(text);
	} else {
		parsed = text;
	}

	return { status: res.status, headers: recordedHeaders, body: parsed };
}

type JsonSchema = {
	$ref?: string;
	type?: string | string[];
	enum?: unknown[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	allOf?: JsonSchema[];
};

type ApiJsonResponse = {
	content?: Record<string, {
		schema?: JsonSchema;
		examples?: Record<string, { value: { error?: { id?: string } } }>;
	}>;
};

export type ApiJson = {
	paths: Record<string, Record<string, { responses: Record<string, ApiJsonResponse> }>>;
	components: { schemas: Record<string, JsonSchema> };
};

function typeOf(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
	if (type === 'integer') return Number.isInteger(value);
	return typeOf(value) === type;
}

/**
 * api.jsonのスキーマで値を検査し、違反を返す。SDKの型（cherrypick-jsの生成コード）と同じ定義を見る。
 * スキーマにないプロパティも違反にする（api.jsonはadditionalPropertiesを書かないが、SDKの型には出ない値を返していないか見るため）。
 * formatは見ない（EmojiSimpleのaliasesにformat: idが付いているなど、実際の値と合わない定義があるため）
 */
export function checkSchema(apiJson: ApiJson, schema: JsonSchema, value: unknown, path = '$'): string[] {
	if (schema.$ref != null) {
		const name = schema.$ref.replace('#/components/schemas/', '');
		const resolved = apiJson.components.schemas[name];
		if (resolved == null) return [`${path}: unknown $ref ${schema.$ref}`];
		return checkSchema(apiJson, resolved, value, path);
	}

	if (schema.allOf != null) {
		return schema.allOf.flatMap(s => checkSchema(apiJson, s, value, path));
	}
	const alternatives = schema.anyOf ?? schema.oneOf;
	if (alternatives != null) {
		if (alternatives.some(s => checkSchema(apiJson, s, value, path).length === 0)) return [];
		return [`${path}: matches none of the alternatives`];
	}

	if (schema.type != null) {
		const types = Array.isArray(schema.type) ? schema.type : [schema.type];
		if (!types.some(t => matchesType(value, t))) {
			return [`${path}: expected ${types.join(' | ')}, got ${typeOf(value)}`];
		}
	}

	if (schema.enum != null && !schema.enum.includes(value)) {
		return [`${path}: ${JSON.stringify(value)} is not in enum`];
	}

	const violations: string[] = [];
	if (Array.isArray(value) && schema.items != null) {
		const items = schema.items;
		value.forEach((v, i) => violations.push(...checkSchema(apiJson, items, v, `${path}[${i}]`)));
	} else if (typeOf(value) === 'object' && schema.properties != null) {
		const obj = value as Record<string, unknown>;
		for (const key of schema.required ?? []) {
			if (!Object.hasOwn(obj, key)) violations.push(`${path}.${key}: required but missing`);
		}
		for (const [key, v] of Object.entries(obj)) {
			const prop = schema.properties[key];
			if (prop == null) {
				violations.push(`${path}.${key}: not defined in the schema`);
			} else {
				violations.push(...checkSchema(apiJson, prop, v, `${path}.${key}`));
			}
		}
	}
	return violations;
}

/**
 * 応答がapi.jsonの定義と合うかを検査し、違反を返す。
 * ステータスが定義にあること、本文がスキーマに合うこと、エラーのcodeとidが定義の例と一致すること
 */
export function checkAgainstApiJson(apiJson: ApiJson, c: ContractCase, res: RecordedResponse): string[] {
	const operation = apiJson.paths[`/${c.request.path}`]?.[c.request.method.toLowerCase()];
	if (operation == null) return [`${c.request.method} /${c.request.path} is not in api.json`];

	const declared = operation.responses[String(res.status)];
	if (declared == null) return [`status ${res.status} is not declared in api.json`];

	const content = declared.content?.['application/json'];
	if (content?.schema == null) {
		return res.body == null ? [] : ['api.json declares no body, but the response has one'];
	}

	const violations = checkSchema(apiJson, content.schema, res.body);

	const error = (res.body as { error?: { code?: unknown; id?: unknown } } | null)?.error;
	if (error != null && content.examples != null) {
		const example = typeof error.code === 'string' ? content.examples[error.code] : undefined;
		if (example == null) {
			violations.push(`error code ${String(error.code)} is not documented for status ${res.status}`);
		} else if (example.value.error?.id !== error.id) {
			violations.push(`error id ${String(error.id)} differs from the documented ${String(example.value.error?.id)}`);
		}
	}
	return violations;
}
