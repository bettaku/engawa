// SPDX-FileCopyrightText: syuilo and misskey-project
// SPDX-License-Identifier: AGPL-3.0-only

//! 終了処理のテスト。graceful shutdownのdrainは`tests/ping_contract`+実機確認、ここでは設定解析と`axum::serve`のgraceful連携を確認。

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::Router;
use axum::routing::get;
use engawa_backend::shutdown::{SHUTDOWN_TIMEOUT_ENV, shutdown_timeout};

#[test]
fn shutdown_timeout_default() {
    // 環境変数が無いとき既定30s。（環境を汚さないよう、このテストはsetしない。）
    let t = shutdown_timeout();
    assert!(t.as_millis() >= 1);
}

#[test]
fn shutdown_timeout_env_name_stable() {
    assert_eq!(SHUTDOWN_TIMEOUT_ENV, "ENGAWA_SHUTDOWN_TIMEOUT_MS");
}

#[tokio::test]
async fn axum_graceful_shutdown_drains_in_flight() {
    use tokio::sync::Notify;

    let started = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let (started_h, release_h) = (started.clone(), release.clone());
    let app = Router::new().route(
        "/",
        get(move || {
            let (started, release) = (started_h.clone(), release_h.clone());
            async move {
                started.notify_one();
                release.notified().await;
                "ok"
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let ready = Arc::new(AtomicBool::new(true));
    let ready2 = ready.clone();

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    let serve = axum::serve(listener, app.into_make_service()).with_graceful_shutdown(async move {
        let _ = rx.await;
        ready2.store(false, Ordering::Release);
    });

    let mut handle = tokio::spawn(serve.into_future());

    // リクエストを送り、ハンドラーが処理を始めるのを待つ（応答は解放するまで返らない）。
    let url = format!("http://{addr}/");
    let request = tokio::spawn(async move { reqwest_lite_get(&url).await });
    started.notified().await;

    // 処理中に終了を開始する。解放するまでserver taskは終わらない。
    tx.send(()).unwrap();
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(300), &mut handle)
            .await
            .is_err(),
        "server finished while a request was still in flight"
    );

    // 解放すると、処理中のリクエストは応答を受け取り、server taskが正常に終わる。
    release.notify_one();
    assert_eq!(request.await.unwrap(), "ok");
    tokio::time::timeout(std::time::Duration::from_secs(5), handle)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(!ready.load(Ordering::Acquire));
}

/// 最小のHTTP GET（reqwestを足さない）。
async fn reqwest_lite_get(url: &str) -> String {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let url = url.trim_start_matches("http://");
    let (addr, path) = url.split_once('/').unwrap_or((url, ""));
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    stream
        .write_all(format!("GET /{path} HTTP/1.0\r\n\r\n").as_bytes())
        .await
        .unwrap();
    let mut buf = String::new();
    stream.read_to_string(&mut buf).await.unwrap();
    buf.rsplit("\r\n\r\n").next().unwrap_or("").to_string()
}
