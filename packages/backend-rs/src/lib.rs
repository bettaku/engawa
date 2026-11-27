/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! `engawa-backend`: CherryPick/EngawaバックエンドのRust実装。**RUST-05基盤**。
//!
//! - 最小サーバー（[`http`]）。`POST /api/ping`、`GET /healthz`。
//! - DB接続（[`db`]、SQLx/PostgreSQL、ADR-0003）。
//! - Redis接続（[`redis`]、redis-rs、ADR-0005）。
//! - 設定（[`config`]、ADR-0009）。
//! - 構造化ログ（[`logging`]、`tracing`）。
//! - 終了処理（[`shutdown`]、graceful shutdown）。
//!
//! 既存Node.js版と併存。混在期間の契約はTypeScript側を正とする（計画§4）。

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::panicking_overflow_checks
    )
)]

pub mod config;
pub mod db;
pub mod error;
pub mod http;
pub mod logging;
pub mod redis;
pub mod shutdown;

pub use error::{BackendError, Result};
