/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const REDACTED = '[REDACTED]';

// APIのパラメータ名のうち、値をログや外部サービスに残してはいけないもの
const SECRET_KEY_PATTERN = /^i$|password|passwd|token|secret|credential|private|auth|apikey|api_key|hcaptcha|recaptcha|turnstile|captcha|^code$|^key$|publickey|signature|cookie/i;

const MAX_DEPTH = 8;

/**
 * オブジェクトの中の機密キー（パスワード・トークンなど）の値を伏せた複製を返す。
 * 伏せた値のうち文字列だったものは `secrets` に集めるので、自由文（エラーメッセージやスタックトレース）からも
 * `scrubSecrets` で取り除くことができる。
 */
export function redactSecrets(value: unknown): { redacted: unknown; secrets: string[] } {
	const secrets = new Set<string>();

	const collect = (v: unknown, depth: number): void => {
		if (depth > MAX_DEPTH) return;
		if (typeof v === 'string') {
			// 短すぎる値を置換対象にすると、無関係な文字列まで壊してしまう
			if (v.length >= 4) secrets.add(v);
		} else if (Array.isArray(v)) {
			for (const x of v) collect(x, depth + 1);
		} else if (v != null && typeof v === 'object') {
			for (const x of Object.values(v)) collect(x, depth + 1);
		}
	};

	const walk = (v: unknown, depth: number): unknown => {
		if (depth > MAX_DEPTH) return REDACTED;
		if (Array.isArray(v)) return v.map(x => walk(x, depth + 1));
		if (v != null && typeof v === 'object') {
			if (v instanceof Date) return v;
			const out: Record<string, unknown> = {};
			for (const [k, x] of Object.entries(v)) {
				if (SECRET_KEY_PATTERN.test(k)) {
					if (x != null) collect(x, depth + 1);
					out[k] = x == null ? x : REDACTED;
				} else {
					out[k] = walk(x, depth + 1);
				}
			}
			return out;
		}
		return v;
	};

	const redacted = walk(value, 0);
	// 長い値から置換する（ある機密値が別の機密値の一部になっている場合に取りこぼさない）
	return { redacted, secrets: [...secrets].sort((a, b) => b.length - a.length) };
}

/**
 * 自由文の中に機密値そのものが現れていたら伏せる
 */
export function scrubSecrets<T extends string | null | undefined>(text: T, secrets: string[]): T {
	if (typeof text !== 'string') return text;
	let out: string = text;
	for (const secret of secrets) {
		out = out.split(secret).join(REDACTED);
	}
	return out as T;
}
