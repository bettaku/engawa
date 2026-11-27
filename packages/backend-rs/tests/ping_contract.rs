// SPDX-FileCopyrightText: syuilo and misskey-project
// SPDX-License-Identifier: AGPL-3.0-only

//! `api/ping` + `/healthz` のHTTP契約テスト（RUST-03/RUST-05、`http-errors.ts` / `HealthServerService` / `ping.ts`互換）。

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use engawa_backend::http::{AppState, app};
use engawa_backend::redis::{RedisAdapter, RedisConfig, RedisFamily};
use http_body_util::BodyExt;
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

async fn body_string(resp: axum::response::Response) -> String {
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
}

fn req(method: &str, uri: &str, body: Body, content_type: Option<&str>) -> Request<Body> {
    let mut b = Request::builder().method(method).uri(uri);
    if let Some(ct) = content_type {
        b = b.header(header::CONTENT_TYPE, ct);
    }
    b.body(body).unwrap()
}

// ---- POST /api/ping ----

#[tokio::test]
async fn post_ping_returns_pong_number() {
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
    assert_eq!(resp.status(), StatusCode::OK);
    let ct = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(ct.contains("application/json"), "content-type={ct}");
    assert!(ct.contains("charset=utf-8"), "content-type={ct}");
    // CORS
    assert_eq!(
        resp.headers().get("access-control-allow-origin").unwrap(),
        "*"
    );
    // Cache-Control
    assert_eq!(
        resp.headers().get(header::CACHE_CONTROL).unwrap(),
        "private, max-age=0, must-revalidate"
    );
    // trace id
    assert!(resp.headers().get("x-request-id").is_some());

    let s = body_string(resp).await;
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    let pong = v["pong"].as_i64().expect("pong number");
    assert!(pong > 0);
    // `Date.now()`相当。だいたい現在時刻。
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    assert!((now - pong).abs() < 60_000);
}

#[tokio::test]
async fn post_ping_empty_json_object_ok() {
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
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn post_ping_extra_params_allowed() {
    let app = build_app(true).await;
    let resp = app
        .oneshot(req(
            "POST",
            "/api/ping",
            Body::from(r#"{"i":"x","foo":1}"#),
            Some("application/json"),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK); // pingのparamDefはadditionalPropertiesを禁止しない
}

#[tokio::test]
async fn post_ping_invalid_json_is_400() {
    let app = build_app(true).await;
    let resp = app
        .oneshot(req(
            "POST",
            "/api/ping",
            Body::from("{not json"),
            Some("application/json"),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let s = body_string(resp).await;
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["error"]["code"], "INVALID_REQUEST");
    assert_eq!(v["error"]["kind"], "client");
    assert_eq!(v["error"]["id"], "e14897ec-106a-4c0e-a57b-d5fdc893ee6e");
    assert!(v["error"]["message"].is_string());
}

#[tokio::test]
async fn post_ping_no_body_is_400_invalid_param() {
    let app = build_app(true).await;
    let resp = app
        .oneshot(req("POST", "/api/ping", Body::empty(), None))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let s = body_string(resp).await;
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["error"]["code"], "INVALID_PARAM");
    assert_eq!(v["error"]["id"], "3d81ceae-475f-4600-b2a8-2bc116157532");
    assert_eq!(v["error"]["info"]["param"], "#/type");
}

#[tokio::test]
async fn post_ping_json_ct_empty_body_is_400_invalid_request() {
    let app = build_app(true).await;
    let resp = app
        .oneshot(req(
            "POST",
            "/api/ping",
            Body::empty(),
            Some("application/json"),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let s = body_string(resp).await;
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["error"]["code"], "INVALID_REQUEST");
}

// ---- GET /api/ping → 405 ----

#[tokio::test]
async fn get_ping_is_405_method_not_allowed() {
    let app = build_app(true).await;
    let resp = app
        .oneshot(req("GET", "/api/ping", Body::empty(), None))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);
    let s = body_string(resp).await;
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["error"]["code"], "METHOD_NOT_ALLOWED");
    assert_eq!(v["error"]["id"], "a85548f6-1eff-414c-888a-912c6bccd6a2");
    assert_eq!(v["error"]["kind"], "client");
}

#[tokio::test]
async fn put_ping_is_405() {
    let app = build_app(true).await;
    let resp = app
        .oneshot(req(
            "PUT",
            "/api/ping",
            Body::from("{}"),
            Some("application/json"),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);
}

// ---- unknown api ----

#[tokio::test]
async fn unknown_api_endpoint_is_404() {
    let app = build_app(true).await;
    let resp = app
        .oneshot(req(
            "POST",
            "/api/this-does-not-exist",
            Body::from("{}"),
            Some("application/json"),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    let s = body_string(resp).await;
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["error"]["code"], "UNKNOWN_API_ENDPOINT");
    assert_eq!(v["error"]["id"], "2ca3b769-540a-4f08-9dd5-b5a825b6d0f1");
}

// ---- /healthz ----

#[tokio::test]
async fn healthz_503_when_not_ready_or_deps_down() {
    let app = build_app(false).await; // ready=false かつ DB/Redis到達不可
    let resp = app
        .oneshot(req("GET", "/healthz", Body::empty(), None))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        resp.headers().get(header::CACHE_CONTROL).unwrap(),
        "no-store"
    );
}

#[tokio::test]
async fn healthz_503_when_ready_but_deps_down() {
    let app = build_app(true).await; // ready=true だが DB/Redis到達不可
    let resp = app
        .oneshot(req("GET", "/healthz", Body::empty(), None))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
}
