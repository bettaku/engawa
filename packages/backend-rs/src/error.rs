/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! エラー型。ライブラリは[`BackendError`]を返し、バイナリのエントリーポイントは`anyhow`に載せる。
//! ユーザー入力・設定に対する失敗と、内部の障害を区別する。秘密情報をエラーメッセージに含めない。

use std::path::PathBuf;

/// `engawa-backend`全体のエラー。
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum BackendError {
    /// 設定ファイルが見つからない。
    #[error("configuration file not found: {path}")]
    ConfigFileNotFound {
        /// 探したパス。
        path: PathBuf,
    },

    /// YAMLとして読めない。**YAML本文をエラーに含めない**（接続情報が混ざるため）。
    #[error("invalid YAML syntax in configuration file: {path}")]
    ConfigYamlSyntax {
        /// ファイルパス。
        path: PathBuf,
    },

    /// スキーマ検証に失敗した。`CHERRYPICK_CONFIG_VALIDATION=error`のとき。
    #[error("invalid configuration:\n{diagnostics}")]
    ConfigValidation {
        /// 1行1診断の整形済みメッセージ。秘密情報は伏せる。
        diagnostics: String,
    },

    /// `CHERRYPICK_CONFIG_VALIDATION`の値が不正。
    #[error("CHERRYPICK_CONFIG_VALIDATION must be one of warn, error or off")]
    InvalidConfigValidationMode,

    /// `CHERRYPICK_CONFIG_YML`の解決に失敗した。
    #[error("cannot resolve configuration path: {message}")]
    ConfigPath {
        /// 理由（秘密を含まない）。
        message: String,
    },

    /// `url`が不正、またはhttp/httpsでない。
    #[error("/url must be a valid URL using http or https")]
    InvalidPublicUrl,

    /// `id`が未知のID生成方式。
    #[error("unknown id method: {0}")]
    UnknownIdMethod(String),

    /// 環境変数の値が不正。
    #[error("invalid value for environment variable {name}")]
    InvalidEnv {
        /// 変数名。
        name: &'static str,
    },

    /// 待ち受けアドレスを作れない。
    #[error("invalid listen address: {message}")]
    ListenAddress {
        /// 理由。
        message: String,
    },

    /// PostgreSQLへ接続できない。
    #[error("cannot connect to PostgreSQL: {message}")]
    DatabaseConnect {
        /// ドライバーのエラー（接続情報を含めない）。
        message: String,
    },

    /// Redisへ接続できない。
    #[error("cannot connect to Redis: {message}")]
    RedisConnect {
        /// ドライバーのエラー（接続情報を含めない）。
        message: String,
    },

    /// HTTPサーバーを起動できない。
    #[error("failed to start HTTP server: {message}")]
    Serve {
        /// 理由。
        message: String,
    },

    /// ファイルIOの失敗。
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// 結果型のエイリアス。
pub type Result<T> = std::result::Result<T, BackendError>;
