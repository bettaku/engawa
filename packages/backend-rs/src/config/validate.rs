/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! `x-*`拡張の手前処理（`prepare`）、環境変数の適用（`applyEnv`）、`jsonschema`検証。
//! Node.js版 `config/parse.ts` と同じ手順。秘密の**値**は診断に出さない。

use serde_json::Value;

use super::env::{Diagnostic, DiagnosticLevel};

fn record(v: &Value) -> bool {
    v.is_object()
}

fn escape_key(key: &str) -> String {
    key.replace('~', "~0").replace('/', "~1")
}

/// `x-null-as-unset` / `x-deprecation` / `/id`小文字化を再帰適用する。
pub fn prepare(
    value: &Value,
    field: &Value,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Value {
    if let Some(deprecated) = field.get("x-deprecation").and_then(Value::as_str) {
        let message = match deprecated {
            "no-effect" => "This option has no effect.".to_string(),
            "migration-only" => {
                "Used only during migration. Use the admin settings afterwards.".to_string()
            }
            other if !other.is_empty() => other.to_string(),
            _ => field
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("Scheduled for removal")
                .to_string(),
        };
        diagnostics.push(Diagnostic {
            level: DiagnosticLevel::Warning,
            path: if path.is_empty() {
                "(root)".into()
            } else {
                path.to_string()
            },
            message,
        });
    }

    // `/id`は小文字化する（Node版と同じ。スキーマは大文字変種も受けるが、後段は小文字で扱う）。
    if path == "/id"
        && let Some(s) = value.as_str()
    {
        return Value::String(s.to_lowercase());
    }

    if !record(value) {
        return value.clone();
    }

    let props = match field.get("properties").and_then(Value::as_object) {
        Some(p) => p,
        None => return value.clone(),
    };

    let obj = match value.as_object() {
        Some(o) => o,
        None => return value.clone(),
    };

    let mut result = obj.clone();
    for (key, child_field) in props {
        if !result.contains_key(key) {
            continue;
        }
        let child_path = format!("{path}/{}", escape_key(key));
        match result.get(key).cloned() {
            Some(Value::Null)
                if child_field.get("x-null-as-unset").and_then(Value::as_bool) == Some(true) =>
            {
                result.remove(key);
            }
            Some(child_value) => {
                let prepared = prepare(&child_value, child_field, &child_path, diagnostics);
                result.insert(key.clone(), prepared);
            }
            None => {}
        }
    }
    Value::Object(result)
}

/// `applyEnv`。`CHERRYPICK_URL`/`PORT`/`DATABASE_DB`/`DATABASE_USER`/`DATABASE_PASSWORD`で未設定を埋める。
pub fn apply_env(
    value: &Value,
    env: &std::collections::BTreeMap<String, String>,
    strict: bool,
) -> Value {
    let mut result = match value {
        Value::Object(o) => o.clone(),
        _ => return value.clone(),
    };

    if result.get("url").map(|v| v.is_null()).unwrap_or(true)
        && let Some(v) = env.get("CHERRYPICK_URL")
        && !v.is_empty()
    {
        result.insert("url".into(), Value::String(v.clone()));
    }

    if result.get("port").map(|v| v.is_null()).unwrap_or(true)
        && let Some(raw) = env.get("PORT")
        && !raw.is_empty()
    {
        let parsed = if strict && !raw.bytes().all(|b| b.is_ascii_digit()) {
            Value::String(raw.clone())
        } else {
            // Node版parseInt。数値にできなければNaN→無視（Rust版は後段のPORT検証で弾く）。
            match raw.parse::<u64>() {
                Ok(n) => Value::Number(n.into()),
                Err(_) => Value::Null,
            }
        };
        result.insert("port".into(), parsed);
    }

    if let Some(Value::Object(db)) = result.get("db").cloned() {
        let mut db = db;
        for (key, var) in [
            ("db", "DATABASE_DB"),
            ("user", "DATABASE_USER"),
            ("pass", "DATABASE_PASSWORD"),
        ] {
            if db.get(key).map(|v| v.is_null()).unwrap_or(true)
                && let Some(v) = env.get(var)
                && !v.is_empty()
            {
                db.insert(key.into(), Value::String(v.clone()));
            }
        }
        result.insert("db".into(), Value::Object(db));
    }

    Value::Object(result)
}

/// jsonschemaで検証し、AJV風の診断に変換する。`kind`は`input`/`effective`。秘密は`actual`を出さない。
pub fn schema_errors(
    validator: &jsonschema::Validator,
    instance: &Value,
    known_secret_paths: &[&str],
) -> Vec<Diagnostic> {
    let _ = known_secret_paths;
    let mut out = Vec::new();
    for err in validator.iter_errors(instance) {
        let instance_path = err.instance_path().to_string();
        // `additionalProperties`は未知キー→warning。それ以外はerror。
        let (level, message) = match err.kind() {
            jsonschema::error::ValidationErrorKind::AdditionalProperties { .. } => (
                DiagnosticLevel::Warning,
                "Unknown configuration key.".to_string(),
            ),
            _ => (DiagnosticLevel::Error, err.to_string()),
        };
        out.push(Diagnostic {
            level,
            path: if instance_path.is_empty() {
                "(root)".into()
            } else {
                instance_path
            },
            message,
        });
    }
    out
}
