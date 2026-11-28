/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! 環境変数の読み取り。Node.js版 `config/environment.ts` と `config/parse.ts` の`applyEnv`の意味を保つ。
//!
//! - 空文字列は未設定として扱う。
//! - `x-flag`（`CP_*`のON/OFF系）は、**空文字以外が設定されていれば有効**（`0`/`false`でも有効）。
//! - 未知の`CP_*`/`CHERRYPICK_*`は警告にする（黙って無視しない）。
//! - `CHERRYPICK_CONFIG_VALIDATION`は`warn`/`error`/`off`（既定`warn`）。不正な値はエラー。
//! - `CHERRYPICK_URL`、`PORT`、`DATABASE_DB`、`DATABASE_USER`、`DATABASE_PASSWORD`は設定ファイルの未設定値を上書きする。

use crate::error::BackendError;
use crate::logging::{NodeEnv, env_flag};

/// `CHERRYPICK_CONFIG_VALIDATION`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationMode {
    /// 警告のみ。
    Warn,
    /// エラー診断があれば起動しない。
    Error,
    /// 検証しない。
    Off,
}

impl ValidationMode {
    /// 環境変数から読む。既定`warn`。不正値は[`BackendError::InvalidConfigValidationMode`]。
    pub fn from_env_value(value: Option<&str>) -> Result<Self, BackendError> {
        match value {
            None => Ok(Self::Warn),
            Some("warn") => Ok(Self::Warn),
            Some("error") => Ok(Self::Error),
            Some("off") => Ok(Self::Off),
            // 空文字は未設定扱い。ただし明示的に渡された空文字列もNodeは`?? 'warn'`でwarnになる（valuesからは落ちる）。
            Some("") => Ok(Self::Warn),
            Some(_) => Err(BackendError::InvalidConfigValidationMode),
        }
    }
}

/// 起動の形を決める`CP_*`。Node.js版`EnvOption`と対応。Rust版で未使用でも、読んで検証し、黙って無視しない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct EnvOption {
    /// `CP_ONLY_QUEUE`。Rust版RUST-05ではキューを実装しない（別途検出して起動を止める）。
    pub only_queue: bool,
    /// `CP_ONLY_SERVER`。
    pub only_server: bool,
    /// `CP_NO_DAEMONS`。Rust版では現状no-op（対象の定期処理がない）。
    pub no_daemons: bool,
    /// `CP_NO_JOB_SCHEDULERS`。Rust版では現状no-op（キューを持たない）。
    pub no_job_schedulers: bool,
    /// `CP_DISABLE_CLUSTERING`。Rust版はシングルプロセスで常にno-op。
    pub disable_clustering: bool,
    /// `CP_VERBOSE`。
    pub verbose: bool,
    /// `CP_WITH_LOG_TIME`。
    pub with_log_time: bool,
    /// `CP_QUIET`。
    pub quiet: bool,
}

/// 1つの診断。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// `error`か`warning`。
    pub level: DiagnosticLevel,
    /// `$NAME`形式などのパス。
    pub path: String,
    /// メッセージ。秘密を含めない。
    pub message: String,
}

/// 診断のレベル。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticLevel {
    /// エラー。`mode=error`では起動しない。
    Error,
    /// 警告。
    Warning,
}

impl Diagnostic {
    /// 1行表示。秘密は含めない。
    pub fn format(&self) -> String {
        let path = if self.path.is_empty() {
            "(root)"
        } else {
            &self.path
        };
        format!("{path} {}", self.message)
    }
}

/// 環境変数の読み取り結果。
#[derive(Clone)]
pub struct Environment {
    /// `CP_*`。
    pub options: EnvOption,
    /// NODE_ENV。
    pub node_env: NodeEnv,
    /// `CHERRYPICK_CONFIG_VALIDATION`。
    pub validation_mode: ValidationMode,
    /// `CHERRYPICK_CONFIG_YML`。
    pub config_yml: Option<String>,
    /// `CHERRYPICK_URL`。
    pub cherrypick_url: Option<String>,
    /// `PORT`。数値文字列でなければ無視する（Node版`parseInt`→NaN→...の簡略。`strict`では後段で弾く）。
    pub port: Option<u16>,
    /// `PORT`の生値（検証用）。
    pub port_raw: Option<String>,
    /// `DATABASE_DB`。
    pub database_db: Option<String>,
    /// `DATABASE_USER`。
    pub database_user: Option<String>,
    /// `DATABASE_PASSWORD`。
    pub database_password: Option<String>,
    /// 空文字を除いた環境変数。秘密を含みうるので外部に出さない。
    values: std::collections::BTreeMap<String, String>,
    /// 診断。
    pub diagnostics: Vec<Diagnostic>,
}

impl std::fmt::Debug for Environment {
    /// 秘密（`DATABASE_PASSWORD`と、設定と無関係な値を含む環境変数の全体）は出さない。
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Environment")
            .field("options", &self.options)
            .field("node_env", &self.node_env)
            .field("validation_mode", &self.validation_mode)
            .field("config_yml", &self.config_yml)
            .field("cherrypick_url", &self.cherrypick_url)
            .field("port", &self.port)
            .field("port_raw", &self.port_raw)
            .field("database_db", &self.database_db)
            .field("database_user", &self.database_user)
            .field(
                "database_password",
                &self.database_password.as_ref().map(|_| "<redacted>"),
            )
            .field("diagnostics", &self.diagnostics)
            .finish_non_exhaustive()
    }
}

impl Environment {
    /// プロセス環境から読む。
    pub fn from_process(
        known_keys: &std::collections::BTreeSet<String>,
    ) -> Result<Self, BackendError> {
        let mut values = std::collections::BTreeMap::new();
        for (k, v) in std::env::vars_os() {
            // Node版はUTF-8前提。非UTF-8は捨てる。
            if let (Some(k), Some(v)) = (k.into_string().ok(), v.into_string().ok())
                && !v.is_empty()
            {
                values.insert(k, v);
            }
        }
        Self::from_values(values, known_keys)
    }

    /// 明示した値から構築（テスト用）。空文字列は未設定として除く。
    pub fn from_values(
        mut values: std::collections::BTreeMap<String, String>,
        known_keys: &std::collections::BTreeSet<String>,
    ) -> Result<Self, BackendError> {
        values.retain(|_, v| !v.is_empty());

        let mut diagnostics = Vec::new();
        let disabling_words = ["0", "false", "no", "off"];
        let known_prefixes = ["CP_", "CHERRYPICK_"];

        for (name, value) in &values {
            if known_keys.contains(name) {
                // x-flagの検出は呼び出し側のスキーマ知識に依存。ここではプレフィックスのみ見る。
                if name.starts_with("CP_")
                    && disabling_words.contains(&value.to_lowercase().as_str())
                {
                    // どれがx-flagかは呼び出し側で再確認する。ここでは記録のみしない。
                }
            } else if known_prefixes.iter().any(|p| name.starts_with(p)) {
                diagnostics.push(Diagnostic {
                    level: DiagnosticLevel::Warning,
                    path: format!("${name}"),
                    message: "Unknown environment variable.".to_string(),
                });
            }
        }

        let validation_mode = ValidationMode::from_env_value(
            values
                .get("CHERRYPICK_CONFIG_VALIDATION")
                .map(String::as_str),
        )?;

        let node_env = match values.get("NODE_ENV").map(String::as_str) {
            Some("production") => NodeEnv::Production,
            Some("development") => NodeEnv::Development,
            Some("test") => NodeEnv::Test,
            _ => NodeEnv::Unset,
        };
        if let Some(v) = values.get("NODE_ENV")
            && !matches!(v.as_str(), "production" | "development" | "test")
        {
            diagnostics.push(Diagnostic {
                level: DiagnosticLevel::Error,
                path: "$NODE_ENV".to_string(),
                message: "must be one of production, development, test".to_string(),
            });
        }

        let flag = |name: &str| values.contains_key(name);

        let port_raw = values.get("PORT").cloned();
        let port = match port_raw.as_deref() {
            None => None,
            Some(raw) => match parse_port(raw) {
                Some(p) => Some(p),
                None => {
                    // Node版: parseInt→NaN→（mode=errorでは弾く、warnでは渡す→listen失敗）。
                    // Rust版: 数値として解釈できないPORTは診断を出し、未設定として扱う。
                    diagnostics.push(Diagnostic {
                        level: DiagnosticLevel::Error,
                        path: "$PORT".to_string(),
                        message: "must be an integer between 1 and 65535".to_string(),
                    });
                    None
                }
            },
        };

        let is_test = node_env == NodeEnv::Test;

        Ok(Self {
            options: EnvOption {
                only_queue: flag("CP_ONLY_QUEUE"),
                only_server: flag("CP_ONLY_SERVER"),
                no_daemons: flag("CP_NO_DAEMONS") || is_test,
                no_job_schedulers: flag("CP_NO_JOB_SCHEDULERS"),
                disable_clustering: flag("CP_DISABLE_CLUSTERING") || is_test,
                verbose: flag("CP_VERBOSE"),
                with_log_time: flag("CP_WITH_LOG_TIME"),
                quiet: flag("CP_QUIET") || is_test,
            },
            node_env,
            validation_mode,
            config_yml: values.get("CHERRYPICK_CONFIG_YML").cloned(),
            cherrypick_url: values.get("CHERRYPICK_URL").cloned(),
            port,
            port_raw,
            database_db: values.get("DATABASE_DB").cloned(),
            database_user: values.get("DATABASE_USER").cloned(),
            database_password: values.get("DATABASE_PASSWORD").cloned(),
            values,
            diagnostics,
        })
    }

    /// 空文字を除いた環境変数マップ（秘密を含みうる）。applyEnvに渡す。
    pub fn raw_values(&self) -> &std::collections::BTreeMap<String, String> {
        &self.values
    }

    /// 既知の環境変数か（生値にアクセスしない）。
    pub fn has(&self, name: &str) -> bool {
        self.values.contains_key(name)
    }

    /// `env_flag`相当。CP_*のx-flag用。
    pub fn flag(&self, name: &str) -> bool {
        env_flag_from_map(&self.values, name)
    }
}

fn env_flag_from_map(values: &std::collections::BTreeMap<String, String>, name: &str) -> bool {
    values.get(name).is_some_and(|v| !v.is_empty())
}

fn parse_port(raw: &str) -> Option<u16> {
    // Node版`/^\d+$/`→parseInt。Rust版は範囲チェックも行う。
    if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    raw.parse::<u16>().ok().filter(|p| *p >= 1)
}

/// プロセス全体の`env_flag`（外部から呼ぶ用）。
pub fn process_env_flag(name: &str) -> bool {
    env_flag(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn known() -> std::collections::BTreeSet<String> {
        [
            "NODE_ENV",
            "CHERRYPICK_CONFIG_VALIDATION",
            "CP_ONLY_SERVER",
            "CP_QUIET",
            "PORT",
            "CHERRYPICK_URL",
            "DATABASE_USER",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect()
    }

    fn vals(pairs: &[(&str, &str)]) -> std::collections::BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn validation_mode_parsing() {
        assert_eq!(
            ValidationMode::from_env_value(None).unwrap(),
            ValidationMode::Warn
        );
        assert_eq!(
            ValidationMode::from_env_value(Some("warn")).unwrap(),
            ValidationMode::Warn
        );
        assert_eq!(
            ValidationMode::from_env_value(Some("error")).unwrap(),
            ValidationMode::Error
        );
        assert_eq!(
            ValidationMode::from_env_value(Some("off")).unwrap(),
            ValidationMode::Off
        );
        assert!(ValidationMode::from_env_value(Some("nope")).is_err());
    }

    #[test]
    fn empty_strings_are_unset() {
        let env = Environment::from_values(
            vals(&[("CP_ONLY_SERVER", ""), ("NODE_ENV", "production")]),
            &known(),
        )
        .unwrap();
        assert!(!env.options.only_server);
        assert!(env.node_env.is_production());
    }

    #[test]
    fn cp_flags_any_non_empty() {
        let env = Environment::from_values(vals(&[("CP_ONLY_SERVER", "0")]), &known()).unwrap();
        assert!(env.options.only_server); // Node版x-flag: 0/falseでも有効
    }

    #[test]
    fn unknown_cp_and_cherrypick_warn() {
        let env = Environment::from_values(
            vals(&[
                ("CP_TOTALLY_UNKNOWN", "1"),
                ("CHERRYPICK_WAT", "x"),
                ("SOMETHING", "y"),
            ]),
            &known(),
        )
        .unwrap();
        let warns: Vec<_> = env
            .diagnostics
            .iter()
            .filter(|d| d.level == DiagnosticLevel::Warning)
            .collect();
        assert_eq!(warns.len(), 2);
    }

    #[test]
    fn port_parsing() {
        assert_eq!(parse_port("3000"), Some(3000));
        assert_eq!(parse_port("0"), None);
        assert_eq!(parse_port("70000"), None);
        assert_eq!(parse_port("abc"), None);
        assert_eq!(parse_port("-1"), None);
        assert_eq!(parse_port(""), None);
    }

    #[test]
    fn node_env_invalid_is_error_and_unset() {
        let env = Environment::from_values(vals(&[("NODE_ENV", "staging")]), &known()).unwrap();
        assert!(!env.node_env.is_production());
        assert!(
            env.diagnostics
                .iter()
                .any(|d| d.level == DiagnosticLevel::Error && d.path == "$NODE_ENV")
        );
    }
}
