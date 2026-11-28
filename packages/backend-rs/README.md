<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# engawa-backend (`packages/backend-rs`)

CherryPick / EngawaバックエンドのRust実装。**RUST-05基盤**（[`docs/RUST_BACKEND_MIGRATION_PLAN.md`](../../docs/RUST_BACKEND_MIGRATION_PLAN.md) §12、[ADR-0001](../../docs/adr/0001-layout-and-workspace.md)〜[ADR-0009](../../docs/adr/0009-rust-05-library-selection.md)）。

この段階で提供するもの:

- **最小サーバー**: `POST /api/ping` → `{"pong": <epoch ms>}`（`GET`→405）、`GET /healthz` readiness、未知の`/api/*`→404 `UNKNOWN_API_ENDPOINT`。`{ error: { message, code, id, kind } }`、CORS `*`、`Cache-Control`、`x-request-id`、Axum + Tower。
- **DB接続**: PostgreSQL（SQLx `PgPool`、`max_connections`明示、`statement_timeout`、TLS rustls/aws-lc-rs）。**DDL/マイグレーションはしない**（TypeORMが唯一の管理元）。readiness `SELECT 1`。依存停止でも起動し、自動再接続。
- **Redis接続**: redis-rs `ConnectionManager`（自動再接続）。5つの接続設定を**読む**が、**`redis`（キャッシュ・汎用）のみ接続**。`keyPrefix`（`keyPrefix ?? `${prefix ?? <instance-host>}:``）はadapterが付ける。`redisForJobQueue`（BullMQ）には**接続しない**。Sentinel/Clusterは未検証→検出。readiness `PING`。
- **設定**: 既存の`CHERRYPICK_CONFIG_YML`、`.config/`、`config.schema.json`、`CHERRYPICK_CONFIG_VALIDATION`（warn/error/off）、`CP_*`、`CHERRYPICK_URL`/`PORT`/`DATABASE_*`。**未対応設定を黙って無視しない**（`unsupported_keys` + 警告）。`CP_ONLY_QUEUE`は**起動を止める**。`CP_ONLY_SERVER`/`CP_DISABLE_CLUSTERING`/`CP_NO_DAEMONS`/`CP_NO_JOB_SCHEDULERS`は受け付けno-op。`CP_QUIET`/`CP_VERBOSE`/`CP_WITH_LOG_TIME`。`pidFile`。Unix `socket` + `chmodSocket`。
- **構造化ログ**: `tracing` + JSON。`trace_id`（`x-request-id`）。機密を出さない。
- **終了処理**: **SIGTERM/SIGINT** → readinessを落とす → 新規受付停止 → in-flight drain（`ENGAWA_SHUTDOWN_TIMEOUT_MS`既定30000）→ DB close → Redis QUIT → `pidFile`/`socket`削除。

## 使い方

```sh
# packages/backend-rs で実行（rust-toolchain.toml のツールチェーン固定が効く。.config/はリポジトリの.configを探す）
cd packages/backend-rs && cargo run --locked
# または リポジトリルートで pnpm backend-rs:dev

CHERRYPICK_CONFIG_YML=test.yml CHERRYPICK_CONFIG_VALIDATION=error cargo run
```

既存の `.config/default.yml`（または`test.yml`、`CHERRYPICK_CONFIG_YML`）を読む。`url`,`port`,`socket`,`db`,`redis`,`redisFor*`,`id`,`pidFile`等。

## 開発

```sh
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
cargo build --release --locked
cargo deny check   # deny.toml
# 結合試験（PostgreSQL 15 + Redis 7。packages/backend/test/compose.yml を up）
ENGAWA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54312/test-cherrypick \
ENGAWA_TEST_REDIS_URL=127.0.0.1:56312 cargo test --test db_redis
```

## ツールチェーン

`rust-toolchain.toml`で **Rust 1.100.0** 固定、edition 2024、`rust-version = "1.100.0"`。`Cargo.lock`コミット、CIは`--locked`。`unsafe`禁止。`Cargo.lock` + `rust-toolchain.toml`が正。詳細は[ADR-0007](../../docs/adr/0007-toolchain-and-tls.md)。

## pnpmに載せない

`packages/backend-rs/`は**pnpm workspaceに追加しない**（`package.json`も置かない。Cargoファイルはこのディレクトリ）。CIはCargoを直接呼ぶ。ルートには`backend-rs:*`スクリプトだけ足している。
