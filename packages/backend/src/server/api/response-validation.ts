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
			const key = dedupeKey(violation, e);
			if (this.reported.has(key)) return false;
			this.reported.add(key);
			return true;
		});
		return errors.length > 0 ? { ...violation, errors } : null;
	}

	/**
	 * `dedupe`が報告済みにした違反を、未報告に戻す。
	 * レポートへの記録に失敗したとき、次に同じ違反が起きたら記録し直せるようにする。
	 */
	public forget(violation: ResponseViolation): void {
		for (const e of violation.errors) {
			this.reported.delete(dedupeKey(violation, e));
		}
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

let reportQueue: Promise<void> = Promise.resolve();

/**
 * 違反を1行1件のJSON（JSON Lines）としてファイルへ追記する。
 *
 * リクエストの処理を止めないように非同期で書き込む。書き込みは呼び出した順に行う。
 */
export function appendViolationReport(path: string, violation: ResponseViolation): Promise<void> {
	const line = JSON.stringify(violation) + '\n';
	const written = reportQueue.then(() => fs.promises.appendFile(path, line));
	// 1件の失敗で、後続の書き込みを止めない
	reportQueue = written.catch(() => {});
	return written;
}

function dedupeKey(violation: ResponseViolation, error: ResponseViolation['errors'][number]): string {
	return [violation.endpoint, violation.kind, error.instancePath.replace(/\/\d+(?=\/|$)/g, '/*'), error.schemaPath, error.message].join('\n');
}

function qualifyRefs(schema: unknown): unknown {
	if (Array.isArray(schema)) return schema.map(qualifyRefs);
	if (typeof schema !== 'object' || schema === null) return schema;

	return Object.fromEntries(Object.entries(schema).map(([k, v]) => [
		k,
		k === '$ref' && typeof v === 'string' && v.startsWith(LOCAL_REF_PREFIX) ? COMPONENTS_ID + v : qualifyRefs(v),
	]));
}

/**
 * @param value `null`でも`undefined`でもない値
 */
function describe(value: NonNullable<unknown>): string {
	if (Array.isArray(value)) return 'an array';
	if (typeof value === 'object') return `an object (${Object.getPrototypeOf(value)?.constructor?.name ?? 'no prototype'})`;
	return `${typeof value} ${JSON.stringify(value)}`;
}
