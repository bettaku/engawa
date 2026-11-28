/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! `db`設定の構造体。`packages/backend/src/config.ts`の`Config.db` + `postgres.ts`と対応。
//! **`pass`はログに出さない。** `Debug`実装で伏せる。

use sqlx::postgres::PgSslMode;

use super::schema::RUST_SUPPORTED_DB_EXTRA_KEYS;

/// `db.extra.ssl`。node-postgresの`ssl`相当。RUST-05は真偽値 + `rejectUnauthorized`のみ実装。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DbSsl {
    /// TLSを使わない。`ssl=false`/未設定。
    Disabled,
    /// TLSを使う。証明書を検証する。`ssl=true` / `ssl.rejectUnauthorized=true`。
    VerifyFull,
    /// TLSを使う。**証明書を検証しない**（現行`ssl.rejectUnauthorized=false`相当）。セキュリティ低下のため、設定時は起動ログに出す。
    RequireWithoutVerify,
}

impl DbSsl {
    /// SQLxの`PgSslMode`に変換。
    pub fn ssl_mode(self) -> PgSslMode {
        match self {
            Self::Disabled => PgSslMode::Disable,
            Self::VerifyFull => PgSslMode::VerifyFull,
            Self::RequireWithoutVerify => PgSslMode::Require,
        }
    }
}

/// `db`。`db`/`user`/`pass`はNode版と同じく未設定→空文字。`host`/`port`はスキーマで必須。
#[derive(Clone, PartialEq, Eq)]
pub struct DbConfig {
    /// PostgreSQLホスト。
    pub host: String,
    /// ポート。
    pub port: u16,
    /// データベース名。`db` ?? ''。
    pub database: String,
    /// ユーザー。`user` ?? ''。
    pub username: String,
    /// パスワード。`pass` ?? ''。**ログに出さない。**
    pub password: String,
    /// `extra.statement_timeout`（ミリ秒）。既定10000。`0`で無効。
    pub statement_timeout_ms: u64,
    /// `extra.max`（プール上限）。既定10。
    pub max_connections: u32,
    /// `extra.ssl`。
    pub ssl: DbSsl,
    /// `extra.application_name`。
    pub application_name: Option<String>,
    /// `disableCache`。TypeORMのクエリキャッシュ用。Rust版はクエリキャッシュを持たない。未対応として報告するが保持する。
    pub disable_cache: bool,
}

impl std::fmt::Debug for DbConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DbConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("database", &self.database)
            .field("username", &self.username)
            .field("password", &"<redacted>")
            .field("statement_timeout_ms", &self.statement_timeout_ms)
            .field("max_connections", &self.max_connections)
            .field("ssl", &self.ssl)
            .field("application_name", &self.application_name)
            .field("disable_cache", &self.disable_cache)
            .finish()
    }
}

impl DbConfig {
    /// SQLxのSSLモード。
    pub fn ssl_mode(&self) -> PgSslMode {
        self.ssl.ssl_mode()
    }
}

/// `db.extra`でRust版が理解するキー。`schema::RUST_SUPPORTED_DB_EXTRA_KEYS`と一致させる。
pub const DB_EXTRA_KNOWN_KEYS: &[&str] = RUST_SUPPORTED_DB_EXTRA_KEYS;

/// `dbSlaves`の1要素。`dbReplications=true`のread replica。**Rust版RUST-05では接続しない**（未対応として報告）。
#[derive(Clone, PartialEq, Eq)]
pub struct DbSlave {
    /// ホスト。
    pub host: String,
    /// ポート。
    pub port: u16,
    /// データベース名。
    pub database: String,
    /// ユーザー。
    pub username: String,
    /// パスワード。ログに出さない。
    pub password: String,
}

impl std::fmt::Debug for DbSlave {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DbSlave")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("database", &self.database)
            .field("username", &self.username)
            .field("password", &"<redacted>")
            .finish()
    }
}
