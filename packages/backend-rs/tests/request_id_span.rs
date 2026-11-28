// SPDX-FileCopyrightText: syuilo and misskey-project
// SPDX-License-Identifier: AGPL-3.0-only

//! リクエストIDが、ログのスパンと応答のヘッダーで一致することの確認。
//!
//! tracingのcallsiteの有効/無効は、プロセス内の他のテストの影響を受けるため、専用のテストファイルに分ける。

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use axum::body::Body;
use axum::http::Request;
use engawa_backend::http::{AppState, app};
use engawa_backend::redis::{RedisAdapter, RedisConfig, RedisFamily};
use sqlx::postgres::PgConnectOptions;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tower::ServiceExt;

fn dummy_redis_config() -> RedisConfig {
    RedisConfig {
        host: "127.0.0.1".into(),
        port: 1, // 到達しない。lazyなので接続は起こらない。
        path: None,
        username: None,
        password: None,
        db: 0,
        prefix: None,
        key_prefix: "test:".into(),
        tls: None,
        family: RedisFamily::Dual,
        connect_timeout: None,
        command_timeout: None,
        max_retries_per_request: None,
    }
}

fn dummy_db_pool() -> PgPool {
    PgPoolOptions::new().max_connections(1).connect_lazy_with(
        PgConnectOptions::new()
            .host("127.0.0.1")
            .port(1)
            .database("none")
            .username("none"),
    )
}

async fn build_app(ready: bool) -> axum::Router {
    let redis = RedisAdapter::connect(&dummy_redis_config())
        .await
        .expect("lazy redis");
    app(AppState {
        db: dummy_db_pool(),
        redis,
        ready: Arc::new(AtomicBool::new(ready)),
    })
}

fn req(method: &str, uri: &str, body: Body, content_type: Option<&str>) -> Request<Body> {
    let mut b = Request::builder().method(method).uri(uri);
    if let Some(ct) = content_type {
        b = b.header("content-type", ct);
    }
    b.body(body).unwrap()
}

#[tokio::test]
async fn request_id_is_in_span_and_matches_response_header() {
    use std::sync::{Arc, Mutex};
    use tracing_subscriber::Layer as _;
    use tracing_subscriber::layer::SubscriberExt;

    #[derive(Clone, Default)]
    struct Captured(Arc<Mutex<Vec<String>>>);
    struct Visitor<'a>(&'a mut Option<String>);
    impl tracing::field::Visit for Visitor<'_> {
        fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
            if field.name() == "trace_id" {
                *self.0 = Some(format!("{value:?}"));
            }
        }
    }
    impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for Captured {
        fn on_new_span(
            &self,
            attrs: &tracing::span::Attributes<'_>,
            _id: &tracing::span::Id,
            _ctx: tracing_subscriber::layer::Context<'_, S>,
        ) {
            let mut found = None;
            attrs.record(&mut Visitor(&mut found));
            if let Some(v) = found {
                self.0.lock().unwrap().push(v);
            }
        }
    }

    let captured = Captured::default();
    // 通常設定（`CP_VERBOSE`なし）と同じ`info`フィルターを通ったスパンだけを集める。
    let subscriber = tracing_subscriber::registry().with(
        captured
            .clone()
            .with_filter(tracing_subscriber::EnvFilter::new("info")),
    );
    let _guard = tracing::subscriber::set_default(subscriber);

    let app = build_app(true).await;
    let resp = app
        .oneshot(req(
            "POST",
            "/api/ping",
            Body::from("{}"),
            Some("application/json"),
        ))
        .await
        .unwrap();
    let header_id = resp
        .headers()
        .get("x-request-id")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(!header_id.is_empty());
    let ids = captured.0.lock().unwrap().clone();
    assert!(
        ids.contains(&header_id),
        "span ids {ids:?} vs header {header_id}"
    );
}

/// 通常設定の実際のJSONログで、リクエスト処理中のログの`trace_id`が、応答の`x-request-id`と一致する。
#[tokio::test]
async fn json_log_during_request_has_trace_id_matching_response_header() {
    use std::io::Write;
    use std::sync::{Arc, Mutex};

    use engawa_backend::logging::{LoggingOptions, NodeEnv, build_subscriber_with_writer};

    #[derive(Clone, Default)]
    struct Buf(Arc<Mutex<Vec<u8>>>);
    impl Write for Buf {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    let buf = Buf::default();
    let writer = buf.clone();
    // 通常設定: quietでもverboseでもない。
    let options = LoggingOptions {
        quiet: false,
        verbose: false,
        with_log_time: false,
        node_env: NodeEnv::Unset,
    };
    let subscriber = build_subscriber_with_writer(&options, move || writer.clone());
    let _guard = tracing::subscriber::set_default(subscriber);

    // readyでないアプリの`/healthz`は、処理中にinfo以上のログを出す。
    let app = build_app(false).await;
    let resp = app
        .oneshot(req("GET", "/healthz", Body::empty(), None))
        .await
        .unwrap();
    let header_id = resp
        .headers()
        .get("x-request-id")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();

    let out = String::from_utf8(buf.0.lock().unwrap().clone()).unwrap();
    let line = out
        .lines()
        .map(|l| serde_json::from_str::<serde_json::Value>(l).unwrap())
        .find(|v| v["fields"]["message"] == "healthz reports not ready")
        .unwrap_or_else(|| panic!("no log line during the request: {out}"));
    assert_eq!(line["span"]["trace_id"], header_id.as_str(), "{line}");
    // クエリ文字列を含まず、パスだけを持つ。
    assert_eq!(line["span"]["path"], "/healthz");
}
