/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! `packages/backend/config.schema.json`（TypeORM側の設定スキーマ生成物）を組み込み、`jsonschema`で検証する（ADR-0009）。
//!
//! 混在期間の契約: **設定スキーマの正はTypeScript側の`config.schema.json`**。Rust版は同じファイルで検証し、ずれさせない。
//! `x-*`キー（`x-secret`/`x-null-as-unset`/`x-env`/`x-deprecation`/`x-flag`/`x-scope`）はjsonschemaが無視し、手前で解釈する。
//!
//! RUST-05のRust版が**実装していない**設定は、スキーマ検証とは別に「未対応」診断として出す（黙って無視しない。計画§6）。

use serde_json::Value;

/// 組み込みのスキーマJSON。
pub const CONFIG_SCHEMA_JSON: &str = include_str!("../../../backend/config.schema.json");

/// `$defs.input`用のバリデータ用ラップスキーマを返す。
pub fn input_validator_schema(schema: &Value) -> Value {
    serde_json::json!({
        "$ref": "#/$defs/input",
        "$defs": schema.get("$defs").cloned().unwrap_or(Value::Null),
    })
}

/// `$defs.effective`用。
pub fn effective_validator_schema(schema: &Value) -> Value {
    serde_json::json!({
        "$ref": "#/$defs/effective",
        "$defs": schema.get("$defs").cloned().unwrap_or(Value::Null),
    })
}

/// `$defs.input.properties`のキー集合（未知キー検出にはスキーマ検証に任せる。ここでは「Rust未対応」判定に使う）。
pub fn known_top_level_keys(schema: &Value) -> std::collections::BTreeSet<String> {
    schema
        .pointer("/$defs/input/properties")
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

/// RUST-05のRust版が**実際に読み取りに使う**トップレベル設定キー。
///
/// ここに無いスキーマ既知キーは「設定として有効だが、このRust版では未対応（該当機能は移行対象外。黙って無視しない）」。
pub const RUST_SUPPORTED_TOP_LEVEL_KEYS: &[&str] = &[
    "url",
    "port",
    "socket",
    "chmodSocket",
    "id",
    "db",
    "dbReplications",
    "dbSlaves",
    "redis",
    "redisForPubsub",
    "redisForJobQueue",
    "redisForTimelines",
    "redisForReactions",
    "pidFile",
    "logging",
];

/// `db`直下でRust版が読むキー。
pub const RUST_SUPPORTED_DB_KEYS: &[&str] = &[
    "host",
    "port",
    "db",
    "user",
    "pass",
    "disableCache",
    "extra",
];

/// `db.extra`（pgに渡す接続オプション）のうちRust版が読むキー。
pub const RUST_SUPPORTED_DB_EXTRA_KEYS: &[&str] =
    &["ssl", "statement_timeout", "max", "application_name"];

/// Redisの各接続設定でRust版が読むキー。
pub const RUST_SUPPORTED_REDIS_KEYS: &[&str] = &[
    "host",
    "port",
    "path",
    "pass",
    "password",
    "username",
    "db",
    "prefix",
    "keyPrefix",
    "family",
    "tls",
    "connectTimeout",
    "commandTimeout",
    "maxRetriesPerRequest",
];

/// Redis `tls`オブジェクトでRust版が読むキー。
pub const RUST_SUPPORTED_REDIS_TLS_KEYS: &[&str] = &["rejectUnauthorized"];

/// 設定されているのにRust版が未対応のキーを収集する。秘密の**値**は出さない（キー名のみ）。
pub fn collect_unsupported(source: &Value, schema: &Value) -> Vec<String> {
    let mut out = Vec::new();

    let known = known_top_level_keys(schema);
    let supported_top: std::collections::BTreeSet<&str> =
        RUST_SUPPORTED_TOP_LEVEL_KEYS.iter().copied().collect();

    if let Some(obj) = source.as_object() {
        for key in obj.keys() {
            if known.contains(key) && !supported_top.contains(key.as_str()) {
                out.push(key.clone());
            }
        }
    }

    // db.extra
    if let Some(extra) = source.pointer("/db/extra").and_then(Value::as_object) {
        let supported: std::collections::BTreeSet<&str> =
            RUST_SUPPORTED_DB_EXTRA_KEYS.iter().copied().collect();
        for key in extra.keys() {
            if !supported.contains(key.as_str()) {
                out.push(format!("db.extra.{key}"));
            }
        }
    }
    if let Some(db) = source.pointer("/db").and_then(Value::as_object) {
        let supported: std::collections::BTreeSet<&str> =
            RUST_SUPPORTED_DB_KEYS.iter().copied().collect();
        for key in db.keys() {
            if !supported.contains(key.as_str()) {
                out.push(format!("db.{key}"));
            }
        }
    }

    // redis系
    let redis_supported: std::collections::BTreeSet<&str> =
        RUST_SUPPORTED_REDIS_KEYS.iter().copied().collect();
    for redis_key in [
        "redis",
        "redisForPubsub",
        "redisForJobQueue",
        "redisForTimelines",
        "redisForReactions",
    ] {
        if let Some(r) = source
            .pointer(&format!("/{redis_key}"))
            .and_then(Value::as_object)
        {
            for key in r.keys() {
                if !redis_supported.contains(key.as_str()) {
                    out.push(format!("{redis_key}.{key}"));
                }
            }
            // tls内部
            if let Some(tls) = r.get("tls").and_then(Value::as_object) {
                let tls_supported: std::collections::BTreeSet<&str> =
                    RUST_SUPPORTED_REDIS_TLS_KEYS.iter().copied().collect();
                for key in tls.keys() {
                    if !tls_supported.contains(key.as_str()) {
                        out.push(format!("{redis_key}.tls.{key}"));
                    }
                }
            }
        }
    }

    // ログ
    if let Some(logging) = source.pointer("/logging").and_then(Value::as_object) {
        for key in logging.keys() {
            // `logging.sql`は現行スキーマ。Rust版はSQLログをRUST-05では出さない→未対応。
            out.push(format!("logging.{key}"));
        }
    }

    out.sort();
    out.dedup();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_schema_parses_and_has_input() {
        let schema: Value = serde_json::from_str(CONFIG_SCHEMA_JSON).expect("embedded schema");
        assert!(schema.pointer("/$defs/input").is_some());
        assert!(known_top_level_keys(&schema).contains("db"));
        assert!(known_top_level_keys(&schema).contains("redis"));
    }
}
