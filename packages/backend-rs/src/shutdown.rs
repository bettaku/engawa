/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! 終了処理（計画§1「終了処理」、§9、ADR-0001）。
//!
//! - **SIGTERM**（と**SIGINT/Ctrl-C**）を受けて**graceful shutdown**する。
//! - まず**新規受付を止め**、**処理中のリクエストを待つ**。待機時間の上限は`ENGAWA_SHUTDOWN_TIMEOUT_MS`（既定30000ms）。
//! - **readinessを先に落とす**（`/healthz`が503になる）。livenessは落とさない（プロセスは動作中）。
//! - 待機後、**DBプールを閉じ**、**Redisを`QUIT`してdrop**する。
//! - `CP_*`終了関連はNode版がクラスタ管理。Rust版は**シングルプロセス**（`CP_DISABLE_CLUSTERING`no-op）。
//! - `pidFile`は終了時に消す。

use std::time::Duration;

/// 待機時間の上限の環境変数。
pub const SHUTDOWN_TIMEOUT_ENV: &str = "ENGAWA_SHUTDOWN_TIMEOUT_MS";

/// 既定の待機上限。
pub const DEFAULT_SHUTDOWN_TIMEOUT: Duration = Duration::from_millis(30_000);

/// 環境から待機上限を読む。不正値は既定。
pub fn shutdown_timeout() -> Duration {
    std::env::var(SHUTDOWN_TIMEOUT_ENV)
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .map(Duration::from_millis)
        .unwrap_or(DEFAULT_SHUTDOWN_TIMEOUT)
}

/// SIGTERM / SIGINT のいずれかを待つ。返り値はシグナル名。
pub async fn shutdown_signal() -> &'static str {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut sigterm = match signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(_) => {
                // シグナル登録に失敗しても、Ctrl-Cでは止める。
                let _ = tokio::signal::ctrl_c().await;
                return "SIGINT";
            }
        };
        let mut sigint = match signal(SignalKind::interrupt()) {
            Ok(s) => s,
            Err(_) => return sigterm.recv().await.map(|_| "SIGTERM").unwrap_or("SIGTERM"),
        };
        tokio::select! {
            _ = sigterm.recv() => "SIGTERM",
            _ = sigint.recv() => "SIGINT",
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
        "SIGINT"
    }
}
