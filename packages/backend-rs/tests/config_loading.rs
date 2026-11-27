// SPDX-FileCopyrightText: syuilo and misskey-project
// SPDX-License-Identifier: AGPL-3.0-only

//! 設定読み込みのテスト（計画§6、ADR-0009）。

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::{BTreeMap, BTreeSet};

use engawa_backend::config::schema::CONFIG_SCHEMA_JSON;
use engawa_backend::config::{self, Environment, ValidationMode};

fn schema() -> serde_json::Value {
    serde_json::from_str(CONFIG_SCHEMA_JSON).unwrap()
}

fn known_env() -> BTreeSet<String> {
    schema()
        .pointer("/$defs/environment/properties")
        .and_then(|v| v.as_object())
        .unwrap()
        .keys()
        .cloned()
        .collect()
}

fn env_with(pairs: &[(&str, &str)], config_path: &std::path::Path) -> Environment {
    let mut m: BTreeMap<String, String> = pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    m.insert(
        "CHERRYPICK_CONFIG_YML".into(),
        config_path.to_string_lossy().into_owned(),
    );
    Environment::from_values(m, &known_env()).unwrap()
}

fn write_tmp_config(name: &str, contents: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("engawa-rs-config-test");
    std::fs::create_dir_all(&dir).unwrap();
    let p = dir.join(name);
    std::fs::write(&p, contents).unwrap();
    p
}

const BASE: &str = r#"
url: http://example.test
port: 3000
db:
  host: dbhost
  port: 5432
  db: cherrypick
  user: cp
  pass: secret
redis:
  host: redis
  port: 6379
id: aidx
"#;

#[test]
fn loads_basic_yaml_and_derives_public_url() {
    let p = write_tmp_config("basic.yml", BASE);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    assert_eq!(cfg.public.url, "http://example.test");
    assert_eq!(cfg.public.host, "example.test"); // ポートなし
    assert_eq!(cfg.public.hostname, "example.test");
    assert_eq!(cfg.public.scheme, "http");
    assert_eq!(cfg.public.ws_scheme, "ws");
    assert_eq!(cfg.public.api_url(), "http://example.test/api");
    assert_eq!(cfg.port, Some(3000));
    assert_eq!(cfg.db.host, "dbhost");
    assert_eq!(cfg.db.database, "cherrypick");
    assert_eq!(cfg.db.username, "cp");
    assert_eq!(cfg.db.password, "secret");
    assert_eq!(cfg.redis.host, "redis");
    // keyPrefix = `keyPrefix ?? `${prefix ?? <instance-host>}:``
    assert_eq!(cfg.redis.key_prefix, "example.test:");
}

#[test]
fn public_url_with_port_keeps_port_in_host_and_key_prefix() {
    let yaml = BASE.replace("url: http://example.test", "url: http://example.test:3000/");
    let p = write_tmp_config("port.yml", &yaml);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    assert_eq!(cfg.public.url, "http://example.test:3000");
    assert_eq!(cfg.public.host, "example.test:3000");
    assert_eq!(cfg.redis.key_prefix, "example.test:3000:");
}

#[test]
fn url_must_be_http_or_https() {
    let yaml = BASE.replace("url: http://example.test", "url: ftp://example.test");
    let p = write_tmp_config("ftp.yml", &yaml);
    let err =
        config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap_err();
    assert!(matches!(
        err,
        engawa_backend::BackendError::InvalidPublicUrl
    ));
}

#[test]
fn invalid_yaml_is_rejected_without_echoing_source() {
    let p = write_tmp_config(
        "bad.yml",
        "url: http://x\n  bad indent: [\npass: SUPERSECRET\n",
    );
    let err =
        config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap_err();
    let msg = err.to_string();
    assert!(!msg.contains("SUPERSECRET"), "secret leaked: {msg}");
}

#[test]
fn missing_file_is_error() {
    let p = std::env::temp_dir().join("definitely-not-here-xyz.yml");
    let err =
        config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap_err();
    assert!(matches!(
        err,
        engawa_backend::BackendError::ConfigFileNotFound { .. }
    ));
}

#[test]
fn id_is_lowercased_and_validated() {
    let yaml = format!("{BASE}\n").replace("id: aidx", "id: AIDX");
    let p = write_tmp_config("idupper.yml", &yaml);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    assert_eq!(cfg.id.as_str(), "aidx");

    let bad = BASE.replace("id: aidx", "id: snowflake");
    let p2 = write_tmp_config("idbad.yml", &bad);
    // `id`はスキーマenum。CHERRYPICK_CONFIG_VALIDATION=errorでは起動しない。warnでは起動するが後段でUnknownIdMethod。
    let env = env_with(&[("CHERRYPICK_CONFIG_VALIDATION", "warn")], &p2);
    let res = config::load_config(&env, &schema(), &std::env::temp_dir());
    assert!(res.is_err()); // UnknownIdMethod
}

#[test]
fn unknown_key_warns_and_unsupported_is_reported_not_silently_ignored() {
    let yaml = format!("{BASE}\nthisIsNotARealKey: 1\nproxyRemoteFiles: true\n");
    let p = write_tmp_config("unknown.yml", &yaml);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    // 未知キー→警告（黙って無視しない）
    assert!(
        cfg.diagnostics
            .iter()
            .any(|d| d.message.contains("Unknown configuration key")
                || d.message.contains("unknown"))
    );
    // スキーマ既知だがRust未対応→unsupported
    assert!(cfg.unsupported_keys.iter().any(|k| k == "proxyRemoteFiles"));
}

#[test]
fn validation_mode_error_refuses_on_invalid() {
    let yaml = BASE.replace("port: 3000", "port: notanumber");
    let p = write_tmp_config("badport.yml", &yaml);
    let env = env_with(&[("CHERRYPICK_CONFIG_VALIDATION", "error")], &p);
    let err = config::load_config(&env, &schema(), &std::env::temp_dir()).unwrap_err();
    assert!(matches!(
        err,
        engawa_backend::BackendError::ConfigValidation { .. }
    ));
}

#[test]
fn validation_mode_off_skips_schema_check() {
    let yaml = BASE; // offでも最低限は要る
    let p = write_tmp_config("off.yml", yaml);
    let env = env_with(&[("CHERRYPICK_CONFIG_VALIDATION", "off")], &p);
    assert!(config::load_config(&env, &schema(), &std::env::temp_dir()).is_ok());
}

#[test]
fn invalid_validation_mode_value_is_error() {
    let p = write_tmp_config("x.yml", BASE);
    let mut m: BTreeMap<String, String> = BTreeMap::new();
    m.insert(
        "CHERRYPICK_CONFIG_YML".into(),
        p.to_string_lossy().into_owned(),
    );
    m.insert("CHERRYPICK_CONFIG_VALIDATION".into(), "bogus".into());
    let err = Environment::from_values(m, &known_env()).unwrap_err();
    assert!(matches!(
        err,
        engawa_backend::BackendError::InvalidConfigValidationMode
    ));
}

#[test]
fn env_overrides_url_port_db() {
    // Node.js版`applyEnv`は、設定で未設定（null/省略）のときだけ環境変数で埋める。
    let yaml = BASE
        .replace("url: http://example.test\n", "")
        .replace("port: 3000\n", "")
        .replace("  db: cherrypick\n", "")
        .replace("  user: cp\n", "")
        .replace("  pass: secret\n", "");
    let p = write_tmp_config("env.yml", &yaml);
    let env = env_with(
        &[
            ("CHERRYPICK_URL", "https://override.test"),
            ("PORT", "9999"),
            ("DATABASE_DB", "otherdb"),
            ("DATABASE_USER", "otheruser"),
            ("DATABASE_PASSWORD", "otherpass"),
        ],
        &p,
    );
    let cfg = config::load_config(&env, &schema(), &std::env::temp_dir()).unwrap();
    assert_eq!(cfg.public.url, "https://override.test");
    assert_eq!(cfg.public.scheme, "https");
    assert_eq!(cfg.public.ws_scheme, "wss");
    assert_eq!(cfg.port, Some(9999));
    assert_eq!(cfg.db.database, "otherdb");
    assert_eq!(cfg.db.username, "otheruser");
    assert_eq!(cfg.db.password, "otherpass");
    // keyPrefixのinstance hostも、override後のurlに従う。
    assert_eq!(cfg.redis.key_prefix, "override.test:");
}

#[test]
fn redis_for_x_fall_back_to_redis_and_read_same_settings() {
    let yaml = format!("{BASE}\nredisForTimelines:\n  host: tlredis\n  port: 6380\n  db: 2\n");
    let p = write_tmp_config("redisx.yml", &yaml);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    // 省略→redisと同じ
    assert_eq!(cfg.redis_for_reactions.host, "redis");
    assert_eq!(cfg.redis_for_pubsub.host, "redis");
    assert_eq!(cfg.redis_for_job_queue.host, "redis");
    // 設定されていれば読む（Rust版は接続しないが、黙って無視しない）
    assert_eq!(cfg.redis_for_timelines.host, "tlredis");
    assert_eq!(cfg.redis_for_timelines.port, 6380);
    assert_eq!(cfg.redis_for_timelines.db, 2);
}

#[test]
fn redis_key_prefix_explicit_and_prefix() {
    let yaml = format!("{BASE}\n"); // redis no prefix
    let p = write_tmp_config(
        "kp.yml",
        &yaml.replace(
            "redis:\n  host: redis\n  port: 6379",
            "redis:\n  host: redis\n  port: 6379\n  prefix: myprefix",
        ),
    );
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    assert_eq!(cfg.redis.key_prefix, "myprefix:");

    let p2 = write_tmp_config(
        "kp2.yml",
        &yaml.replace(
            "redis:\n  host: redis\n  port: 6379",
            "redis:\n  host: redis\n  port: 6379\n  keyPrefix: 'custom:'",
        ),
    );
    let cfg2 = config::load_config(&env_with(&[], &p2), &schema(), &std::env::temp_dir()).unwrap();
    assert_eq!(cfg2.redis.key_prefix, "custom:");
}

#[test]
fn redis_sentinel_is_refused_not_silently_ignored() {
    let yaml = BASE.replace(
        "redis:\n  host: redis\n  port: 6379",
        "redis:\n  host: redis\n  port: 6379\n  sentinels:\n    - host: s\n      port: 26379",
    );
    let p = write_tmp_config("sentinel.yml", &yaml);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir());
    // `redis.sentinels`はスキーマ既知。`sentinels`非空→エラー診断。CHERRYPICK_CONFIG_VALIDATION=warnなら診断のみ。
    if let Ok(c) = cfg {
        assert!(
            c.diagnostics
                .iter()
                .any(|d| d.message.contains("Sentinel") || d.path.contains("sentinels"))
        );
    }
}

#[test]
fn db_extra_statement_timeout_and_max() {
    let yaml = BASE.replace(
        "  user: cp\n  pass: secret",
        "  user: cp\n  pass: secret\n  extra:\n    statement_timeout: 5000\n    max: 3",
    );
    let p = write_tmp_config("dbextra.yml", &yaml);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    assert_eq!(cfg.db.statement_timeout_ms, 5000);
    assert_eq!(cfg.db.max_connections, 3);
}

#[test]
fn db_password_not_in_debug() {
    let p = write_tmp_config("dbg.yml", BASE);
    let cfg = config::load_config(&env_with(&[], &p), &schema(), &std::env::temp_dir()).unwrap();
    let dbg = format!("{:?}", cfg.db);
    assert!(!dbg.contains("secret"), "{dbg}");
    assert!(dbg.contains("<redacted>"));
}

#[test]
fn cp_only_queue_flag_parsed() {
    let p = write_tmp_config("cp.yml", BASE);
    let env = env_with(&[("CP_ONLY_QUEUE", "0")], &p); // x-flag: 0でも有効
    let cfg = config::load_config(&env, &schema(), &std::env::temp_dir()).unwrap();
    assert!(cfg.options.only_queue);
}

#[test]
fn validation_mode_default_is_warn() {
    let p = write_tmp_config("w.yml", BASE);
    let env = env_with(&[], &p);
    assert_eq!(env.validation_mode, ValidationMode::Warn);
}
