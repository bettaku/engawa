/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! Redisアクセス（ADR-0005）。`redis`クレート（redis-rs）+ `ConnectionManager`（自動再接続）。
//!
//! - **用途別の小さなadapterに閉じ込める。** 業務処理から直接クライアントを呼ばない。ここはadapterの土台。
//! - **prefixを付けるのはadapterの責務。** ioredisの`keyPrefix`と同じキーになるようにする（計画§5.2、ADR-0005 #3）。
//! - Pub/Subの再購読・キャッシュ無効化はフェーズ2〜3。RUST-05では`redis`（キャッシュ・汎用）接続のみ作る。
//! - **ジョブキュー（`redisForJobQueue`）には接続しない。** BullMQはNode.js版が管理する（ADR-0006）。設定は読むだけ。
//! - **Redisを「捨てられるキャッシュ」として扱わない。** 通知履歴・リアクション未反映分・TOTP使用済み等は永続扱い（計画§5.2）。RUST-05では読み書きしない。
//! - TLSはrustls + aws-lc-rs（ADR-0007）。`rejectUnauthorized=false`はinsecureモード（設定時は起動ログに出す）。
//! - **Redis Sentinel / Redis Clusterは未検証。** 設定があれば起動時に検出する（黙って無視しない）。

use std::path::PathBuf;
use std::time::Duration;

use redis::aio::ConnectionManager;
use redis::{
    ConnectionAddr, ConnectionInfo, IntoConnectionInfo, ProtocolVersion, RedisConnectionInfo,
};

use crate::error::BackendError;

/// `family`。Node ioredisの`family`（0=両方、4=IPv4、6=IPv6）。**redis-rsでは強制できない**（0のみ実質対応）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedisFamily {
    /// 0。IPv4/IPv6両方。
    Dual,
    /// 4。**未対応（起動時に報告）。**
    Ipv4,
    /// 6。**未対応（起動時に報告）。**
    Ipv6,
}

/// Redis TLS設定。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RedisTls {
    /// `rejectUnauthorized=false`相当。**証明書を検証しない。** 起動ログに出す。
    pub reject_unauthorized: bool,
}

/// 1つのRedis接続設定。`RedisOptionsSource` + ioredis + `convertRedisOptions`の結果。
/// **`password`はログに出さない。**
#[derive(Clone)]
pub struct RedisConfig {
    /// Redisホスト。既定`localhost`。
    pub host: String,
    /// ポート。既定6379。
    pub port: u16,
    /// Unix socketパス。設定時はTCPより優先（ioredisの`path`）。
    pub path: Option<PathBuf>,
    /// `username`（ACL）。
    pub username: Option<String>,
    /// `pass ?? password`。**秘密。**
    pub password: Option<String>,
    /// DB番号。既定0。
    pub db: u32,
    /// `prefix`。既定なし（`keyPrefix`の既定計算に使う）。
    pub prefix: Option<String>,
    /// **ioredisの`keyPrefix`相当の最終値。** `keyPrefix ?? `${prefix ?? <instance-host>}:``。
    pub key_prefix: String,
    /// TLS。
    pub tls: Option<RedisTls>,
    /// `family`。
    pub family: RedisFamily,
    /// `connectTimeout`（ミリ秒）→ redis-rsの`connection_timeout`。
    pub connect_timeout: Option<Duration>,
    /// `commandTimeout`（ミリ秒）→ redis-rsの`response_timeout`。
    pub command_timeout: Option<Duration>,
    /// `maxRetriesPerRequest`。`None`=未指定。`usize::MAX`相当（Nodeの`null`=無限）は[`RedisConfig::INFINITE_RETRIES`]。
    pub max_retries_per_request: Option<usize>,
}

impl std::fmt::Debug for RedisConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RedisConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("path", &self.path)
            .field("username", &self.username)
            .field("password", &"<redacted>")
            .field("db", &self.db)
            .field("prefix", &self.prefix)
            .field("key_prefix", &self.key_prefix)
            .field("tls", &self.tls)
            .field("family", &self.family)
            .field("connect_timeout", &self.connect_timeout)
            .field("command_timeout", &self.command_timeout)
            .field("max_retries_per_request", &self.max_retries_per_request)
            .finish()
    }
}

impl RedisConfig {
    /// Node.js `maxRetriesPerRequest: null`（無限）相当。
    pub const INFINITE_RETRIES: usize = usize::MAX;

    /// redis-rsの`ConnectionInfo`を作る。**秘密はここに集約し、外に出さない。**
    pub fn connection_info(&self) -> redis::RedisResult<ConnectionInfo> {
        let addr = if let Some(path) = &self.path {
            ConnectionAddr::Unix(path.clone())
        } else if let Some(tls) = self.tls {
            ConnectionAddr::TcpTls {
                host: self.host.clone(),
                port: self.port,
                insecure: !tls.reject_unauthorized,
                tls_params: None,
            }
        } else {
            ConnectionAddr::Tcp(self.host.clone(), self.port)
        };

        let mut redis_info = RedisConnectionInfo::default()
            .set_db(i64::from(self.db))
            .set_protocol(ProtocolVersion::RESP2);
        if let Some(u) = &self.username {
            redis_info = redis_info.set_username(u);
        }
        if let Some(pw) = &self.password {
            redis_info = redis_info.set_password(pw);
        }

        // `IntoConnectionInfo for ConnectionAddr`。`tcp_settings`は既定。
        addr.into_connection_info()
            .map(|info| info.set_redis_settings(redis_info))
    }

    /// `keyPrefix`が付くキー。ioredis同様、**コマンドに渡すキーにprefixを足すのはadapterの責務。**
    pub fn apply_key_prefix(&self, key: &str) -> String {
        format!("{}{key}", self.key_prefix)
    }
}

/// `redis`（キャッシュ・汎用）adapter。`ConnectionManager`で自動再接続。
#[derive(Clone)]
pub struct RedisAdapter {
    inner: ConnectionManager,
    /// このadapterのprefix。
    key_prefix: String,
}

impl RedisAdapter {
    /// adapterを作る。**`new_lazy_with_config`で起動をRedis到達に依存させない。** `ConnectionManager`が背景で接続・再接続する。
    /// 接続文字列が不正なら`Err`。
    pub async fn connect(config: &RedisConfig) -> Result<Self, BackendError> {
        let info = config
            .connection_info()
            .map_err(|e| BackendError::RedisConnect {
                message: sanitize_redis_error(&e.to_string()),
            })?;
        let client = redis::Client::open(info).map_err(|e| BackendError::RedisConnect {
            message: sanitize_redis_error(&e.to_string()),
        })?;

        let mut mgr_config = redis::aio::ConnectionManagerConfig::new();
        if let Some(d) = config.connect_timeout {
            mgr_config = mgr_config.set_connection_timeout(Some(d));
        }
        if let Some(d) = config.command_timeout {
            mgr_config = mgr_config.set_response_timeout(Some(d));
        }
        if let Some(n) = config.max_retries_per_request {
            mgr_config = mgr_config.set_number_of_retries(n);
        }

        // **`new_lazy_with_config`: 起動をRedis到達に依存させない。** `ConnectionManager`が背景で接続・再接続する。
        let inner = ConnectionManager::new_lazy_with_config(client, mgr_config).map_err(|e| {
            BackendError::RedisConnect {
                message: sanitize_redis_error(&e.to_string()),
            }
        })?;

        Ok(Self {
            inner,
            key_prefix: config.key_prefix.clone(),
        })
    }

    /// `PING`。ヘルスチェック・再接続確認。
    pub async fn ping(&self) -> Result<(), redis::RedisError> {
        let mut conn = self.inner.clone();
        redis::cmd("PING")
            .query_async::<String>(&mut conn)
            .await
            .map(|_| ())
    }

    /// 終了時。`QUIT`を送る。`ConnectionManager`はdropで停止。
    pub async fn shutdown(mut self) {
        let _ = redis::cmd("QUIT").exec_async(&mut self.inner).await;
    }

    /// 生の`ConnectionManager`（adapter内部用。外には出さない方針だが、PoC段階では公開）。
    pub fn connection(&self) -> ConnectionManager {
        self.inner.clone()
    }

    /// keyPrefix。
    pub fn key_prefix(&self) -> &str {
        &self.key_prefix
    }
}

/// **Sentinel設定を検出する。** `sentinels`が非空なら未対応。黙って無視しない。
pub fn detects_sentinel(source: &serde_json::Value) -> bool {
    source
        .get("sentinels")
        .map(|v| v.is_array() && !v.as_array().map(|a| a.is_empty()).unwrap_or(true))
        .unwrap_or(false)
}

/// **Redis Cluster設定を検出する。** 現行Node.js版はClusterを作らないが、設定スキーマが許すキー。黙って無視しない。
pub fn detects_cluster(source: &serde_json::Value) -> bool {
    // 現行スキーマに明示の`cluster`キーはないが、ioredisが受ける。`role`/`name`等のSentinel系と区別。ここでは`cluster:true`を検出。
    source
        .get("cluster")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

/// ドライバーのエラー文字列から秘密を落とす。**パスワードをログに出さない。**
fn sanitize_redis_error(message: &str) -> String {
    // `redis::RedisError`は接続情報を含まないが、念のため`password=`/`user:pass@`形式を伏せる。
    let mut out = message.to_string();
    // `scheme://user:pass@host` → `scheme://<redacted>@host`
    if let Some(at) = out.find('@')
        && let Some(scheme_end) = out.find("://")
    {
        let prefix = &out[..scheme_end + 3];
        let rest = &out[at..];
        out = format!("{prefix}<redacted>{rest}");
    }
    out
}
