/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createValidators, schema } from './schema.js';
import type { Diagnostic } from './parse.js';

export type NodeEnv = 'production' | 'development' | 'test';

/**
 * 起動の形を決める`CP_*`の環境変数
 */
export type EnvOption = {
	onlyQueue: boolean;
	onlyServer: boolean;
	noDaemons: boolean;
	/** queueプロセスの起動時に定期ジョブを登録しない（QueueService.registerJobSchedulers） */
	noJobSchedulers: boolean;
	disableClustering: boolean;
	verbose: boolean;
	withLogTime: boolean;
	quiet: boolean;
};

/**
 * 環境変数（NODE_ENVなど）で切り替わる振る舞い。
 * 各サービスは`process.env`を読まず、DIで渡す`config.runtime`を読む。
 * 項目を追加するときは、環境変数を`config/schema.ts`の`environment`にも登録する。
 */
export type Runtime = {
	/** NODE_ENV。未設定と不正な値はundefined（本番以外として扱う） */
	nodeEnv: NodeEnv | undefined;

	/** 本番（NODE_ENV=production）だけで有効にする保護。本番以外ではすべてfalse */
	production: {
		/** APIのレート制限 */
		rateLimit: boolean;
		/** 外部へのHTTP接続で、接続先がプライベートアドレスなら切断する */
		blockPrivateAddresses: boolean;
		/** URLにhttpsを要求する（checkHttps、ActivityPubのリダイレクト先の判定） */
		requireHttps: boolean;
		/** 一時ディレクトリを使い終えたら消す */
		removeTempFiles: boolean;
	};

	/** 開発時だけに使う設定 */
	development: {
		/** フロントエンドが未ビルドのとき、/viteのプロキシ先（VITE_PORT） */
		vitePort: number;
		/** フロントエンドが未ビルドのとき、/embed_viteのプロキシ先（EMBED_VITE_PORT） */
		embedVitePort: number;
		/** ファイルの応答にAccess-Control-Allow-Origin: *を付ける（NODE_ENV=development） */
		allowCrossOriginFiles: boolean;
		/** APIの応答をスキーマで検証する（NODE_ENVがtestかdevelopment） */
		validateApiResponses: boolean;
		/** 応答の検証の違反を追記するファイル（API_RES_VALIDATION_REPORT） */
		apiResponseValidationReport: string | null;
	};

	/**
	 * テストのための抜け道。NODE_ENV=testのときだけ有効なもの（括弧書きのないもの）と、
	 * NODE_ENVにかかわらず環境変数で有効にするものがある。
	 * e2eのテストサーバーは、`/runtime`でこの値を書き換える（test-server/entry.ts）。
	 */
	test: {
		/** 起動時にスキーマを作り直す（TypeORMのdropSchemaとsynchronize） */
		resetSchema: boolean;
		/** reset-dbエンドポイントを使えるようにする */
		resetDbEndpoint: boolean;
		/** TypeORMのクエリキャッシュを使わない */
		disableQueryCache: boolean;
		/** サインアップ・サインインでCAPTCHAを検証しない */
		skipCaptcha: boolean;
		/** 登録の受付停止（招待制）を無視する */
		skipRegistrationRestriction: boolean;
		/** サインアップでhostを指定してリモートユーザーを作れる */
		allowSignupHost: boolean;
		/** TOTPを検証せずに成功にする（MISSKEY_TEST_CHECK_DUPLICATED_TOTP=1で無効） */
		skipTotpVerification: boolean;
		/** OAuthのclient_idにhttpを許す */
		allowHttpOAuthClient: boolean;
		/** OAuthのクライアント情報の取得で、接続先のIPの範囲を確かめない（CHERRYPICK_TEST_CHECK_IP_RANGE=1で無効） */
		skipOAuthClientIpCheck: boolean;
		/** ローカルからリモートへのフォローを、フォローリクエストにせずに確定する（FORCE_FOLLOW_REMOTE_USER_FOR_TESTING） */
		followRemoteImmediately: boolean;
		/** user@hostのWebFingerをhttpで問い合わせる（CHERRYPICK_WEBFINGER_USE_HTTP） */
		webfingerUseHttp: boolean;
		/** アカウントの移行後、移行元のフォローを解除するまでの時間（ミリ秒） */
		accountMoveUnfollowDelay: number;
		/** 定期処理（メタ情報の更新、チャート・統計）を動かさず、終了時にチャートを保存しない */
		disablePeriodicTasks: boolean;
		/** リモートのノートの掃除で、バッチの間に待たない */
		disableCleanRemoteNotesWait: boolean;
		/** 待たないPromiseを記録し、終了時に待つ（trackPromise） */
		trackPromises: boolean;
		/** テスト用のチャートを登録する */
		testCharts: boolean;
	};
};

export type Environment = {
	options: EnvOption;
	runtime: Runtime;
	/** 空文字列を除いた環境変数 */
	values: Readonly<Record<string, string>>;
	diagnostics: Diagnostic[];
};

type Property = {
	type: string;
	enum?: readonly string[];
	pattern?: string;
	'x-flag'?: boolean;
	'x-secret'?: boolean;
};
const properties: Record<string, Property> = schema.$defs.environment.properties;
const knownPrefixes = ['CP_', 'CHERRYPICK_'];
const disablingWords = ['0', 'false', 'no', 'off'];

let validate: ReturnType<typeof createValidators>['environment'] | undefined;

function displayValue(name: string, value: string) {
	const property = Object.hasOwn(properties, name) ? properties[name] : undefined;
	if (property?.['x-secret']) return '<redacted>';
	// 列挙・形式が決まっている値だけを表示する。パスなどには秘密が含まれうる
	if (property?.enum || property?.pattern || property?.['x-flag']) return JSON.stringify(value).slice(0, 80);
	return 'string';
}

/**
 * 環境変数を検証し、起動の形（options）と振る舞い（runtime）に変換する。
 * 値の解釈は、検証の結果にかかわらず従来どおりにする（不正な値で起動を止めるかは、呼び出し側が診断のlevelで決める）。
 */
export function parseEnvironment(env: NodeJS.ProcessEnv = process.env): Environment {
	// 空文字列は未設定として扱う（従来の`if (process.env.X)`と同じ）
	const values: Record<string, string> = {};
	for (const [name, value] of Object.entries(env)) {
		if (value !== undefined && value !== '') values[name] = value;
	}

	const diagnostics: Diagnostic[] = [];
	validate ??= createValidators().environment;
	if (!validate(values)) {
		for (const e of validate.errors ?? []) {
			const name = e.instancePath.slice(1);
			diagnostics.push({
				level: 'error',
				path: `$${name}`,
				message: e.message ?? 'Invalid value.',
				actual: displayValue(name, values[name]),
			});
		}
	}
	for (const [name, value] of Object.entries(values)) {
		if (Object.hasOwn(properties, name)) {
			if (properties[name]['x-flag'] && disablingWords.includes(value.toLowerCase())) {
				diagnostics.push({
					level: 'warning',
					path: `$${name}`,
					message: 'Any non-empty value enables this option. Unset it to disable.',
					actual: displayValue(name, value),
				});
			}
		} else if (knownPrefixes.some(prefix => name.startsWith(prefix))) {
			diagnostics.push({ level: 'warning', path: `$${name}`, message: 'Unknown environment variable.' });
		}
	}

	const nodeEnv = (['production', 'development', 'test'] as const).find(v => v === values.NODE_ENV);
	const isProduction = nodeEnv === 'production';
	const isTest = nodeEnv === 'test';
	const flag = (name: string) => values[name] !== undefined;
	const port = (name: string, fallback: number) => {
		const parsed = parseInt(values[name] ?? '', 10);
		return Number.isNaN(parsed) ? fallback : parsed;
	};

	const options: EnvOption = {
		onlyQueue: flag('CP_ONLY_QUEUE'),
		onlyServer: flag('CP_ONLY_SERVER'),
		noDaemons: flag('CP_NO_DAEMONS') || isTest,
		noJobSchedulers: flag('CP_NO_JOB_SCHEDULERS'),
		disableClustering: flag('CP_DISABLE_CLUSTERING') || isTest,
		verbose: flag('CP_VERBOSE'),
		withLogTime: flag('CP_WITH_LOG_TIME'),
		quiet: flag('CP_QUIET') || isTest,
	};

	const runtime: Runtime = {
		nodeEnv,
		production: {
			rateLimit: isProduction,
			blockPrivateAddresses: isProduction,
			requireHttps: isProduction,
			removeTempFiles: isProduction,
		},
		development: {
			vitePort: port('VITE_PORT', 5173),
			embedVitePort: port('EMBED_VITE_PORT', 5174),
			allowCrossOriginFiles: nodeEnv === 'development',
			validateApiResponses: isTest || nodeEnv === 'development',
			apiResponseValidationReport: values.API_RES_VALIDATION_REPORT ?? null,
		},
		test: {
			resetSchema: isTest,
			resetDbEndpoint: isTest,
			disableQueryCache: isTest,
			skipCaptcha: isTest,
			skipRegistrationRestriction: isTest,
			allowSignupHost: isTest,
			skipTotpVerification: isTest && values.MISSKEY_TEST_CHECK_DUPLICATED_TOTP !== '1',
			allowHttpOAuthClient: isTest,
			skipOAuthClientIpCheck: isTest && values.CHERRYPICK_TEST_CHECK_IP_RANGE !== '1',
			followRemoteImmediately: values.FORCE_FOLLOW_REMOTE_USER_FOR_TESTING === 'true',
			webfingerUseHttp: values.CHERRYPICK_WEBFINGER_USE_HTTP?.toLowerCase() === 'true',
			accountMoveUnfollowDelay: isTest ? 10000 : 1000 * 60 * 60 * 24,
			disablePeriodicTasks: isTest,
			disableCleanRemoteNotesWait: isTest,
			trackPromises: isTest,
			testCharts: isTest,
		},
	};

	return { options, runtime, values, diagnostics };
}

let cached: Environment | undefined;

/**
 * プロセスの環境変数を一度だけ読む。DIの外（ロガー、起動処理など）はこれを使い、
 * DIの中は`config.runtime`（同じオブジェクト）を使う。
 */
export function loadEnvironment() {
	cached ??= parseEnvironment();
	return cached;
}
