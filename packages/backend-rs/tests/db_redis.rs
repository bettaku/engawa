// SPDX-FileCopyrightText: syuilo and misskey-project
// SPDX-License-Identifier: AGPL-3.0-only

//! PostgreSQL / Redis の結合試験。`ENGAWA_TEST_DATABASE_URL` / `ENGAWA_TEST_REDIS_URL` が設定されているときだけ実行。
//!
//! ローカル例（`packages/backend/test/compose.yml`を`up`した状態）:
//! ```sh
//! ENGAWA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54312/test-cherrypick \
//! ENGAWA_TEST_REDIS_URL=127.0.0.1:56312 \
//!   cargo test --test db_redis
//! ```

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use engawa_backend::config::{DbConfig, DbSsl};
use engawa_backend::db::{self};
use engawa_backend::redis::{RedisAdapter, RedisConfig, RedisFamily};

fn db_config_from_url(url: &str) -> DbConfig {
    // `postgres://user:pass@host:port/db`
    let u = url::Url::parse(url).expect("url");
    DbConfig {
        host: u.host_str().unwrap_or("127.0.0.1").to_string(),
        port: u.port().unwrap_or(5432),
        database: u.path().trim_start_matches('/').to_string(),
        username: u.username().to_string(),
        password: u.password().unwrap_or("").to_string(),
        statement_timeout_ms: 10_000,
        max_connections: 3,
        ssl: DbSsl::Disabled,
        application_name: Some("engawa-backend-test".into()),
        disable_cache: true,
    }
}

#[tokio::test]
async fn postgres_select_1() {
    let Ok(url) = std::env::var("ENGAWA_TEST_DATABASE_URL") else {
        eprintln!("skipping: ENGAWA_TEST_DATABASE_URL not set");
        return;
    };
    let pool = db::connect_pool(&db_config_from_url(&url)).await.unwrap();
    db::ping(&pool).await.expect("SELECT 1");
    // statement_timeoutが設定されているか（10秒=10000）。
    let timeout: String = sqlx::query_scalar("SHOW statement_timeout")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(timeout, "10s");
    // pool max connections explicit
    assert_eq!(pool.options().get_max_connections(), 3);
    db::close(&pool).await;
}

#[tokio::test]
async fn redis_ping_and_key_prefix() {
    let Ok(addr) = std::env::var("ENGAWA_TEST_REDIS_URL") else {
        eprintln!("skipping: ENGAWA_TEST_REDIS_URL not set");
        return;
    };
    let (host, port) = match addr.split_once(':') {
        Some((h, p)) => (h.to_string(), p.parse().unwrap()),
        None => (addr.clone(), 6379),
    };
    let key_prefix = "engawa-rs-test:".to_string();
    let cfg = RedisConfig {
        host,
        port,
        path: None,
        username: None,
        password: None,
        db: 0,
        prefix: None,
        key_prefix: key_prefix.clone(),
        tls: None,
        family: RedisFamily::Dual,
        connect_timeout: None,
        command_timeout: None,
        max_retries_per_request: None,
    };
    let adapter = RedisAdapter::connect(&cfg).await.unwrap();
    adapter.ping().await.expect("PING");

    // keyPrefix: adapterが付ける。ioredisと同じキーになることを、prefix付きキーで読み書きして確かめる。
    let logical = "k";
    let physical = format!("{}{logical}", adapter.key_prefix());
    assert_eq!(physical, format!("{key_prefix}{logical}"));
    {
        let mut conn = adapter.connection();
        redis::cmd("SET")
            .arg(&physical)
            .arg("v")
            .exec_async(&mut conn)
            .await
            .unwrap();
        let got: String = redis::cmd("GET")
            .arg(&physical)
            .query_async::<String>(&mut conn)
            .await
            .unwrap();
        assert_eq!(got, "v");
        redis::cmd("DEL")
            .arg(&physical)
            .exec_async(&mut conn)
            .await
            .unwrap();
    }
    adapter.shutdown().await;
}
