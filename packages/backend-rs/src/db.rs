/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! PostgreSQLアクセス（ADR-0003）。SQLx + `PgPool`。
//!
//! - **DDLはしない。** マイグレーションは既存のTypeORMマイグレーションが唯一の管理元（計画§6）。`sqlx::migrate!`は使わない。スキーマ同期しない。
//! - 行型はSQLごとに定義し、公開API型と分ける。行型に`Serialize`を導出しない（ADR-0003 #3）。
//! - 接続プール上限は明示する。Node.js版との**合計**で管理するのは運用側（計画§6）。
//! - `statement_timeout`は既定10秒、`db.extra.statement_timeout`で上書き（`packages/backend/src/postgres.ts`と同じ）。
//! - RUST-05のヘルスチェックは`SELECT 1`のみ。`SELECT 1`はスキーマ非依存のため、ここだけ実行時クエリを使う。
//!   スキーマに触るSQLは、コンパイル時に検査する書き方を既定にする（ADR-0003 #4、RUST-06で`.sqlx`オフライン情報を作る）。

use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, PgPool};

use crate::config::DbConfig;
use crate::error::BackendError;

/// 既定の`statement_timeout`（ミリ秒）。`packages/backend/src/postgres.ts`の`extra.statement_timeout`既定10秒と同じ。
pub const DEFAULT_STATEMENT_TIMEOUT_MS: u64 = 1000 * 10;

/// 既定のプール上限。node-postgresの`Pool`既定10と同じ。**既定に頼らず明示**する（ADR-0003 #6）。
pub const DEFAULT_MAX_CONNECTIONS: u32 = 10;

/// 接続確立の既定タイムアウト。
pub const DEFAULT_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(10);

/// PostgreSQLプールを作る。**`connect_lazy_with`で起動をDB到達に依存させない**（計画§9のreadiness/liveness分離・依存停止試験）。
/// 実際の接続は最初のクエリ（または起動時プローブ）で確立する。以降の切断はプールが自動再接続する。
/// 設定そのものが不正なら`Err`。
pub async fn connect_pool(config: &DbConfig) -> Result<PgPool, BackendError> {
    let mut connect_options = PgConnectOptions::new()
        .host(&config.host)
        .port(config.port)
        .database(&config.database)
        .username(&config.username)
        .password(&config.password)
        .ssl_mode(config.ssl_mode())
        .application_name(
            config
                .application_name
                .as_deref()
                .unwrap_or("engawa-backend"),
        )
        // ログにSQLパラメータを出さない。`logging.sql.enableQueryParamLogging`相当はRUST-05では実装しない（未対応として報告）。
        .disable_statement_logging();

    // `db.extra.ssl`のカスタム証明書。`ssl_root_cert`はファイルパス。RUST-05では`ca`文字列等は未対応（起動時に報告済み）。
    // `PgSslMode`は上で設定済み。

    if config.statement_timeout_ms > 0 {
        // 接続ごとに`SET statement_timeout`。`postgres.ts`の`extra.statement_timeout`と同じ意味。
        connect_options = connect_options
            .options([("statement_timeout", config.statement_timeout_ms.to_string())]);
    }

    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(0)
        .acquire_timeout(DEFAULT_ACQUIRE_TIMEOUT)
        .test_before_acquire(true)
        .connect_lazy_with(connect_options);

    Ok(pool)
}

/// `SELECT 1`。ヘルスチェック・再接続確認。
pub async fn ping(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1").execute(pool).await.map(|_| ())
}

/// プールを閉じる。終了処理で待機中のクエリ完了後に呼ぶ。
pub async fn close(pool: &PgPool) {
    pool.close().await;
}
