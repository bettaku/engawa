/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! 構造化ログ（計画§3.2「ログ・計測」、ADR-0002）。
//!
//! `tracing` + `tracing-subscriber`。JSON形式で出力し、`trace_id`を付けてリクエスト・ジョブをまたいで追えるようにする。
//! 機密値（DBパスワード、Redisパスワード、トークン、`Authorization`等）はログに出さない。
//!
//! 現行Node.js版の`CP_*`環境変数の意味を保つ:
//! - `CP_QUIET`: ログ出力を抑制する（NODE_ENV=testでも明示的に読む。ここでは空文字以外を有効とする）
//! - `CP_VERBOSE`: 本番でもデバッグログを出す
//! - `CP_WITH_LOG_TIME`: タイムスタンプを付ける（JSON出力では常に付く。受け付けるが互換のためのno-op）
//!
//! `NODE_ENV`は読むが、ログの有効化条件には使わない（Node版も`CP_*`が別に効く）。

use tracing::Subscriber;
use tracing_subscriber::fmt::time::UtcTime;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer, Registry};

/// 環境変数の`x-flag`意味。**空文字以外が設定されていれば有効**（`0`や`false`でも有効）。未設定のみ無効。
pub fn env_flag(name: &str) -> bool {
    flag_from_value(std::env::var_os(name).as_deref())
}

/// `x-flag`の意味。空文字以外は有効。`None`のみ無効。
pub fn flag_from_value(value: Option<&std::ffi::OsStr>) -> bool {
    match value {
        Some(v) => !v.is_empty(),
        None => false,
    }
}

/// ログ出力の設定。
#[derive(Debug, Clone)]
pub struct LoggingOptions {
    /// `CP_QUIET`。
    pub quiet: bool,
    /// `CP_VERBOSE`。
    pub verbose: bool,
    /// `CP_WITH_LOG_TIME`。
    pub with_log_time: bool,
    /// NODE_ENV。
    pub node_env: NodeEnv,
}

impl LoggingOptions {
    /// 現在のプロセス環境から読む。
    pub fn from_env() -> Self {
        let node_env = NodeEnv::from_env();
        Self {
            // Node版 `CP_QUIET || isTest`.
            quiet: env_flag("CP_QUIET") || node_env == NodeEnv::Test,
            verbose: env_flag("CP_VERBOSE"),
            with_log_time: env_flag("CP_WITH_LOG_TIME"),
            node_env,
        }
    }
}

/// `NODE_ENV`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeEnv {
    /// `production`。本番保護が有効。
    Production,
    /// `development`。
    Development,
    /// `test`。
    Test,
    /// 未設定・不正。本番以外として扱う。
    Unset,
}

impl NodeEnv {
    /// 環境変数から読む。**不正値は`Unset`**（Node版と同じ。本番以外）。
    pub fn from_env() -> Self {
        match std::env::var("NODE_ENV").ok().as_deref() {
            Some("production") => Self::Production,
            Some("development") => Self::Development,
            Some("test") => Self::Test,
            _ => Self::Unset,
        }
    }

    /// `production`か。
    pub fn is_production(self) -> bool {
        matches!(self, Self::Production)
    }

    /// 設定ファイルの既定名を決める。NODE_ENV=testなら`test.yml`、それ以外は`default.yml`。
    pub fn default_config_file(self) -> &'static str {
        match self {
            Self::Test => "test.yml",
            _ => "default.yml",
        }
    }
}

/// ログを初期化する。二重初期化は無視する（テスト等）。`LoggingOptions::from_env()`を読む。
pub fn init_logging() -> LoggingOptions {
    let options = LoggingOptions::from_env();
    init_logging_with(&options);
    options
}

/// 明示したオプションでログを初期化する。
pub fn init_logging_with(options: &LoggingOptions) {
    // 既にグローバルsubscriberが設定されていれば、エラーを握りつぶす（テストで複数回呼ばれる）。
    let _ = build_subscriber_with_writer(options, std::io::stdout).try_init();
}

/// 初期化と同じ設定（フィルター・JSON形式・スパンのフィールド）の`Subscriber`を、出力先を指定して作る。
/// 本番は標準出力。テストは出力を取り込んで、実際のJSONログを検証する。
pub fn build_subscriber_with_writer<W>(
    options: &LoggingOptions,
    writer: W,
) -> impl Subscriber + Send + Sync
where
    W: for<'w> tracing_subscriber::fmt::MakeWriter<'w> + Send + Sync + 'static,
{
    let filter = if options.quiet {
        EnvFilter::new("off")
    } else if options.verbose {
        EnvFilter::new("debug")
    } else {
        EnvFilter::new("info")
    };

    // JSON構造化ログ。フィールド名は安定させる。`trace_id`はリクエストのスパン（`http.rs`）に入り、
    // `with_current_span`で、そのリクエスト中のログの`span`に出る。
    let fmt_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_writer(writer)
        .with_current_span(true)
        .with_span_list(false)
        .with_timer(UtcTime::rfc_3339())
        .with_target(true)
        .with_level(true)
        .with_filter(filter);

    Registry::default().with(fmt_layer)
}

/// trace IDのヘッダー名。
pub const TRACE_ID_HEADER: &str = "x-request-id";

/// `Layer`の再エクスポート（呼び出し側の型エラーを減らす）。
pub type DynLayer = Box<dyn Layer<Registry> + Send + Sync>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_from_value_treats_any_non_empty_as_enabled() {
        assert!(flag_from_value(Some(std::ffi::OsStr::new("0"))));
        assert!(flag_from_value(Some(std::ffi::OsStr::new("false"))));
        assert!(flag_from_value(Some(std::ffi::OsStr::new("1"))));
        assert!(!flag_from_value(Some(std::ffi::OsStr::new(""))));
        assert!(!flag_from_value(None));
    }

    #[test]
    fn node_env_unknown_is_unset_and_not_production() {
        assert!(!NodeEnv::Unset.is_production());
        assert_eq!(NodeEnv::Unset.default_config_file(), "default.yml");
        assert_eq!(NodeEnv::Test.default_config_file(), "test.yml");
    }
}
