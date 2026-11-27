/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! ID生成方式（`config.id`）。`packages/backend/src/core/IdService.ts` の `method` と同じ。
//! RUST-05は設定の**意味を保持**するだけで、IDの生成・parseはここでは実装しない（計画§4.2、RUST-06以降）。
//! 既存IDの再発行や、方式を変える意味は変えない。未知の値は起動時に弾く。

use crate::error::BackendError;

/// `id`設定。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdMethod {
    /// `aid`。ミリ秒精度。
    Aid,
    /// `aidx`。ミリ秒精度（既定）。
    Aidx,
    /// `meid`。ObjectID風。
    Meid,
    /// `meidg`。`meid`のg... 互換。
    Meidg,
    /// `ulid`。
    Ulid,
    /// `objectid`。後方互換。
    Objectid,
}

impl IdMethod {
    /// 大文字・小文字を無視してparse。`prepare`で小文字化されるが、念のため再度小文字化。未知は[`BackendError::UnknownIdMethod`]。
    pub fn parse(raw: &str) -> Result<Self, BackendError> {
        match raw.to_lowercase().as_str() {
            "aid" => Ok(Self::Aid),
            "aidx" => Ok(Self::Aidx),
            "meid" => Ok(Self::Meid),
            "meidg" => Ok(Self::Meidg),
            "ulid" => Ok(Self::Ulid),
            "objectid" => Ok(Self::Objectid),
            _ => Err(BackendError::UnknownIdMethod(raw.to_string())),
        }
    }

    /// 正規名。
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Aid => "aid",
            Self::Aidx => "aidx",
            Self::Meid => "meid",
            Self::Meidg => "meidg",
            Self::Ulid => "ulid",
            Self::Objectid => "objectid",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_case_insensitive() {
        assert_eq!(IdMethod::parse("aidx").unwrap(), IdMethod::Aidx);
        assert_eq!(IdMethod::parse("AIDX").unwrap(), IdMethod::Aidx);
        assert_eq!(IdMethod::parse("meidg").unwrap(), IdMethod::Meidg);
        assert!(IdMethod::parse("snowflake").is_err()); // 現行にない方式
    }
}
