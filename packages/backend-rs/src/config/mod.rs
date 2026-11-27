/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! 設定（計画§6、ADR-0009）。
//!
//! - 同じ設定ファイル（YAML、`CHERRYPICK_CONFIG_YML`、`.config/`）と**同じスキーマ**（`packages/backend/config.schema.json`）を読む。
//! - 設定の意味・既定値・URL派生値・`CP_*`環境変数を保つ（`packages/backend/src/config.ts`）。
//! - `CHERRYPICK_CONFIG_VALIDATION`（warn/error/off、既定warn）。無効な値・未知キーを黙って無視しない。
//! - **Rust版で未対応の設定を黙って無視しない。** スキーマ既知だがRust版で読まないキーを`unsupported`として報告する。
//! - **DB・Redisの接続上限は、Node.js版との合計で管理する**（ここではRust側を明示。計画§6）。

pub mod db;
pub mod env;
pub mod id;
pub mod path;
pub mod schema;
pub mod validate;

use std::path::PathBuf;
use std::time::Duration;

use serde_json::Value;

use crate::error::BackendError;
use crate::logging::NodeEnv;
use crate::redis::{RedisConfig, RedisFamily, RedisTls};

pub use db::{DbConfig, DbSlave, DbSsl};
pub use env::{Diagnostic, DiagnosticLevel, EnvOption, Environment, ValidationMode};
pub use id::IdMethod;

use schema::CONFIG_SCHEMA_JSON;

/// `url`由来の派生値。`packages/backend/src/config.ts`の`deriveConfig`と同じ。
#[derive(Debug, Clone)]
pub struct PublicUrl {
    /// `url.origin`。
    pub url: String,
    /// `url.host`（ポート込み）。Redis keyPrefixの既定に使う。
    pub host: String,
    /// `url.hostname`。
    pub hostname: String,
    /// `url.protocol`（`:`除く）。`http`/`https`。
    pub scheme: String,
    /// `http→ws`, `https→wss`。
    pub ws_scheme: String,
}

impl PublicUrl {
    /// `${wsScheme}://${host}`。
    pub fn ws_url(&self) -> String {
        format!("{}://{}", self.ws_scheme, self.host)
    }
    /// `${scheme}://${host}/api`。
    pub fn api_url(&self) -> String {
        format!("{}://{}/api", self.scheme, self.host)
    }
    /// `${scheme}://${host}/auth`。
    pub fn auth_url(&self) -> String {
        format!("{}://{}/auth", self.scheme, self.host)
    }
    /// `${scheme}://${host}/files`。
    pub fn drive_url(&self) -> String {
        format!("{}://{}/files", self.scheme, self.host)
    }
}

/// `logging`設定。現行は`logging.sql.*`。Rust版はSQLログをRUST-05では出さない（未対応として報告）。
#[derive(Debug, Clone, Copy, Default)]
pub struct LoggingConfig {
    /// `logging.sql.disableQueryTruncation`。
    pub sql_disable_query_truncation: bool,
    /// `logging.sql.enableQueryParamLogging`。**trueでもRust版はパラメータをログに出さない**（機密保護。未対応として報告）。
    pub sql_enable_query_param_logging: bool,
}

/// `trustProxy`。Node版`FastifyServerOptions['trustProxy']`。RUST-05では読むのみ。
pub type TrustProxy = Value;

/// 読み込んだ設定。
#[derive(Debug, Clone)]
pub struct Config {
    /// 公開URL派生値。
    pub public: PublicUrl,
    /// 待ち受けポート。`socket`使用時は`None`可。Node版`port ?? NaN`。Rust版は`Option`。
    pub port: Option<u16>,
    /// Unix socket。設定時はTCPより優先。
    pub socket: Option<PathBuf>,
    /// Unix socketの`chmod`（8進数文字列）。
    pub chmod_socket: Option<String>,
    /// `trustProxy`。
    pub trust_proxy: TrustProxy,
    /// `disableHsts`。Rust版はHTTPSを終端しないが保持。
    pub disable_hsts: bool,
    /// ID生成方式（小文字化済み）。
    pub id: IdMethod,
    /// `db`。
    pub db: DbConfig,
    /// `dbReplications`。**Rust版は未対応。** trueなら報告。
    pub db_replications: bool,
    /// `dbSlaves`。**Rust版は未対応。**
    pub db_slaves: Vec<DbSlave>,
    /// `redis`（キャッシュ・汎用）。
    pub redis: RedisConfig,
    /// `redisForPubsub`（省略時`redis`）。**Rust版RUST-05では接続しない。**
    pub redis_for_pubsub: RedisConfig,
    /// `redisForJobQueue`（省略時`redis`）。**BullMQはNode.js版。Rust版は接続しない。**
    pub redis_for_job_queue: RedisConfig,
    /// `redisForTimelines`（省略時`redis`）。**Rust版RUST-05では接続しない。**
    pub redis_for_timelines: RedisConfig,
    /// `redisForReactions`（省略時`redis`）。**Rust版RUST-05では接続しない。**
    pub redis_for_reactions: RedisConfig,
    /// `pidFile`。
    pub pid_file: Option<PathBuf>,
    /// `logging`。
    pub logging: LoggingConfig,
    /// `CP_*`。
    pub options: EnvOption,
    /// `NODE_ENV`。
    pub node_env: NodeEnv,
    /// 診断（警告・エラー）。秘密を含めない。
    pub diagnostics: Vec<Diagnostic>,
    /// スキーマ既知だがRust版が未対応の設定キー（キー名のみ）。
    pub unsupported_keys: Vec<String>,
    /// 元の設定（秘密を含みうる。外部に出さない）。
    pub raw_source: Value,
    /// 解決した設定ファイルパス。
    pub config_path: PathBuf,
}

/// `loadConfig()`相当。
pub struct LoadedConfig {
    /// 設定。
    pub config: Config,
}

/// プロセス環境から設定を読み込む。
pub fn load_config_from_env() -> Result<Config, BackendError> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let schema = parse_embedded_schema()?;
    let known_env = known_env_keys(&schema);
    let environment = Environment::from_process(&known_env)?;
    load_config(&environment, &schema, &cwd)
}

/// 明示した環境から読み込む（テスト用）。
pub fn load_config(
    environment: &Environment,
    schema: &Value,
    cwd: &std::path::Path,
) -> Result<Config, BackendError> {
    let mode = environment.validation_mode;
    let config_path =
        path::resolve_config_path(environment.config_yml.as_deref(), environment.node_env, cwd)?;

    let raw_text = match std::fs::read_to_string(&config_path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(BackendError::ConfigFileNotFound { path: config_path });
        }
        Err(e) => return Err(BackendError::Io(e)),
    };

    let raw_value: Value = match serde_saphyr::from_str::<Value>(&raw_text) {
        Ok(v) => v,
        // YAML本文をエラーに含めない。
        Err(_) => return Err(BackendError::ConfigYamlSyntax { path: config_path }),
    };

    // 設定ファイルが空→`null`。Node.js `load('')`→undefined→`prepare`→{}→スキーマエラー（url必須等）。Rust版も空オブジェクトに。
    let raw_value = if raw_value.is_null() {
        Value::Object(serde_json::Map::new())
    } else {
        raw_value
    };

    let mut diagnostics = environment.diagnostics.clone();

    // mode=off: `prepare`/スキーマ検証をしない。`applyEnv`は素の値に適用する（Node版と同じ）。
    let (prepared, effective) = if mode == ValidationMode::Off {
        let source = validate::apply_env(&raw_value, environment.raw_values(), false);
        (raw_value.clone(), source)
    } else {
        let input_schema = schema::input_validator_schema(schema);
        let effective_schema = schema::effective_validator_schema(schema);

        let mut prepared_diags = Vec::new();
        let prepared = validate::prepare(
            &raw_value,
            &schema
                .pointer("/$defs/input")
                .cloned()
                .unwrap_or(Value::Null),
            "",
            &mut prepared_diags,
        );
        diagnostics.extend(prepared_diags);

        // `input`検証（env適用前）。
        if let Ok(validator) = jsonschema::Validator::new(&input_schema) {
            diagnostics.extend(validate::schema_errors(&validator, &prepared, &[]));
        }

        let effective = validate::apply_env(&prepared, environment.raw_values(), true);
        if let Ok(validator) = jsonschema::Validator::new(&effective_schema) {
            diagnostics.extend(validate::schema_errors(&validator, &effective, &[]));
        }

        // `url`がhttp/httpsであること（Node版と同じ追加チェック）。
        if let Some(url_str) = effective.get("url").and_then(Value::as_str) {
            match url::Url::parse(url_str) {
                Ok(u) if matches!(u.scheme(), "http" | "https") => {}
                Ok(_) => diagnostics.push(Diagnostic {
                    level: DiagnosticLevel::Error,
                    path: "/url".into(),
                    message: "URL must use http or https.".into(),
                }),
                Err(_) => diagnostics.push(Diagnostic {
                    level: DiagnosticLevel::Error,
                    path: "/url".into(),
                    message: "Invalid URL.".into(),
                }),
            }
        }

        (prepared, effective)
    };

    // `mode=error`では、sourceにeffectiveを使う（Node版と同じ）。`mode=off`/warnではprepared+env適用。
    let source = effective.clone();
    let _ = prepared;

    // 未対応キーの報告（黙って無視しない）。
    let unsupported_keys = schema::collect_unsupported(&source, schema);

    // `dbReplications=true`。
    if get_bool(&source, "dbReplications").unwrap_or(false) {
        diagnostics.push(Diagnostic {
            level: DiagnosticLevel::Warning,
            path: "/dbReplications".into(),
            message:
                "dbReplications is not supported by the Rust backend yet; reads use the primary."
                    .into(),
        });
    }
    // Redis Sentinel / Cluster 検出。
    for redis_key in [
        "redis",
        "redisForPubsub",
        "redisForJobQueue",
        "redisForTimelines",
        "redisForReactions",
    ] {
        if let Some(r) = source.pointer(&format!("/{redis_key}")) {
            if crate::redis::detects_sentinel(r) {
                diagnostics.push(Diagnostic {
                    level: DiagnosticLevel::Error,
                    path: format!("/{redis_key}/sentinels"),
                    message: "Redis Sentinel is not supported by the Rust backend (untested)."
                        .into(),
                });
            }
            if crate::redis::detects_cluster(r) {
                diagnostics.push(Diagnostic {
                    level: DiagnosticLevel::Error,
                    path: format!("/{redis_key}/cluster"),
                    message: "Redis Cluster is not supported by the Rust backend (untested)."
                        .into(),
                });
            }
            if let Some(fam) = get_i64(r, "family")
                && (fam == 4 || fam == 6)
            {
                diagnostics.push(Diagnostic { level: DiagnosticLevel::Warning, path: format!("/{redis_key}/family"), message: "redis family=4/6 is not enforceable by the Rust Redis client; family=0 behaviour is used.".into() });
            }
        }
    }
    // `db.extra.ssl`のカスタム証明書は未対応。
    if let Some(ssl) = source.pointer("/db/extra/ssl").and_then(Value::as_object) {
        for key in ["ca", "cert", "key", "servername", "pfx", "passphrase"] {
            if ssl.contains_key(key) {
                diagnostics.push(Diagnostic { level: DiagnosticLevel::Warning, path: format!("/db/extra/ssl/{key}"), message: "custom TLS material for PostgreSQL is not supported by the Rust backend yet.".into() });
            }
        }
    }

    // `mode=error`ではエラー診断があれば起動しない（Node版と同じ。`error`は警告を止めない）。
    if mode == ValidationMode::Error {
        let has_error = diagnostics
            .iter()
            .any(|d| d.level == DiagnosticLevel::Error);
        if has_error {
            let msg = diagnostics
                .iter()
                .filter(|d| d.level == DiagnosticLevel::Error)
                .map(Diagnostic::format)
                .collect::<Vec<_>>()
                .join("\n");
            return Err(BackendError::ConfigValidation { diagnostics: msg });
        }
    }

    let public = build_public_url(&source)?;
    let id = IdMethod::parse(get_str(&source, "id").unwrap_or("aidx"))?;

    // `db`
    let db_obj = source.get("db").cloned().unwrap_or(Value::Null);
    let db = build_db(&db_obj)?;

    // `redis` + `redisFor*`
    let redis = build_redis(source.get("redis"), &public.host, None);
    let redis_for_pubsub = build_redis(source.get("redisForPubsub"), &public.host, Some(&redis));
    let redis_for_job_queue =
        build_redis(source.get("redisForJobQueue"), &public.host, Some(&redis));
    let redis_for_timelines =
        build_redis(source.get("redisForTimelines"), &public.host, Some(&redis));
    let redis_for_reactions =
        build_redis(source.get("redisForReactions"), &public.host, Some(&redis));

    let db_replications = get_bool(&source, "dbReplications").unwrap_or(false);
    let db_slaves = build_db_slaves(source.get("dbSlaves"));

    let logging = LoggingConfig {
        sql_disable_query_truncation: source
            .pointer("/logging/sql/disableQueryTruncation")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        sql_enable_query_param_logging: source
            .pointer("/logging/sql/enableQueryParamLogging")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    };

    // 待ち受け。`port`は`x-null-as-unset`。`socket`と排他ではない（Node版はsocket優先）。PORT envはapplyEnvで入る。
    let port = match source.get("port") {
        Some(Value::Number(n)) => n
            .as_u64()
            .and_then(|p| u16::try_from(p).ok())
            .filter(|p| *p >= 1),
        _ => environment.port,
    };
    // `PORT`envが`applyEnv`で入っていれば`source.port`にある。`environment.port`も見る。
    let port = port.or(environment.port);

    let config = Config {
        public,
        port,
        socket: get_str(&source, "socket").map(PathBuf::from),
        chmod_socket: get_str(&source, "chmodSocket").map(str::to_string),
        trust_proxy: source
            .get("trustProxy")
            .cloned()
            .unwrap_or(Value::Bool(false)),
        disable_hsts: get_bool(&source, "disableHsts").unwrap_or(false),
        id,
        db,
        db_replications,
        db_slaves,
        redis,
        redis_for_pubsub,
        redis_for_job_queue,
        redis_for_timelines,
        redis_for_reactions,
        pid_file: get_str(&source, "pidFile").map(PathBuf::from),
        logging,
        options: environment.options,
        node_env: environment.node_env,
        diagnostics,
        unsupported_keys,
        raw_source: source.clone(),
        config_path,
    };

    Ok(config)
}

fn build_public_url(source: &Value) -> Result<PublicUrl, BackendError> {
    let raw = source
        .get("url")
        .and_then(Value::as_str)
        .ok_or(BackendError::InvalidPublicUrl)?;
    let url = url::Url::parse(raw).map_err(|_| BackendError::InvalidPublicUrl)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(BackendError::InvalidPublicUrl);
    }
    let scheme = url.scheme().to_string();
    let host = url
        .host_str()
        .map(|h| match url.port() {
            Some(p) => format!("{h}:{p}"),
            None => h.to_string(),
        })
        .unwrap_or_default();
    // `url.origin`。URLライブラリのoriginに合わせる。host空（path-only等）はInvalidPublicUrl。
    let origin = url.origin().ascii_serialization();
    if host.is_empty() {
        return Err(BackendError::InvalidPublicUrl);
    }
    let hostname = url.host_str().unwrap_or_default().to_string();
    let ws_scheme = scheme.replace("http", "ws");
    Ok(PublicUrl {
        url: origin,
        host,
        hostname,
        scheme,
        ws_scheme,
    })
}

fn build_db(obj: &Value) -> Result<DbConfig, BackendError> {
    let host = get_str(obj, "host").unwrap_or("").to_string(); // schemaで必須。offモードでは後段で弾く。
    // `host`欠落はスキーマエラーだが、offモードでも後段が落ちるように空文字→エラー。
    if host.is_empty() {
        return Err(BackendError::DatabaseConnect {
            message: "db.host is required".into(),
        });
    }
    let port = get_u16(obj, "port").unwrap_or(5432);
    let database = get_str(obj, "db").unwrap_or("").to_string();
    let username = get_str(obj, "user").unwrap_or("").to_string();
    let password = get_str(obj, "pass").unwrap_or("").to_string();

    let extra = obj.get("extra").and_then(Value::as_object);
    let statement_timeout_ms = extra
        .and_then(|e| e.get("statement_timeout"))
        .and_then(json_number_as_u64)
        .unwrap_or(crate::db::DEFAULT_STATEMENT_TIMEOUT_MS);
    let max_connections = extra
        .and_then(|e| e.get("max"))
        .and_then(json_number_as_u64)
        .and_then(|n| u32::try_from(n).ok())
        .unwrap_or(crate::db::DEFAULT_MAX_CONNECTIONS)
        .max(1);
    let ssl = build_db_ssl(extra.and_then(|e| e.get("ssl")));
    let application_name = extra
        .and_then(|e| e.get("application_name"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let disable_cache = get_bool(obj, "disableCache").unwrap_or(false);

    Ok(DbConfig {
        host,
        port,
        database,
        username,
        password,
        statement_timeout_ms,
        max_connections,
        ssl,
        application_name,
        disable_cache,
    })
}

fn build_db_ssl(ssl: Option<&Value>) -> DbSsl {
    match ssl {
        None | Some(Value::Null) | Some(Value::Bool(false)) => DbSsl::Disabled,
        Some(Value::Bool(true)) => DbSsl::VerifyFull,
        Some(Value::Object(o)) => {
            let reject = o
                .get("rejectUnauthorized")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            if reject {
                DbSsl::VerifyFull
            } else {
                DbSsl::RequireWithoutVerify
            }
        }
        // `ssl:"true"`等の文字列はpgではtruthy。Rust版はtrue扱いにする。
        Some(Value::String(s)) => match s.to_lowercase().as_str() {
            "false" | "0" | "no" | "off" => DbSsl::Disabled,
            _ => DbSsl::VerifyFull,
        },
        _ => DbSsl::Disabled,
    }
}

fn build_db_slaves(v: Option<&Value>) -> Vec<DbSlave> {
    let Some(arr) = v.and_then(Value::as_array) else {
        return Vec::new();
    };
    arr.iter()
        .map(|s| DbSlave {
            host: get_str(s, "host").unwrap_or("").to_string(),
            port: get_u16(s, "port").unwrap_or(5432),
            database: get_str(s, "db").unwrap_or("").to_string(),
            username: get_str(s, "user").unwrap_or("").to_string(),
            password: get_str(s, "pass").unwrap_or("").to_string(),
        })
        .collect()
}

fn build_redis(
    v: Option<&Value>,
    instance_host: &str,
    fallback: Option<&RedisConfig>,
) -> RedisConfig {
    // `redisForX`省略→`redis`と同じ（Node版）。`x-null-as-unset`でnull→省略済み。
    let v = match v {
        Some(Value::Object(_)) => v,
        _ => None,
    };
    let Some(obj) = v.and_then(Value::as_object) else {
        return fallback.cloned().unwrap_or_else(|| RedisConfig {
            host: "localhost".into(),
            port: 6379,
            path: None,
            username: None,
            password: None,
            db: 0,
            prefix: None,
            key_prefix: format!("{instance_host}:"),
            tls: None,
            family: RedisFamily::Dual,
            connect_timeout: None,
            command_timeout: None,
            max_retries_per_request: None,
        });
    };

    // 省略時`redis`と同じ。提供されていれば、その値で完全に構築する（Node版`convertRedisOptions`はfallbackなし。スキーマがhost+port/pathを要求）。
    let host = get_str_obj(obj, "host")
        .map(str::to_string)
        .unwrap_or_else(|| {
            fallback
                .map(|f| f.host.clone())
                .unwrap_or_else(|| "localhost".to_string())
        });
    let port = get_u16_obj(obj, "port")
        .or_else(|| fallback.map(|f| f.port))
        .unwrap_or(6379);
    let path = get_str_obj(obj, "path")
        .map(PathBuf::from)
        .or_else(|| fallback.and_then(|f| f.path.clone()));
    let username = get_str_obj(obj, "username")
        .map(str::to_string)
        .or_else(|| fallback.and_then(|f| f.username.clone()));
    let password = get_str_obj(obj, "pass")
        .map(str::to_string)
        .or_else(|| get_str_obj(obj, "password").map(str::to_string))
        .or_else(|| fallback.and_then(|f| f.password.clone()));
    let db = get_u32_obj(obj, "db")
        .or_else(|| fallback.map(|f| f.db))
        .unwrap_or(0);
    let prefix = get_str_obj(obj, "prefix")
        .map(str::to_string)
        .or_else(|| fallback.and_then(|f| f.prefix.clone()));

    let key_prefix = match get_str_obj(obj, "keyPrefix") {
        Some(kp) => kp.to_string(),
        None => {
            let base = prefix.clone().unwrap_or_else(|| instance_host.to_string());
            format!("{base}:")
        }
    };
    // fallback（redis省略時）のkeyPrefixを保持。
    let key_prefix = if obj.contains_key("keyPrefix") || obj.contains_key("prefix") {
        key_prefix
    } else {
        fallback.map(|f| f.key_prefix.clone()).unwrap_or(key_prefix)
    };

    let tls = match obj.get("tls") {
        None | Some(Value::Null) | Some(Value::Bool(false)) => None,
        Some(Value::Bool(true)) => Some(RedisTls {
            reject_unauthorized: true,
        }),
        Some(Value::Object(o)) => {
            let reject = o
                .get("rejectUnauthorized")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            Some(RedisTls {
                reject_unauthorized: reject,
            })
        }
        _ => None,
    };

    let family = match get_i64_obj(obj, "family").unwrap_or(0) {
        4 => RedisFamily::Ipv4,
        6 => RedisFamily::Ipv6,
        _ => RedisFamily::Dual,
    };

    let connect_timeout = get_u64_obj(obj, "connectTimeout").map(Duration::from_millis);
    let command_timeout = get_u64_obj(obj, "commandTimeout").map(Duration::from_millis);
    let max_retries_per_request = match obj.get("maxRetriesPerRequest") {
        None => None,
        Some(Value::Null) => Some(RedisConfig::INFINITE_RETRIES), // Node `null`=無限
        Some(v) => v.as_u64().and_then(|n| usize::try_from(n).ok()),
    };

    RedisConfig {
        host,
        port,
        path,
        username,
        password,
        db,
        prefix,
        key_prefix,
        tls,
        family,
        connect_timeout,
        command_timeout,
        max_retries_per_request,
    }
}

// ---- 小さな取得ヘルパ ----

fn get_str<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
fn get_str_obj<'a>(m: &'a serde_json::Map<String, Value>, key: &str) -> Option<&'a str> {
    m.get(key).and_then(Value::as_str)
}
fn get_bool(v: &Value, key: &str) -> Option<bool> {
    v.get(key).and_then(Value::as_bool)
}
fn get_i64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(Value::as_i64)
}
fn get_i64_obj(m: &serde_json::Map<String, Value>, key: &str) -> Option<i64> {
    m.get(key).and_then(Value::as_i64)
}
fn get_u16(v: &Value, key: &str) -> Option<u16> {
    v.get(key)
        .and_then(Value::as_u64)
        .and_then(|n| u16::try_from(n).ok())
        .filter(|p| *p >= 1)
}
fn get_u16_obj(m: &serde_json::Map<String, Value>, key: &str) -> Option<u16> {
    m.get(key)
        .and_then(Value::as_u64)
        .and_then(|n| u16::try_from(n).ok())
        .filter(|p| *p >= 1)
}
fn get_u32_obj(m: &serde_json::Map<String, Value>, key: &str) -> Option<u32> {
    m.get(key)
        .and_then(Value::as_u64)
        .and_then(|n| u32::try_from(n).ok())
}
fn get_u64_obj(m: &serde_json::Map<String, Value>, key: &str) -> Option<u64> {
    m.get(key).and_then(Value::as_u64)
}
fn json_number_as_u64(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| {
        v.as_f64().and_then(|f| {
            if f >= 0.0 && f.fract() == 0.0 {
                Some(f as u64)
            } else {
                None
            }
        })
    })
}

fn parse_embedded_schema() -> Result<Value, BackendError> {
    serde_json::from_str(CONFIG_SCHEMA_JSON).map_err(|_| BackendError::ConfigValidation {
        diagnostics: "embedded config.schema.json is invalid".into(),
    })
}

fn known_env_keys(schema: &Value) -> std::collections::BTreeSet<String> {
    schema
        .pointer("/$defs/environment/properties")
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}
