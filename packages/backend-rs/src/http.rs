/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! HTTPサーバー（ADR-0002）。Axum + Tower。
//!
//! **RUST-05の最小サーバー。** 既存のHTTP・SDK契約を壊さないように、共通処理をTowerレイヤーで作る。
//! - `POST /api/ping` → `{"pong": <epoch ms>}`（`packages/backend/src/server/api/endpoints/ping.ts`互換）。
//! - `GET /api/ping` → 405 + `{ error: { ... METHOD_NOT_ALLOWED } }`（pingは`allowGet`未設定。Node版と同じ）。
//! - `GET /healthz` → readiness。**DB `SELECT 1` + Redis `PING` + ready** → 200 / 503。`Cache-Control: no-store`（`HealthServerService`互換）。
//! - 未知の`/api/*` → 404 `UNKNOWN_API_ENDPOINT`。`/api`以下の非2xxは`{ error: { message, code, id, kind } }`（`http-errors.ts`互換）。
//! - CORS `origin: '*'`（`@fastify/cors`）。`/api`は`Cache-Control: private, max-age=0, must-revalidate`。
//! - `x-request-id`でtrace IDを付け、応答に返す。**機密をログに出さない。**
//!
//! このサーバーは単体のRust版。混在期間は**未知のルートはNode.js版へ送る**（計画§9）。ここでは404。

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;

use crate::logging::TRACE_ID_HEADER;
use crate::redis::RedisAdapter;

/// アプリ共有状態。
#[derive(Clone)]
pub struct AppState {
    /// PostgreSQLプール。
    pub db: PgPool,
    /// Redis（キャッシュ・汎用）adapter。
    pub redis: RedisAdapter,
    /// readiness。起動完了で`true`、終了開始で`false`。
    pub ready: Arc<AtomicBool>,
}

/// `application/json; charset=utf-8`（Node Fastifyと同じ）。
const JSON_CONTENT_TYPE: &str = "application/json; charset=utf-8";

/// `/api`のキャッシュ制御（`ApiServerService`と同じ）。
const API_CACHE_CONTROL: &str = "private, max-age=0, must-revalidate";

/// `http-errors.ts`の定義を再現。
pub mod api_errors {
    /// `(message, code, id, kind, http_status)`。
    pub type ApiErrorDef = (&'static str, &'static str, &'static str, &'static str, u16);

    /// `UNKNOWN_API_ENDPOINT`.
    pub const UNKNOWN_API_ENDPOINT: ApiErrorDef = (
        "Unknown API endpoint.",
        "UNKNOWN_API_ENDPOINT",
        "2ca3b769-540a-4f08-9dd5-b5a825b6d0f1",
        "client",
        404,
    );
    /// `METHOD_NOT_ALLOWED`.
    pub const METHOD_NOT_ALLOWED: ApiErrorDef = (
        "This endpoint does not accept the request method.",
        "METHOD_NOT_ALLOWED",
        "a85548f6-1eff-414c-888a-912c6bccd6a2",
        "client",
        405,
    );
    /// `INVALID_REQUEST`.
    pub const INVALID_REQUEST: ApiErrorDef = (
        "Invalid request.",
        "INVALID_REQUEST",
        "e14897ec-106a-4c0e-a57b-d5fdc893ee6e",
        "client",
        400,
    );
    /// `UNSUPPORTED_MEDIA_TYPE`.
    pub const UNSUPPORTED_MEDIA_TYPE: ApiErrorDef = (
        "Unsupported content type.",
        "UNSUPPORTED_MEDIA_TYPE",
        "5b2b8fff-de7b-4d11-b63d-d933de7f2481",
        "client",
        415,
    );
    /// `PAYLOAD_TOO_LARGE`.
    pub const PAYLOAD_TOO_LARGE: ApiErrorDef = (
        "The request body is too large.",
        "PAYLOAD_TOO_LARGE",
        "bfc3cfcc-5722-4709-83dd-03d90212e72a",
        "client",
        413,
    );
    /// `INTERNAL_ERROR`.
    pub const INTERNAL_ERROR: ApiErrorDef = (
        "Internal error occurred. Please contact us if the error persists.",
        "INTERNAL_ERROR",
        "5d37dbcb-891e-41ca-a3d6-e690c97775ac",
        "server",
        500,
    );
}

/// `errorBody(err)`。
pub fn error_body(def: api_errors::ApiErrorDef) -> Value {
    json!({
        "error": {
            "message": def.0,
            "code": def.1,
            "id": def.2,
            "kind": def.3,
        }
    })
}

/// JSONレスポンスを`application/json; charset=utf-8`で。
fn json_response(status: StatusCode, body: Value) -> Response {
    let mut resp = (status, body.to_string()).into_response();
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(JSON_CONTENT_TYPE),
    );
    resp
}

/// AxumのRouterを作る。`state`は共有。
pub fn app(state: AppState) -> Router {
    let api = Router::new()
        .route(
            "/ping",
            // Node版は`fastify.all`で、GETだけを405にする（`allowGet`なし）。PUT・PATCH・DELETEも本体を処理する。
            post(api_ping)
                .put(api_ping)
                .patch(api_ping)
                .delete(api_ping)
                .get(api_ping_get)
                .fallback(api_method_not_allowed),
        )
        .fallback(api_unknown_endpoint)
        .layer(axum::middleware::from_fn(api_cache_control));

    Router::new()
        .nest("/api", api)
        .route("/healthz", get(healthz))
        .with_state(state)
        // Towerレイヤー（ADR-0002）。`.layer`は後に足したものほど外側。
        // 内側から: Trace → PropagateRequestId → SetRequestId。リクエストIDを先に付け（SetRequestId）、
        // スパンに同じIDを記録し（Trace）、応答に返す（Propagate）。
        .layer(TraceLayer::new_for_http().make_span_with(|req: &Request| {
            // クエリ文字列（`?i=<token>`など）をログに残さない。パスだけを記録する。
            let trace_id = req
                .headers()
                .get(TRACE_ID_HEADER)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            tracing::debug_span!(
                "request",
                method = %req.method(),
                path = %req.uri().path(),
                trace_id = %trace_id,
            )
        }))
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(CorsLayer::permissive())
        .layer(tower_http::timeout::TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            std::time::Duration::from_secs(30),
        ))
        .layer(tower_http::catch_panic::CatchPanicLayer::new())
}

/// `/api`の`Cache-Control`。`/api`以下だけに付ける。
async fn api_cache_control(req: Request, next: Next) -> Response {
    let mut resp = next.run(req).await;
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(API_CACHE_CONTROL),
    );
    resp
}

/// `POST /api/ping`. `ping.ts`の`paramDef={type:"object",properties:{},required:[]}` + `additionalProperties`非禁止。
/// - bodyは**JSONオブジェクト**（`{}`で十分。余分なプロパティは許す）。`request.body`がobjectでない→`400 INVALID_PARAM`（Node `#/type must be object`）。
/// - `Content-Type: application/json`でbody空→`400 INVALID_REQUEST`; invalid JSON→`400 INVALID_REQUEST`（Node Fastify `FST_ERR_CTP_EMPTY_JSON_BODY`/`FST_ERR_CTP_INVALID_JSON_BODY`）。
/// - `ping`に`allowGet`は無い→GET→405。**`fastify.all`**: POST/PUT/PATCH/DELETE + object body→pong。
async fn api_ping(State(_state): State<AppState>, req: Request) -> Response {
    let (parts, body) = req.into_parts();
    let bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => {
            return json_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                error_body(api_errors::PAYLOAD_TOO_LARGE),
            );
        }
    };
    let trimmed = trim_ascii(&bytes);
    let content_type = parts
        .headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let is_json_ct = content_type
        .split(';')
        .next()
        .map(|s| s.trim().eq_ignore_ascii_case("application/json") || s.trim().ends_with("+json"))
        .unwrap_or(false);

    // 値（bodyが無ければ null）。
    // JSON以外のContent-Typeは本文を読まない（Node Fastifyと同じ。`text/plain`の`{}`もオブジェクトとは扱わない）。
    let body_value: Option<Value> = if trimmed.is_empty() || !is_json_ct {
        None
    } else {
        match serde_json::from_slice::<Value>(trimmed) {
            Ok(v) => Some(v),
            // invalid JSON（JSON Content-Typeのときだけここに来る）→INVALID_REQUEST。
            Err(_) => {
                return json_response(
                    StatusCode::BAD_REQUEST,
                    error_body(api_errors::INVALID_REQUEST),
                );
            }
        }
    };

    // `application/json`でbodyが空→Node Fastify FST_ERR_CTP_EMPTY_JSON_BODY→INVALID_REQUEST。
    if is_json_ct && trimmed.is_empty() {
        return json_response(
            StatusCode::BAD_REQUEST,
            error_body(api_errors::INVALID_REQUEST),
        );
    }

    // `paramDef.type=object`。`request.body`がobjectでない（null/無し/[]/scalar）→INVALID_PARAM `#/type must be object`.
    if !matches!(body_value, Some(Value::Object(_))) {
        return invalid_param("#/type", "must be object");
    }

    let pong = epoch_millis();
    json_response(StatusCode::OK, json!({ "pong": pong }))
}

/// `400 INVALID_PARAM`. `info`。`WWW-Authenticate`（`http-errors.ts` + `ApiCallService`）。
fn invalid_param(param: &str, reason: &str) -> Response {
    let body = json!({
        "error": {
            "message": "Invalid param.",
            "code": "INVALID_PARAM",
            "id": "3d81ceae-475f-4600-b2a8-2bc116157532",
            "kind": "client",
            "info": { "param": param, "reason": reason },
        }
    });
    let mut resp = json_response(StatusCode::BAD_REQUEST, body);
    let header_value = HeaderValue::from_str(
        "Bearer realm=\"Engawa\", error=\"invalid_request\", error_description=\"Invalid param.\"",
    )
    .unwrap_or(HeaderValue::from_static("Bearer realm=\"Engawa\""));
    resp.headers_mut()
        .insert(header::WWW_AUTHENTICATE, header_value);
    resp
}

/// `GET /api/ping` → 405。
async fn api_ping_get() -> Response {
    json_response(
        StatusCode::METHOD_NOT_ALLOWED,
        error_body(api_errors::METHOD_NOT_ALLOWED),
    )
}

/// `/api/ping`の他メソッド → 405。
async fn api_method_not_allowed() -> Response {
    json_response(
        StatusCode::METHOD_NOT_ALLOWED,
        error_body(api_errors::METHOD_NOT_ALLOWED),
    )
}

/// 未知の`/api/*` → 404 `UNKNOWN_API_ENDPOINT`.
async fn api_unknown_endpoint() -> Response {
    json_response(
        StatusCode::NOT_FOUND,
        error_body(api_errors::UNKNOWN_API_ENDPOINT),
    )
}

/// readiness。`ready` + `SELECT 1` + `PING`. **依存チェックは短いtimeoutで**。依存停止でも503を速く返す。livenessは`/healthz`以外の別管理。
async fn healthz(State(state): State<AppState>) -> Response {
    let ready = state.ready.load(Ordering::Acquire);
    let db_ok = tokio::time::timeout(HEALTH_CHECK_TIMEOUT, crate::db::ping(&state.db))
        .await
        .ok()
        .and_then(std::result::Result::ok)
        .is_some();
    let redis_ok = tokio::time::timeout(HEALTH_CHECK_TIMEOUT, state.redis.ping())
        .await
        .ok()
        .and_then(std::result::Result::ok)
        .is_some();
    let ok = ready && db_ok && redis_ok;
    let status = if ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let mut resp = status.into_response();
    resp.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    resp
}

/// ヘルスチェックの依存確認timeout。
pub const HEALTH_CHECK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// `Date.now()`. Node `pong: Date.now()`. ミリ秒整数。
pub fn epoch_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn trim_ascii(b: &[u8]) -> &[u8] {
    let mut start = 0;
    let mut end = b.len();
    while start < end && b[start].is_ascii_whitespace() {
        start += 1;
    }
    while end > start && b[end - 1].is_ascii_whitespace() {
        end -= 1;
    }
    &b[start..end]
}

/// `TRACE_ID_HEADER`の再エクスポート。
pub const TRACE_ID_HEADER_NAME: &str = TRACE_ID_HEADER;

/// `Method`の再エクスポート（テスト用）。
pub type HttpMethod = Method;

/// `Bytes`の再エクスポート。
pub type BodyBytes = Bytes;
