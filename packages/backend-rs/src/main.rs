/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//! `engawa-backend` バイナリ。RUST-05最小サーバー。
//!
//! 起動:
//! - 設定読み込み（`CHERRYPICK_CONFIG_YML` / `.config/` / `CHERRYPICK_CONFIG_VALIDATION` / `CP_*`）。
//! - **`CP_ONLY_QUEUE`: RUST-05ではキューを実装しない。** 検出して起動を止める（黙って無視しない。ADR-0006）。
//! - **`CP_ONLY_SERVER`: このRust版はサーバーのみ。** no-op。
//! - `CP_DISABLE_CLUSTERING` / `CP_NO_DAEMONS` / `CP_NO_JOB_SCHEDULERS`: シングルプロセス・定期処理なし。no-op。
//! - DB / Redis に接続しようとする。到達できなくても起動は続け、readiness（`/healthz`）が503になる（計画§9）。
//! - `pidFile`を書き、終了時に消す。
//! - **SIGTERM/SIGINT**でgraceful shutdown。`ENGAWA_SHUTDOWN_TIMEOUT_MS`で待機上限。

#![forbid(unsafe_code)]

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use engawa_backend::config::{self};
use engawa_backend::http::{AppState, app};
use engawa_backend::logging::{self};
use engawa_backend::shutdown;
use engawa_backend::{db, redis::RedisAdapter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let logging_options = logging::init_logging();

    if let Err(err) = run(logging_options).await {
        tracing::error!(error = %err, "fatal error occurred during initialization");
        return Err(err);
    }
    Ok(())
}

async fn run(_logging_options: logging::LoggingOptions) -> anyhow::Result<()> {
    // rustls暗号実装はプロセス全体で1つ（aws-lc-rs。ADR-0007）。
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let only_queue = logging::env_flag("CP_ONLY_QUEUE");
    let only_server = logging::env_flag("CP_ONLY_SERVER");

    tracing::info!(
        disable_clustering = true,
        only_server = only_server,
        only_queue = only_queue,
        node_env = ?engawa_backend::logging::NodeEnv::from_env(),
        "mode",
    );

    let config = match config::load_config_from_env() {
        Ok(c) => c,
        Err(err) => {
            tracing::error!(error = %err, "configuration error");
            anyhow::bail!("configuration error: {err}");
        }
    };

    // 診断（秘密を含めない）。`mode=error`のエラーは`load_config`が返す。
    for diag in &config.diagnostics {
        match diag.level {
            config::DiagnosticLevel::Error => {
                tracing::error!(path = %diag.path, message = %diag.message, "invalid configuration")
            }
            config::DiagnosticLevel::Warning => {
                tracing::warn!(path = %diag.path, message = %diag.message, "configuration diagnostic")
            }
        }
    }
    if !config.unsupported_keys.is_empty() {
        tracing::warn!(keys = ?config.unsupported_keys, "configuration keys not supported by the Rust backend yet; those features are out of scope");
    }

    // CP_ONLY_QUEUE: RUST-05はキューを実装しない。黙って無視せず停止する。
    if config.options.only_queue && !config.options.only_server {
        anyhow::bail!(
            "CP_ONLY_QUEUE is not supported by engawa-backend (RUST-05): no job queue is implemented. BullMQ on the Node.js backend owns the queue. Refusing to silently ignore."
        );
    }

    // シングルプロセス。CP_DISABLE_CLUSTERING no-op。CP_NO_DAEMONS/CP_NO_JOB_SCHEDULERS no-op（対象がない）。
    if config.db_replications {
        tracing::warn!(
            "dbReplications=true is not supported by the Rust backend yet; reads use the primary"
        );
    }

    // pidFile
    let pid_file = config.pid_file.clone();
    if let Some(pf) = &pid_file
        && let Err(e) = std::fs::write(pf, std::process::id().to_string())
    {
        tracing::warn!(path = %pf.display(), error = %e, "could not write pidFile");
    }

    // DB（connect_lazy。起動をDB到達に依存させない）
    let db_pool = match db::connect_pool(&config.db).await {
        Ok(p) => p,
        Err(err) => {
            tracing::error!(error = %err, "cannot create PostgreSQL pool");
            anyhow::bail!("cannot create PostgreSQL pool: {err}");
        }
    };
    match db::ping(&db_pool).await {
        Ok(()) => tracing::info!("postgresql reachable"),
        Err(e) => {
            tracing::warn!(error = %e, "postgresql not reachable at startup; readiness will report 503 until it recovers")
        }
    }

    // Redis（lazy。起動をRedis到達に依存させない）
    let redis = match RedisAdapter::connect(&config.redis).await {
        Ok(r) => r,
        Err(err) => {
            tracing::error!(error = %err, "cannot create Redis adapter");
            anyhow::bail!("cannot create Redis adapter: {err}");
        }
    };
    match redis.ping().await {
        Ok(()) => tracing::info!("redis reachable"),
        Err(e) => {
            tracing::warn!(error = %e, "redis not reachable at startup; readiness will report 503 until it recovers")
        }
    }

    // ready状態
    let ready = Arc::new(AtomicBool::new(false));
    let state = AppState {
        db: db_pool.clone(),
        redis: redis.clone(),
        ready: ready.clone(),
    };
    let router = app(state);

    // 待ち受け
    let shutdown_timeout = shutdown::shutdown_timeout();
    let ready_for_shutdown = ready.clone();

    // graceful shutdown用チャンネル。
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    // readinessは起動完了でtrue。
    ready.store(true, Ordering::Release);

    // このサーバーはshutdown信号を外部で受けてからdrainする。
    let log_addr = |local: Option<std::net::SocketAddr>| {
        if let Some(sock) = &config.socket {
            tracing::info!(socket = %sock.display(), url = %config.public.url, "listening on unix socket");
        } else if let Some(port) = config.port {
            tracing::info!(port, addr = ?local, url = %config.public.url, "listening");
        } else {
            tracing::info!(addr = ?local, url = %config.public.url, "listening");
        }
    };

    // シャットダウン待機future。readyを落としてからdrain。
    let graceful = async move {
        let _ = shutdown_rx.await;
    };

    if let Some(sock) = &config.socket {
        // Unix socket。`chmodSocket`適用。
        let _ = std::fs::remove_file(sock); // 古いsocketファイルを消す（Node版相当の掃除）。
        if let Some(parent) = sock.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let listener = tokio::net::UnixListener::bind(sock)?;
        #[cfg(unix)]
        if let Some(mode_str) = &config.chmod_socket
            && let Ok(mode) = u32::from_str_radix(mode_str.trim_start_matches("0o"), 8)
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(sock, std::fs::Permissions::from_mode(mode));
        }
        log_addr(None);
        let serve =
            axum::serve(listener, router.into_make_service()).with_graceful_shutdown(graceful);
        run_until_signal(
            serve.into_future(),
            ready_for_shutdown,
            shutdown_tx,
            shutdown_timeout,
        )
        .await;
    } else {
        let port = config
            .port
            .ok_or_else(|| anyhow::anyhow!("port is required when no unix socket is configured"))?;
        let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
        let listener = tokio::net::TcpListener::bind(addr).await?;
        let local = listener.local_addr().ok();
        log_addr(local);
        let serve =
            axum::serve(listener, router.into_make_service()).with_graceful_shutdown(graceful);
        run_until_signal(
            serve.into_future(),
            ready_for_shutdown,
            shutdown_tx,
            shutdown_timeout,
        )
        .await;
    }

    // 後始末: readiness off → DB close → Redis QUIT → pidFile削除.
    ready.store(false, Ordering::Release);
    db::close(&db_pool).await;
    redis.shutdown().await;
    if let Some(pf) = &pid_file {
        let _ = std::fs::remove_file(pf);
    }
    if let Some(sock) = &config.socket {
        let _ = std::fs::remove_file(sock);
    }

    tracing::info!("shutdown complete");
    Ok(())
}

/// シグナルを待って、drainを`shutdown_timeout`で打ち切る。
async fn run_until_signal<F>(
    serve: F,
    ready: Arc<AtomicBool>,
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
    shutdown_timeout: std::time::Duration,
) where
    F: std::future::Future<Output = std::io::Result<()>> + Send + 'static,
{
    let mut serve_handle = tokio::spawn(serve);

    // シグナル待機。
    let signal = shutdown::shutdown_signal().await;
    tracing::warn!(
        signal,
        "received shutdown signal; stopping accepting new connections and draining"
    );
    // readinessを先に落とす（新規受付停止の前に ready=503）。
    ready.store(false, Ordering::Release);
    let _ = shutdown_tx.send(());

    // drainを待機上限付きで。
    match tokio::time::timeout(shutdown_timeout, &mut serve_handle).await {
        Ok(Ok(Ok(()))) => tracing::info!("drained in-flight requests"),
        Ok(Ok(Err(e))) => tracing::warn!(error = %e, "HTTP server ended with error after drain"),
        Ok(Err(join_err)) => tracing::warn!(error = %join_err, "serve task panicked"),
        Err(_) => {
            tracing::warn!(
                timeout_ms = shutdown_timeout.as_millis() as u64,
                "drain timeout exceeded; forcing shutdown"
            );
            serve_handle.abort();
        }
    }
}
