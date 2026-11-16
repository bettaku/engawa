/*
 * SPDX-FileCopyrightText: cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import _Ajv2020 from 'ajv/dist/2020.js';
import type { Schema } from '@/misc/json-schema.js';
import { convertSchemaToOpenApiSchema, getSchemas } from './openapi/schemas.js';
import type { AnySchema, ValidateFunction } from 'ajv/dist/2020.js';

const Ajv2020 = _Ajv2020.default;

const COMPONENTS_ID = 'engawa-api';
const LOCAL_REF_PREFIX = '#/components/schemas/';
const MAX_ERRORS_PER_RESPONSE = 20;

export type ResponseViolationKind =
	/** `res`の定義と応答の形が一致しない */
	| 'schema-mismatch'
	/** `res`がないのに値を返した */
	| 'unexpected-body'
	/** `res`があるのに値を返さなかった */
	| 'missing-body'
	/** `res`の定義そのものをJSON Schemaとして解釈できない */
	| 'invalid-schema';

export type ResponseViolation = {
	endpoint: string;
	kind: ResponseViolationKind;
	errors: {
		instancePath: string;
		schemaPath: string;
		message: string;
	}[];
};

type EndpointLike = {
	name: string;
	meta: { res?: Schema };
};

/**
 * エンドポイントの応答を`res`スキーマで検証する。
 *
 * 検証には、OpenAPI仕様の生成（gen-spec）と同じ変換結果を使う。
 * これにより、公開している仕様と実行時の応答のずれを検出する。
 * 応答は書き換えない。
 */
export class ResponseValidator {
	private ajv: InstanceType<typeof Ajv2020>;
	private validators = new Map<string, ValidateFunction | null>();
	private reported = new Set<string>();

	constructor() {
		this.ajv = new Ajv2020({
			strict: false,
			allErrors: true,
		});

		const idPattern = /^[a-zA-Z0-9]+$/;
		this.ajv.addFormat('id', idPattern);
		this.ajv.addFormat('misskey:id', idPattern);
		this.ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
		// 以下は注釈として扱い、値は検証しない
		for (const format of ['url', 'uri', 'uuid', 'bytes', 'md5', 'text']) {
			this.ajv.addFormat(format, true);
		}

		this.ajv.addSchema({
			$id: COMPONENTS_ID,
			components: { schemas: getSchemas(true) },
		});
	}

	/**
	 * @returns 違反がなければ`null`
	 */
	public validate(endpoint: EndpointLike, response: unknown): ResponseViolation | null {
		const res = endpoint.meta.res;

		if (res == null) {
			if (response == null) return null;
			return {
				endpoint: endpoint.name,
				kind: 'unexpected-body',
				errors: [{ instancePath: '', schemaPath: '', message: `res is not defined but returned ${describe(response)}` }],
			};
		}

		if (response == null && !res.nullable && !res.optional) {
			return {
				endpoint: endpoint.name,
				kind: 'missing-body',
				errors: [{ instancePath: '', schemaPath: '', message: 'res is defined but nothing was returned' }],
			};
		}
		if (response === undefined) return null;

		let validate: ValidateFunction | null;
		try {
			validate = this.getValidator(endpoint.name, res);
		} catch (err) {
			return {
				endpoint: endpoint.name,
				kind: 'invalid-schema',
				errors: [{ instancePath: '', schemaPath: '', message: err instanceof Error ? err.message : String(err) }],
			};
		}
		if (validate == null) return null;

		// Dateや`undefined`のプロパティは送信時にJSONへ変換されるため、クライアントが受け取る形にしてから検証する
		const serialized = JSON.parse(JSON.stringify(response));
		if (validate(serialized)) return null;

		return {
			endpoint: endpoint.name,
			kind: 'schema-mismatch',
			errors: (validate.errors ?? []).slice(0, MAX_ERRORS_PER_RESPONSE).map(e => ({
				instancePath: e.instancePath,
				schemaPath: e.schemaPath,
				message: e.message ?? '',
			})),
		};
	}

	/**
	 * 同じ違反を繰り返し報告しないようにする。
	 * 配列の添字だけが違うものは同じ違反として扱う。
	 *
	 * @returns まだ報告していない違反だけを残したもの。すべて報告済みなら`null`
	 */
	public dedupe(violation: ResponseViolation): ResponseViolation | null {
		const errors = violation.errors.filter(e => {
			const key = [violation.endpoint, violation.kind, e.instancePath.replace(/\/\d+(?=\/|$)/g, '/*'), e.schemaPath, e.message].join('\n');
			if (this.reported.has(key)) return false;
			this.reported.add(key);
			return true;
		});
		return errors.length > 0 ? { ...violation, errors } : null;
	}

	private getValidator(name: string, res: Schema): ValidateFunction | null {
		const cached = this.validators.get(name);
		if (cached !== undefined) return cached;

		// 一度失敗した定義を呼び出しのたびにコンパイルし直さない
		this.validators.set(name, null);
		const validate = this.ajv.compile(qualifyRefs(convertSchemaToOpenApiSchema(res, 'res', true)) as AnySchema);
		this.validators.set(name, validate);
		return validate;
	}
}

/**
 * 違反を1行1件のJSON（JSON Lines）としてファイルへ追記する。
 */
export function appendViolationReport(path: string, violation: ResponseViolation): void {
	fs.appendFileSync(path, JSON.stringify(violation) + '\n');
}

function qualifyRefs(schema: unknown): unknown {
	if (Array.isArray(schema)) return schema.map(qualifyRefs);
	if (typeof schema !== 'object' || schema === null) return schema;

	return Object.fromEntries(Object.entries(schema).map(([k, v]) => [
		k,
		k === '$ref' && typeof v === 'string' && v.startsWith(LOCAL_REF_PREFIX) ? COMPONENTS_ID + v : qualifyRefs(v),
	]));
}

function describe(value: unknown): string {
	if (Array.isArray(value)) return 'an array';
	if (typeof value === 'object' && value !== null) return `an object (${Object.getPrototypeOf(value)?.constructor?.name ?? 'no prototype'})`;
	return `${typeof value} ${JSON.stringify(value)}`;
}
