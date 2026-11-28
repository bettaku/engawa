/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! 設定ファイルのパス解決。Node.js版 `config/parse.ts` の`configPath()`の意味を保つ。
//!
//! - `CHERRYPICK_CONFIG_YML`: 設定ファイル。**`.config/`相対**（既定`default.yml`、NODE_ENV=testなら`test.yml`）。絶対パスも可。
//! - `.config/`ディレクトリは、カレントディレクトリから上へ辿って探す（Node版はパッケージ位置からリポジトリの`.config`を指す）。
//! - 空文字の`CHERRYPICK_CONFIG_YML`は未設定扱い。

use std::path::{Component, Path, PathBuf};

use crate::error::BackendError;
use crate::logging::NodeEnv;

/// `.config`ディレクトリ名。
pub const CONFIG_DIR_NAME: &str = ".config";

/// 既定の設定ファイル名。
pub const DEFAULT_CONFIG_FILE: &str = "default.yml";

/// `test`の設定ファイル名。
pub const TEST_CONFIG_FILE: &str = "test.yml";

/// `.config/`ディレクトリを探す。見つからなければ`<cwd>/.config`を返す（呼び出し側で存在確認）。
pub fn discover_config_dir(cwd: &Path) -> PathBuf {
    for ancestor in cwd.ancestors() {
        let candidate = ancestor.join(CONFIG_DIR_NAME);
        if candidate.is_dir() {
            return candidate;
        }
    }
    cwd.join(CONFIG_DIR_NAME)
}

/// 設定ファイルのパスを解決する。
///
/// `config_yml`が`Some`で空でなければそれを使う。絶対パスならそのまま、相対なら`<config_dir>/`配下に解決する。
pub fn resolve_config_path(
    config_yml: Option<&str>,
    node_env: NodeEnv,
    cwd: &Path,
) -> Result<PathBuf, BackendError> {
    let config_dir = discover_config_dir(cwd);

    let raw = match config_yml {
        Some(v) if !v.is_empty() => v,
        _ => node_env.default_config_file(),
    };

    let raw_path = Path::new(raw);
    let path = if raw_path.is_absolute() {
        raw_path.to_path_buf()
    } else {
        // `resolve(configDir, raw)`相当。`..`等は正規化する。
        normalize(&config_dir.join(raw_path))
    };

    Ok(path)
}

/// `.`/`..`を字句的に正規化する（ファイルシステムに触れない）。
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_file_by_node_env() {
        assert_eq!(NodeEnv::Unset.default_config_file(), DEFAULT_CONFIG_FILE);
        assert_eq!(
            NodeEnv::Production.default_config_file(),
            DEFAULT_CONFIG_FILE
        );
        assert_eq!(NodeEnv::Test.default_config_file(), TEST_CONFIG_FILE);
    }

    #[test]
    fn absolute_cherrypick_config_yml_used_as_is() {
        let cwd = std::env::temp_dir();
        let p = resolve_config_path(Some("/etc/engawa/my.yml"), NodeEnv::Unset, &cwd).unwrap();
        assert_eq!(p, PathBuf::from("/etc/engawa/my.yml"));
    }

    #[test]
    fn empty_cherrypick_config_yml_is_unset() {
        let cwd = std::env::temp_dir();
        let p = resolve_config_path(Some(""), NodeEnv::Unset, &cwd).unwrap();
        assert!(p.ends_with(CONFIG_DIR_NAME.to_owned() + "/" + DEFAULT_CONFIG_FILE));
    }
}
