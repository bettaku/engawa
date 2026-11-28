// SPDX-FileCopyrightText: syuilo and misskey-project
// SPDX-License-Identifier: AGPL-3.0-only

//! シリアライズのPoC検証（ADR-0004）。`undefined`相当の省略と`null`の区別、整数・日時、文字列エスケープ、未知プロパティ。
//!
//! 計画§3.2、ADR-0004。**既存の`JSON.stringify`との差**を把握する。`ping`のような単純ケースだけでなく、将来のAPI型で確認できるように残す。

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use serde::Serialize;

#[test]
fn integer_one_serializes_as_1_not_1_0() {
    let v = serde_json::json!({"n": 1});
    assert_eq!(v.to_string(), r#"{"n":1}"#);
    // f64の1.0は？serde_jsonは`1.0`を出す（JSのJSON.stringify(1.0)="1"とは異なる）→整数型で持つべき。
    let f = serde_json::json!({"n": 1.0f64});
    assert_eq!(f.to_string(), r#"{"n":1.0}"#);
}

#[test]
fn null_vs_omitted_field() {
    #[derive(Serialize)]
    struct S {
        always: Option<i32>, // None→null
        #[serde(skip_serializing_if = "Option::is_none")]
        omitted: Option<i32>, // None→フィールド省略
    }
    let s = S {
        always: None,
        omitted: None,
    };
    let out = serde_json::to_string(&s).unwrap();
    // `undefined`相当の省略と`null`の区別（ADR-0004 #3）。
    assert_eq!(out, r#"{"always":null}"#);
}

#[test]
fn string_escaping_matches_json_stringify_for_common_cases() {
    // 非ASCIIはそのまま、制御文字はエスケープ、`/`はエスケープしない、引用符・バックスラッシュはエスケープ。
    let s = serde_json::json!({"s": "a/b\u{0000}\u{0008}\u{000c}\n\r\t\"\\ é 絵文字😀"});
    let out = s.to_string();
    assert!(out.contains("a/b"), "{out}");
    assert!(!out.contains("a\\/b"), "{out}");
    assert!(out.contains("\\u0000"), "{out}");
    assert!(out.contains("\\b"), "{out}");
    assert!(out.contains("\\f"), "{out}");
    assert!(out.contains("\\n"), "{out}");
    assert!(out.contains("\\r"), "{out}");
    assert!(out.contains("\\t"), "{out}");
    assert!(out.contains("\\\""), "{out}");
    assert!(out.contains("\\\\"), "{out}");
    assert!(out.contains('é'), "{out}"); // 非ASCIIはエスケープしない（JSON.stringifyと同じ）
    assert!(out.contains("😀"), "{out}");
}

#[test]
fn unknown_fields_ignored_on_deserialize_by_default() {
    #[derive(serde::Deserialize)]
    struct S {
        known: i32,
    }
    let s: S = serde_json::from_str(r#"{"known":1,"unknown":2}"#).unwrap();
    assert_eq!(s.known, 1);
}

#[test]
fn chrono_datetime_serializes_rfc3339() {
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(1_735_689_600_000).unwrap(); // 2025-01-01T00:00:00.000Z
    let out = serde_json::to_string(&dt).unwrap();
    // JS toISOString(): `2025-01-01T00:00:00.000Z`. chronoのデフォルトserdeは精度可変なので、固定が必要かを確認する。
    eprintln!("chrono serde output: {out}");
    // パース可能でUTC `Z`であることだけを保証。ミリ秒3桁固定は呼び出し側で整える（ADR-0004）。
    let text: String = serde_json::from_str(&out).unwrap();
    assert!(text.ends_with('Z'), "not UTC `Z`: {text}");
    let back: chrono::DateTime<chrono::Utc> = serde_json::from_str(&out).unwrap();
    assert_eq!(back.timestamp_millis(), 1_735_689_600_000);
}

/// JS `toISOString()`相当：ミリ秒3桁・UTC・`Z`。Rust側で固定して出す（ADR-0004「日時」）。
fn to_iso_string(dt: chrono::DateTime<chrono::Utc>) -> String {
    dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[test]
fn iso_string_millis_3_utc_z() {
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(1_735_689_600_123).unwrap();
    assert_eq!(to_iso_string(dt), "2025-01-01T00:00:00.123Z");
    let dt0 = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(1_735_689_600_000).unwrap();
    assert_eq!(to_iso_string(dt0), "2025-01-01T00:00:00.000Z");
}
