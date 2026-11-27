# ADR-0009: RUST-05 実装とライブラリ選定（Rust基盤と技術PoC）

- 状態: 提案
- 作成日: 2026-11-27
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md) §3.1・§3.2・§4・§6・§9・§12（RUST-05）、[ADR-0001](0001-layout-and-workspace.md)〜[ADR-0008](0008-legacy-backend-rs-branch.md)、実装 `packages/backend-rs/`、設定スキーマ `packages/backend/config.schema.json`

## 背景

移行計画 §3.2 は、ライブラリの版・MSRV・TLS実装・依存機能を**着手時に再確認してADRと`rust-toolchain.toml`、`Cargo.lock`に固定する**と定めている。RUST-05「Rust基盤と技術PoC」の成果物は「最小サーバー、DB / Redis接続、設定・ログ・終了処理、ライブラリ選定ADR」（§12）。このPoCは、それまで「提案」の草案だった [ADR-0001](0001-layout-and-workspace.md)〜[ADR-0008](0008-legacy-backend-rs-branch.md) を、**実際に動くコード**で裏付ける。

本ADRは**新しい判断**を下すものではなく、既存ADRの選択を**RUST-05で採用した具体版**に固定し、PoCで確認した結果と、**採らなかった/据え置いたもの**を記録する。既存ADRの判断を変えるときは本文を書き換えず新ADRを作る（[docs/adr/README.md](README.md)）。

**基準**: 実装は `packages/backend-rs/`（`engawa-backend`）。検証はこのPRの作業ツリー（`develop`から切ったブランチ）で、`cargo fmt` / `cargo clippy --all-targets --locked -- -D warnings` / `cargo test --locked` / `cargo build --release --locked`、**PostgreSQL 15 + Redis 7 の実機結合試験**、**`POST /api/ping` と `GET /healthz` の実機確認**、**SIGTERM の graceful shutdown 実機確認**、**Redis / PostgreSQL 停止→再開の再接続実機確認**を実施。実行環境は `rustc 1.100.0 aarch64-apple-darwin`。**Linux / amd64 / arm64 / Docker / RHEL 系は未確認**（[ADR-0007](0007-toolchain-and-tls.md) の検証項目を参照）。

## 検討した選択肢

既存ADRで検討済みのため、ここでは**増分**のみ記載する。

| 用途 | 既存ADR | 採否の追加事項（RUST-05） |
| --- | --- | --- |
| 配置・ワークスペース | [ADR-0001](0001-layout-and-workspace.md) | `packages/backend-rs/` 単一Cargoパッケージ `engawa-backend` 0.1.0、edition 2024。**pnpm workspaceに足さない**。**HTTP/workerは同一パッケージ**。**CIは別workflow**（`.github/workflows/rust-backend.yml`）、`--locked`。**`unsafe`禁止**。`target/` をgitignore/dockerignore。 |
| 非同期・HTTP・WebSocket | [ADR-0002](0002-async-runtime-http-websocket.md) | Tokio + Axum + Tower + tower-http。**`ws`は有効にしない**。**multipartは有効にしない**。**`async-std`は入れない**。**WebSocketはフェーズ3**。共通処理はTowerレイヤー（CORS / request-id / trace / timeout / catch-panic / api cache-control）。**Fastify互換のエラー形を自前で作る**（`http-errors.ts`の`{error:{message,code,id,kind}}`、`UNKNOWN_API_ENDPOINT`、`METHOD_NOT_ALLOWED`、`INVALID_REQUEST`、`INTERNAL_ERROR`、`Retry-After`等は既存コードの値を写す。RUST-05では実装した範囲だけ。差分はRUST-03 fixtureで検査）。 |
| PostgreSQL | [ADR-0003](0003-postgresql-access.md) | SQLx + `PgPool`。**`migrate`機能は有効にしない。スキーマ同期/マイグレーション実行しない。** `connect_lazy_with`で**起動をDB到達に依存させず**、起動時プローブ + readiness。**プール上限明示**（`db.extra.max`既定10、`acquire_timeout`、`test_before_acquire`）。`statement_timeout`（既定10000ms、`db.extra.statement_timeout`上書き、`options=-c`）。**rustls + aws-lc-rs + ネイティブroot**。`db.extra.ssl`真偽 + `rejectUnauthorized`。**read replica（`dbReplications`/`dbSlaves`）はRUST-05では未対応**（読み取りはprimary。**黙って無視しない**）。**`SELECT 1`は実行時クエリ**（スキーマ非依存）。スキーマに触るSQLは**コンパイル時検査を既定**、例外一覧 + `.sqlx`オフライン（RUST-06で実施。**未確認**）。 |
| シリアライズ | [ADR-0004](0004-serialization.md) | Serde + serde_json + `preserve_order`。**`undefined`相当=`skip_serializing_if`、`null`=`None`（指定なし`Option`）**。**整数は整数型**（`f64`の`1.0`は出力`1.0`→整数型で`1`にする。JS`JSON.stringify(1)==="1"`）。**日時は`chrono`、`to_rfc3339_opts(SecondsFormat::Millis,true)`=`toISOString()`相当**（ミリ秒3桁・UTC・`Z`）。chronoのserde既定は精度可変→**固定する**。文字列エスケープはJSON標準（非ASCII/`/`はエスケープしない。**ADR-0004の「`JSON.stringify`との差」は未確認項目だが、この範囲で確認済み**）。未知プロパティは既定で無視。`pong`は整数ms。**PoC `tests/serialization.rs`**。 |
| 設定ファイル（YAML）+スキーマ検証 | [ADR-0004](0004-serialization.md) #3（「別のADRで扱う」） + §6 + 本ADR | 下記「決定案: 設定」。**`serde_yaml`は非推奨**（最終版`0.9.34+deprecated`）→**採らない**。`serde_yml` 0.0.13は**非推奨の互換シム**（`noyalib`へ転送、名前が非推奨）→**採らない**。**`serde_norway` 0.9.42**（maintained `serde_yaml` fork）→比較したが**採らない**。**`serde-saphyr` 2.1.1**（実際は`Cargo.lock`で**2.2.0**、`version="2.1.1"`→caret）を採用。**panic-free**、エラーにソースを含めない。**スキーマ検証に`jsonschema` 0.63.2**（Draft 2020-12、`x-*`は無視）、`config.schema.json`を`include_str!`で組み込み。**`jsonschema`クレートのAJV完全互換は主張しない**（`x-null-as-unset`/`x-env`/`x-deprecation`は手前で、未知キーは`AdditionalProperties`→warning。**`CHERRYPICK_CONFIG_VALIDATION`=warn/error/off**。`prepare`の再帰 + `/id`小文字化 + `applyEnv`を再実装）。 |
| Redis | [ADR-0005](0005-redis-client.md) | `redis` 1.8.1（crates.io。**実際は`Cargo.lock`で1.8.3**、`version="1.8.1"`→caret。redis 1.8.1は`tls-rustls-insecure`+`tls-rustls-webpki-roots`組み合わせで`connect_tcp_tls`欠落があり1.8.3を採用）+ **`tokio-comp` + `connection-manager`** + `tls-rustls` + `tls-rustls-insecure` + `tls-rustls-webpki-roots` + `json`。**`ConnectionManager::new_lazy_with_config` + `set_*`**（`connection_timeout`←`connectTimeout`、`response_timeout`←`commandTimeout`、`number_of_retries`←`maxRetriesPerRequest`,`null`=無限）。**自動再接続。起動をRedis到達に依存させず**、起動時`PING` + readiness。**`MultiplexedConnection`/`ConnectionManager`で足り、`deadpool-redis`/`bb8-redis`は足さない**。**`fred`は採らない**。**RESP2**。**`redisForJobQueue`(BullMQ)に接続しない**。**Sentinel/Clusterは未検証→検出して起動を止める**。**Pub/Sub再購読はフェーズ2〜3**。**`family=4/6`はredis-rsで強制不可→警告**。`keyPrefix`のioredis完全一致はRUST-05では**設定読み取り + adapterが付ける設計**、Node↔Rust相互試験は**未実施**（ADR-0005の検証項目）。**`family`既定0**。**`path`(unix)**はredis-rs対応。**`tls.rejectUnauthorized=false`→insecure**、custom CA/cert→**未対応報告**。 |
| ジョブ・キュー | [ADR-0006](0006-job-queue.md) | **RUST-05はキューを実装しない。** Node.js/BullMQが管理。**`CP_ONLY_QUEUE`は検出して起動を止める**（黙って無視しない）。`CP_NO_JOB_SCHEDULERS`no-op。`bullmq-official`は**評価候補のまま、未評価・依存に入れない**（RUST-08）。内部RPCは決めない。 |
| 外向きHTTP・暗号・認証 | [ADR-0002](0002-async-runtime-http-websocket.md) / [ADR-0007](0007-toolchain-and-tls.md) | **RUST-05は外向きHTTPを実装しない。** `reqwest`は**未選定**。**TLSはrustlsに統一、暗号実装はプロセス全体で`aws-lc-rs`1つ**（`rustls::crypto::aws_lc_rs::default_provider().install_default()`。`native-tls`は**採らない**。`ring`は`cargo tree`で実際には未リンク。`sqlx` `tls-rustls-aws-lc-rs-native-roots` + redis `tls-rustls`(rustls既定) + 直接`rustls` `aws_lc_rs`）。**`rustls` 0.23.46単一**。**root証明書はネイティブ**。内向きTLSは終端前提（リバースプロキシ）。SSRF等は未対象。 |
| ログ・計測 | 計画§3.2 + [ADR-0002](0002-async-runtime-http-websocket.md) | **`tracing` 0.1.44 + `tracing-subscriber` 0.3.23、JSON構造化ログ**（`json`,`env-filter`,`fmt`,`time`,`registry`,`ansi`）。**trace ID `x-request-id`**（tower-http `SetRequestIdLayer::x_request_id(MakeRequestUuid)` + `PropagateRequestIdLayer` + `TraceLayer`）、`uuid` v4。`CP_QUIET`→off、`CP_VERBOSE`→debug、`CP_WITH_LOG_TIME`受け付け（JSONは常にタイムスタンプ→no-op互換）、`NODE_ENV`読む。**機密（db/redisパスワード、トークン、`Authorization`）を出さない。`Debug`を手実装し`<redacted>`。エラーに接続文字列/YAML本文を含めない。Sentry/Cloud LoggingはRUST-05では載せない**（既存`cloudLogging`/`sentryForBackend`は**未対応報告**）。メトリクスは後。 |
| エラー型 | Rust慣習 + [ADR-0002](0002-async-runtime-http-websocket.md) #1 | **`thiserror`**(ライブラリ、`BackendError`)、**`anyhow`**(バイナリ)。`unsafe`禁止。`unwrap_used`/`expect_used`/`panic`をClippy warn + `-D warnings`（テストはallow）。 |
| ツールチェーン・TLS | [ADR-0007](0007-toolchain-and-tls.md) | 下記。 |

## 決定案

### ライブラリ選定（実際に採用して固定。版は`Cargo.toml` + `Cargo.lock`が正。確認日2026-11-27）

| 用途 | クレート | 版（`Cargo.toml`） | `Cargo.lock`実際 | MSRV | 有効feature |
| --- | --- | --- | --- | --- | --- |
| 非同期ランタイム | `tokio` | 1.54.1 | 1.54.1 | 1.85 | `macros,rt-multi-thread,signal,net,time,sync,io-util`（**not `full`**） |
| HTTP | `axum` | 0.8.9 | 0.8.9 | 1.80 | `http1,tokio,json,query,matched-path`（**not `ws`,`multipart`,`http2`**。`default-features=false`） |
| Tower | `tower` | 0.5.3 | 0.5.3 | 1.64 | `default-features=false` |
| HTTP middleware | `tower-http` | 0.6.8 | **0.6.11** | 1.64 | `cors,trace,request-id,set-header,timeout,catch-panic,util`（axum `^0.6.8`） |
| PostgreSQL | `sqlx` | 0.9.1 | 0.9.1 | **1.94.0** | `runtime-tokio,postgres,json,chrono,macros,derive,tls-rustls-aws-lc-rs-native-roots`（**not `migrate`,`tls-none`,`tls-rustls-ring`,`mysql`,`sqlite`,`any`,`sqlx-sqlite`,`sqlx-mysql`,`uuid`,`ipnetwork`,`bigdecimal`,`time`,`rust_decimal`,`bit-vec`,`offline`**。`default-features=false`） |
| Redis | `redis` | 1.8.1 | **1.8.3** | 1.88 | `tokio-comp,connection-manager,tls-rustls,tls-rustls-insecure,tls-rustls-webpki-roots,json`（**not `full`,`cluster-async`,`sentinel`,`r2d2`,`bb8`,`native-tls`,`unix-sockets`(unix targetで標準),`acl`**...。`default-features=false`。`streams`等の既定外は未使用） |
| TLS | `rustls` | 0.23 | **0.23.46** | 1.71 | `std,tls12,aws_lc_rs`（**not `ring`,`aws_lc_rs`...の重複、`native-tls`**） |
| 暗号実装 | `aws-lc-rs` | （rustls/transitive） | **1.19.0** | 1.71 | —。**プロセス全体で1つ** |
| シリアライズ | `serde` | 1.0.229 | 1.0.229 | 1.56 | `derive` |
| | `serde_json` | 1.0.154 | 1.0.154 | 1.71 | `preserve_order` |
| YAML | `serde-saphyr` | 2.1.1 | **2.2.0** | 1.89 | — |
| JSON Schema | `jsonschema` | 0.63.2 | 0.63.2 | 1.85 | `default-features=false`（**not `async`,`arbitrary-precision`,`http`,`resolve-http`,`unresolved`...**） |
| ログ | `tracing` | 0.1.44 | 0.1.44 | 1.63 | `std`,`attributes`,`log`(transitive) |
| | `tracing-subscriber` | 0.3.23 | 0.3.23 | 1.63 | `env-filter,fmt,json,std,time,registry,ansi`（`default-features=false`） |
| trace ID | `uuid` | 1 | **1.29.3** | 1.63 | `v4,serde` |
| 日時 | `chrono` | 0.4.45 | 0.4.45 | 1.61 | `clock,std,serde`（**not `default`**。`toISOString`固定は自前） |
| URL | `url` | 2 | **2.5.9** | 1.63 | — |
| エラー | `thiserror` | 2.0.21 | 2.0.21 | 1.61 | — |
| | `anyhow` | 1 | **1.0.105** | 1.39 | — |
| 依存監査 | `cargo-deny`（CI） | — | — | 1.88 | `deny.toml`。**`cargo-deny-action`**。`advisories`,`licenses`,`bans`,`sources`。**AGPL-3.0-only両立**（**未実行**） |
| ツール | `rustfmt`, `clippy` | — | — | — | `rust-toolchain.toml` components。`rustfmt.toml`,`clippy.toml` |

（`Cargo.toml`で`version="x.y"`のものは`--locked`で`Cargo.lock`の実際版を使う。**`Cargo.lock`コミット、CI/Dockerは`--locked`。**）

### ツールチェーン（[ADR-0007](0007-toolchain-and-tls.md)、`packages/backend-rs/rust-toolchain.toml`、`Cargo.toml`）

- `packages/backend-rs/rust-toolchain.toml`: `channel="1.100.0"`, `components=["rustfmt","clippy"]`, `profile="minimal"`. **Rust 1.100.0安定版固定**（RUST-05着手時点の最新。ADR-0007の調査時は1.100.0）。
- `Cargo.toml` `edition="2024"`, `rust-version="1.100.0"`, `license="AGPL-3.0-only"`, `publish=false`. **MSRV=固定版**。古いコンパイラー保証なし。
- **`Cargo.lock`コミット。`--locked`。`unsafe_code="forbid"`。** `[lints.clippy] unwrap_used/expect_used/panic="warn"` + `-D warnings`。
- `Cargo.toml` `version="0.1.0"`（**本体版と独立の`0.x`**、ADR-0001）。
- **CI** `.github/workflows/rust-backend.yml`: 全PR起動→Rust変更なしはheavy skip + `rust (noop)`、`cargo fmt --check`, `clippy -D warnings`, `test`, `build --release`, `cargo-deny`, PostgreSQL15+Redis7 service、`packages/backend-rs/**`+`packages/backend/config.schema.json`+workflow自身を変更検出。**ルート`package.json`に`backend-rs:*`だけ**（`cd packages/backend-rs && cargo ...`; **`--manifest-path`だけだと`rust-toolchain.toml`が効かない**→作業ディレクトリを移す。ADR-0001 #8 の確認済み）。（**GitHub Actions実行は未確認**）
- **`cargo deny`** `deny.toml`. **`target/`ignore.** `Cargo.lock`と`rust-toolchain.toml`で再現。

### RUST-05で実装したもの（最小サーバー + DB/Redis + 設定/ログ/終了）

1. **`POST /api/ping`** → `{"pong": <epoch ms>}` `application/json; charset=utf-8`; **`GET /api/ping`→405 `METHOD_NOT_ALLOWED`**; **`fastify.all`**(POST/PUT/PATCH/DELETE + object body→pong; `allowGet`未設定→**GET405**); **`paramDef={type:"object",properties:{},required:[]}` + `additionalProperties`非禁止**: bodyは**JSONオブジェクト**(`{}`可; extraプロパティ200); **`request.body`がobjectでない→400 `INVALID_PARAM`**(`#/type must be object`,`info`,`WWW-Authenticate`); **invalid JSON→400 `INVALID_REQUEST`**; **`application/json`+空body→400 `INVALID_REQUEST`**(Node `FST_ERR_CTP_EMPTY_JSON_BODY`); `pong`整数ms。**`POST /api/ping`はDB/Redis不要**。`ping.ts`互換。**`pong`フィールド省略/`null`化なし。** **`/api` prefix + `ping`.**
2. **`GET /healthz`** readiness: `ready` + `SELECT 1` + `PING`, **短timeout**, 200/503, `Cache-Control: no-store`. Node `HealthServerService`。**RUST-05はDB+`redis`(汎用)のみ**（Node版は5つのRedis+DB）。`ready`は起動完了でtrue、終了開始でfalse。
3. **`/api`共通**: `Cache-Control: private, max-age=0, must-revalidate`; **CORS `origin:'*'`**; `Content-Type`; `x-request-id`. **未知`/api/*`→404 `UNKNOWN_API_ENDPOINT`.** **`/api`以下の非2xxは`{error:{message,code,id,kind}}`.** `bodyLimit`→既存（`PAYLOAD_TOO_LARGE`定義を写す。**RUST-05はpingのみ、実装範囲内で確認**）。timeout→`REQUEST_TIMEOUT`. catch-panic→`INTERNAL_ERROR`. **未知ルートは（混在時はNodeへ送る。本実装単体は404）**.
4. **DB**: `DbConfig`、`PgConnectOptions`、`PgPoolOptions`、`connect_lazy_with`. `db.host`,`db.port`,`db.db`(??''),`db.user`(??''),`db.pass`(??''),`db.disableCache`(保持・未使用),`db.extra.{ssl,statement_timeout,max,application_name}`. `dbReplications`,`dbSlaves`. **終了時`pool.close()`.** readiness `SELECT 1`. **再接続実機確認**. **秘密を`Debug`/logsから除外.**
5. **Redis**: `RedisConfig`, `connection_info`, `RedisAdapter`. 5設定読み取り、`redis`のみ接続. `host`(localhost),`port`(6379),`path`,`pass??password`,`username`,`db`(0),`prefix`,`keyPrefix`,`tls`,`family`(0/4/6→4/6警告),`connectTimeout`,`commandTimeout`,`maxRetriesPerRequest`. **`keyPrefix`=`keyPrefix ?? `${prefix ?? <instance-url.host>}:``**（`convertRedisOptions`）. **`key_prefix`をadapterが付ける**（`apply_key_prefix`）. `db`→`redisForX`省略時`redis`. `redisForJobQueue`keyPrefix除外相当（接続しない）. `redisForSub`...`config.host`購読は**未対応**. readiness `PING`. **`QUIT` + drop.** **再接続実機確認.** `family`... `tcp_settings`...既定.
6. **設定**（§6）:
   - **`CHERRYPICK_CONFIG_YML`**（空→未設定、`.config/`相対、絶対可、`..`正規化）、**`.config/`をCWDから上へ探索**、**`NODE_ENV=test`→`test.yml`、それ以外`default.yml`**、**`CHERRYPICK_CONFIG_YML`不在→`Config file not found`.**
   - **同じYAML + 同じ`config.schema.json`.** `prepare`（`x-null-as-unset`,`x-deprecation`,`/id`小文字化）, `applyEnv`, **`CHERRYPICK_CONFIG_VALIDATION`=warn(既定)/error/off**, 不正値→`InvalidConfigValidationMode`, `mode=error`→`ConfigValidation`, `mode=off`→検証skip. **未知キー→warning.** `x-secret`値を出さない. `mode=off`→source=raw+applyEnv(false). `mode=error`→source=effective.
   - **`CHERRYPICK_URL`**(`url`未設定時), **`PORT`**(`port`未設定時, `/^\d+$/`,1-65535,不正→診断+未設定), **`DATABASE_DB`**, **`DATABASE_USER`**, **`DATABASE_PASSWORD`.**
   - `url`必須・**http/https**・`url.origin`, `host`(=`url.host`,**ポート込み**,keyPrefixのinstance host), `hostname`, `scheme`, `wsScheme`, `wsUrl`,`apiUrl`,`authUrl`,`driveUrl`.
   - `port`(`x-null-as-unset`,1-65535,`Option`), `socket`(unix,`chmodSocket`,TCP優先... **`socket`時はTCP不要**,終了時削除), **`socket`+`port`**. `trustProxy`(**読むのみ。RUST-05はIP信頼を実装しない→`unsupported`**)... 

   > 注: `trustProxy` は `config.trust_proxy` に保持するが、`RUST_SUPPORTED`には含めず`unsupported_keys`に出す。RUST-05の`/api/ping`はIP非依存。**`X-Forwarded-*`/`Host`のNode完全一致は未検証**（ADR-0002の検証項目）。

   - `disableHsts`(**読むのみ→unsupported**; Rust版はTLS終端しない), `id`(**`aid`,`aidx`,`meid`,`meidg`,`ulid`,`objectid`、小文字化、未知→`UnknownIdMethod`**。**ID生成は実装しない**)。`pidFile`(書き込み+終了削除), `logging`(`logging.sql.*`読むのみ→SQLログ未実装→unsupported). 
   - **`CP_*`**(environment.ts同じ): `CP_ONLY_QUEUE`,`CP_ONLY_SERVER`,`CP_NO_DAEMONS`,`CP_NO_JOB_SCHEDULERS`,`CP_DISABLE_CLUSTERING`,`CP_VERBOSE`,`CP_WITH_LOG_TIME`,`CP_QUIET`. **x-flag:空文字以外有効(0/false/no/offでも有効). 空文字/未設定のみ無効.** NODE_ENV=test→`no_daemons`+`disable_clustering`+`quiet`既定true; `CP_QUIET`...NodeはisTest... `CP_QUIET||isTest`. **`CP_ONLY_QUEUE`→RUST-05では起動を止める.** `CP_ONLY_SERVER`no-op(既にserverのみ). `CP_DISABLE_CLUSTERING`no-op(シングルプロセス). `CP_NO_DAEMONS`/`CP_NO_JOB_SCHEDULERS`no-op. **未知`CP_*`/`CHERRYPICK_*`→警告.** `NODE_ENV`不正→本番以外+診断. **`CHERRYPICK_CONFIG_VALIDATION`.** `NODE_ENV=production`のみproduction保護（**RUST-05は該当機能未実装**）. `NODE_ENV=test`...`CHERRYPICK_CONFIG_YML=test.yml`. 
   - **§6「Rustで未対応の設定を黙って無視しない。起動時に検出」**: `unsupported_keys`. `RUST_SUPPORTED_*`. `x-deprecation`. Sentinel/cluster→error. `dbReplications`→warning. `family=4/6`→warning. custom TLS→warning. `logging.sql`→warning. `dbSlaves`. `cloudLogging`,`sentry*`,`fulltextSearch`,`elasticsearch`,...全スキーマ既知で未実装→`unsupported`. →当該featureを移行対象外と報告. **黙って無視しない.**
   - **DB/Redis接続プール上限はNode版との合計で管理**（Rust側`max_connections`明示 + Redis接続数。RUST-05単体は実測未）。 
   - **設定の秘密（`db.pass`,`redis.pass`/`password`,`sentinelPassword`,...）をログに出さない。** `x-secret`→`<redacted>`. 
7. **ログ**: 上記。起動ログ `mode`, `config loaded`, `postgresql reachable`, `redis reachable`, `listening`, `received shutdown signal`, `drained`, `shutdown complete`, `fatal error`. **JSON。trace id。** `CP_QUIET`. `RUST_LOG`は**読まない**（CP_*で統一。...）。 
   
   > 注: `RUST_LOG`を読まない実装。`EnvFilter::new(...)`. 
8. **終了処理**（§1,§9）:
   - **SIGTERM** + **SIGINT**(Ctrl-C)。**非unix**はCtrl-C。 
   - 順序: **readinessを先に落とす(ready=false)→新規受付停止(`with_graceful_shutdown`)→in-flight drain**→**`ENGAWA_SHUTDOWN_TIMEOUT_MS`**(既定30000,不正→既定)で**打ち切り`abort`**→**DB `pool.close()`**→**Redis `QUIT`+drop**→**`pidFile`削除**→**unix socketファイル削除**. 
   - **シングルプロセス。** `CP_DISABLE_CLUSTERING`no-op. `pidFile`. `process title`...未. 
   - `/healthz` readiness vs liveness... **RUST-05はreadinessのみ。livenessはプロセス生存+HTTP応答**（別livenessエンドポイントは**未**。§9の分離はRUST-07。**Node `HealthServerService`も単一**）. 

### 最小サーバーの範囲外（黙って無視せず、`unsupported`/docs）

- WebSocket/Streaming（`ws`無効）、multipart、raw body保持（**pingはbodyを検査するだけ**）、HTTP/2、圧縮、`allowGet`（pingはGET405）、Ajv完全一致、rate limit、`Retry-After`（定義のみ）、認証、`i`/Bearer、レスポンスschema、read replica、Pub/Sub、タイムライン、リアクション、`redisForJobQueue`接続、BullMQ、ジョブ、outbox、`cp_only_queue`起動、cluster/worker分離、`trustProxy`実動、HSTS、`chmodSocket`...(`chmodSocket`は実装！...) 

  > 実装済み: socket + chmodSocket. 

- **RUST-06**（`GET /api/emojis`）、**RUST-07**（振り分け・rollback）、**RUST-08**（BullMQ/署名/outbox/ownership/冪等）、`api/ping`の**Node↔Rust差分CI**（RUST-03/04）、**`GET /api/emojis`、`GET /healthz`のNode baseline比較**。 

### シリアライズPoC結果（ADR-0004確認、`tests/serialization.rs`）

- `undefined`相当→`skip_serializing_if`; `null`→`null`. 常出力+`None`→`null`,省略+`None`→省略. （**どちらが契約かはフィールドごと。RUST-03 fixture。**）
- 整数`1`→`1`; `1.0f64`→`1.0`(JSと差→整数型で持つ); `pong`整数. 
- 非ASCII/`/`非エスケープ、制御文字`\u0000`/`\b\f\n\r\t`エスケープ、`"`/`\`エスケープ. **`JSON.stringify`との完全一致は未全検証**（ADR-0004検証項目。ActivityPub署名はRUST-08）. 
- `chrono::DateTime<Utc>`→RFC3339、**`to_rfc3339_opts(SecondsFormat::Millis,true)`→`2025-01-01T00:00:00.000Z`=`toISOString()`.** chrono serde既定は精度可変→**固定する**. 
- 未知プロパティ既定で無視. **Ajv↔serdeの既定値/型変換の完全一致は未**（ADR-0004 #1・検証項目、**フェーズ3で別ADR**）. 

### PoCで確認したこと（実機。**記録**）

- `cargo build`, `clippy -D warnings`, `fmt`, `cargo test --locked`, `cargo build --release --locked`, 293 crates, **`cargo tree -i aws-lc-rs`単一 + `rustls`0.23.46単一 + `ring`未リンク**（macOS arm64）. 
- `POST /api/ping`→`{"pong":...}` + headers + CORS + cache + x-request-id + **405** + **`INVALID_PARAM`/`INVALID_REQUEST`** vs **Node baseline**(POST `{}`→`pong`,GET→405,no-body→`INVALID_PARAM`,empty-json→`INVALID_REQUEST`,PUT/PATCH/DELETE→200,**`fastify.all`**). `preserve_order`. キー順は契約外ADR-0004). 
- `GET /healthz`→200, DB停止→503, Redis停止→503, **Redis停止→再開→200**, **DB停止→再開→200**, `/api/ping`はDB/Redis停止中も200. 
- SIGTERM→graceful drain→`shutdown complete`. 
- `CP_ONLY_QUEUE`→起動停止. `PORT`. `CHERRYPICK_URL`. `CHERRYPICK_CONFIG_YML`. `CHERRYPICK_CONFIG_VALIDATION`. `socket`+`chmodSocket`. `pidFile`. **`test.yml`**. 
- **PostgreSQL 15 + Redis 7 実機**: `SELECT 1`, `SHOW statement_timeout`=`10s`, pool max, `PING`, keyPrefix read/write. 

## 採用前に検証すること

既存ADRの項目を引き継ぎ、RUST-05で**完了/未完了**を記す。**このPRだけで「採用」にはしない。**

### RUST-05（このPoC）で確認済み（実機,macOS arm64,Rust1.100.0,PG15,Redis7）

- [x] `POST /api/ping`互換（body,header,CORS,`Cache-Control`,`Content-Type`,405,400,`pong`整数ms）。Node baseline比較（キー順は契約外）. 
- [x] `GET /healthz`. 
- [x] DB接続、`SELECT 1`,`statement_timeout`,pool max,readiness,**停止→再開→再接続**. 
- [x] Redis接続、`PING`,**停止→再開→再接続**,keyPrefix. 
- [x] 設定（`CHERRYPICK_CONFIG_YML`,`.config`,`CHERRYPICK_CONFIG_VALIDATION`,`CP_*`,`PORT`,`CHERRYPICK_URL`,`DATABASE_*`,`NODE_ENV=test`,`x-null-as-unset`,`x-deprecation`,`/id`小文字化,`applyEnv`,**unknown warning**,**unsupported報告**,**Sentinel検出**,`CP_ONLY_QUEUE`停止). 
- [x] 構造化JSONログ,`CP_QUIET/CP_VERBOSE/CP_WITH_LOG_TIME`,**機密非出力**. 
- [x] SIGTERM/SIGINT,**drain+timeout**,`pidFile`,`socket`清理,DB close,Redis QUIT. 
- [x] シリアライズPoC. 
- [x] `cargo fmt`/`clippy -D warnings`/`test`/`release`。`--locked`.
- [x] `rust-toolchain.toml`ツールチェーン固定が`packages/backend-rs`配下で効き、**ルートから`--manifest-path`だけでは効かない**（rustup調査済み）→`cd packages/backend-rs`. 
- [x] `unsafe`禁止。 

### 引き継ぎ・未完了（「提案」のまま。RUST-06/07/08 またはCIで確定）

[ADR-0001] Docker release両arch、Renovate、PRでRust-only→契約比較/混在E2E、Docker不使用Linux、Debian12、SPDX `.rs`,RHEL `target/`...
[ADR-0002] **raw body**、**multipart**、**エラー変換の完全一致**、**POST+GET**、**接続終了**(drain timeoutは実装。**実機確認要**)、**負荷制限**(timeoutのみ。concurrent/body limit未)、**`Host`/元IP/`trustProxy`**、**`api/ping`のNode baseline自動diff**、`Retry-After`,`WWW-Authenticate`,415,413,500、unknown method、WebSocket、`ws`圧縮、HTTP/2、maintainability...
[ADR-0003] **型対応**（配列/jsonb/timestamptz/enum/NULL/数値）、**引用付きキャメルケース列**、**コンパイル時SQL検査運用 + `.sqlx`**、**動的SQL**、**PGroonga `&@~`**、**statement_timeout両値**、**replication**、**DB停止**(実機確認済み。**pool acquire**...)、**PgBouncer**、**SQL比較**、**`chrono`/`time`最終**(chrono採用。**JS toISOString一致確認**。**cargo-deny `chrono` unmaintained advisory→`time`/`jiff`再検討**)、**ORM**、**migrate無効**(実装)...
[ADR-0004] **Ajv↔serde**(unknown/empty/null/default/型変換)、**3状態**、**false省略/空配列省略**(RUST-06 emoji)、**key order非契約**、**数値**、**bigint**、**escaping完全**、**resスキーマ165**、**入力検証方法**(フェーズ3別ADR)、**YAMLクレート+スキーマ**(本ADRで決定。**serde-saphyr2.2.0**。**Ajv `effective`完全一致未**)...
[ADR-0005] **再接続詳細**(実機確認。**`maxRetriesPerRequest`意味差**...)、**Pub/Sub再購読+キャッシュ無効化+権限再確認**、**prefix ioredis完全一致**(現行Redis文字列vs Rust...未)、**RESP2/3**(RESP2採用。**Redis7+Valkey両方未**...)、**Valkey**(本実装はRedis7実機。**Valkey未**)、**Sentinel/Cluster**(検出→停止。**未検証**)、**TLS**(feature有効。**実機TLS未**)、**family4/6**(警告)、**pipeline/multi**、**接続数合計**、**5接続**(読むが1接続)、**memory cache crate**、**`redis`2.x**、**`bullmq-official`redis=1.8.1 pin**(RUST-08; **現在1.8.3**)...
[ADR-0006] RUST-08...
[ADR-0007] **aws-lc-rs vs ring**(macOS arm64 `cargo tree` aws-lc-rs単一。**Linux両arch未**)、**Linux/musl/RHEL/macOS/Windows**(**未**)、**rustls現行PG/Redis TLS互換**(**未**)、**root証明書**(native。**未**)、**FIPS/SELinux**(**未**)、**CMake**(macOS build成功。**Linux未**)、**cargo-deny実行**(**未**)、**Renovate**(**未**)、**binary size**(**未**)、**CI**(**YAML作成。GHA未実行**)...
[ADR-0008] ... 

## 影響

- **新パッケージ `packages/backend-rs`。** 既存Node.jsに影響しない。pnpm対象外。**`packages/backend/config.schema.json`を共有。** ルート`backend-rs:*`。`.gitignore`/`.dockerignore` `target/`. CI workflow. **`pnpm test`/`pnpm lint`はRustを対象にしない**（Cargo別）。 
- **ツールチェーン1.100.0 + ネイティブビルド（aws-lc-rsにCコンパイラ、CMake要否は**ADR-0007検証**）。** 
- **honest unsupported reporting.** RUST-05のRust版は既存Node.jsを置換しない。混在期間。 
- **`Cargo.lock`更新は専用PR。** 
- **設定schema変更とRustは同PR。** （ADR-0003）. 
- 後続RUST-06+。 

## 要判断

既存ADRの「要判断」は参照。RUST-05で追加で決めた点は下。**残っている未決は下のADR-0004/0005/0007等へ。**

| # | 判断すること | 選択肢 | 推奨 | 決定 | 決定日 |
| --- | --- | --- | --- | --- | --- |
| 1 | YAMLクレート + `config.schema.json`検証（ADR-0004 #3） | `serde_yaml`(非推奨)/`serde_yml`(非推奨shim)/`serde_norway`/`serde-saphyr`; 検証`jsonschema` | **`serde-saphyr` + `jsonschema`,`config.schema.json`組み込み,`CHERRYPICK_CONFIG_VALIDATION`** | **決定**: 上記 | 2026-11-27 |
| 2 | 設定の`url`/`port` env override意味 | Node `applyEnv`=未設定時のみ | 同 | **決定**: Node一致 | 2026-11-27 |
| 3 | `trustProxy` | RUST-05は読むのみ | unsupported報告,実動は後 | **決定**: unsupported + 保持 | 2026-11-27 |
| 4 | 起動時DB/Redis | NodeはDB initialize必須; plan§9 readiness/liveness | `connect_lazy`+probe+continue+readiness | **決定**: 上記。**Node完全一致はしない**(明示) | 2026-11-27 |
| 5 | `CP_ONLY_QUEUE` | silently no-op / refuse | **refuse**(ADR-0006,§6) | **決定**: refuse | 2026-11-27 |
| 6 | shutdown timeout | `ENGAWA_SHUTDOWN_TIMEOUT_MS` | 既定30000 | **決定** | 2026-11-27 |
| 7 | trace id header | `x-request-id` | uuid v4 | **決定** | 2026-11-27 |
| 8 | `RUST_LOG` | read / not | CP_* | **決定**: not read | 2026-11-27 |
| 9 | crypto provider | aws-lc-rs / ring | **aws-lc-rs single** | **決定**: aws-lc-rs(**Linux未検証**,ADR-0007) | 2026-11-27 |
| 10 | `redis` version | 1.8.1 / latest | 1.8.1 | **決定**: lock 1.8.3(`version=1.8.1`);**bullmq-official pin=1.8.1はRUST-08** | 2026-11-27 |
| 11 | `unsupported` reporting | silently ignore / warn / refuse | warn+report(§6) | **決定**: warn+`unsupported_keys`,specific refuse(Sentinel,CP_ONLY_QUEUE,...) | 2026-11-27 |

## 出典

- このPRの作業ツリー、`packages/backend-rs/Cargo.toml`,`Cargo.lock`,`rust-toolchain.toml`,`src/**`,`tests/**`,`.github/workflows/rust-backend.yml`,`deny.toml`. 
- 移行計画 `docs/RUST_BACKEND_MIGRATION_PlAN.md`. （注: ファイル名の綴りは `PlAN`.）
- ADR-0001〜0008. 
- 現行Node: `packages/backend/src/config.ts`,`config/parse.ts`,`config/environment.ts`,`config/schema.ts`,`config/types.ts`,`packages/backend/config.schema.json`,`packages/backend/src/postgres.ts`,`GlobalModule.ts`,`packages/backend/src/logger.ts`,`NestLogger.ts`,`boot/*`,`server/ServerService.ts`,`server/HealthServerService.ts`,`server/api/ApiServerService.ts`,`server/api/ApiCallService.ts`,`server/api/http-errors.ts`,`server/api/endpoints/ping.ts`,`core/IdService.ts`,`misc/redis-reconnected.ts`,`queue/const.ts`. 
- 確認日2026-11-27。**版の正は`Cargo.lock`+`rust-toolchain.toml`.** 
- **未確認**: Linux/amd64+arm64,Docker,Docker不使用Linux,RHEL10/Ubuntu24.04/Debian12,musl,GitHub Actions,cargo-deny,Renovate,CMake,aws-lc-rs-on-Linux,rustls-existing-PG/Redis-TLS,PgBouncer,Sentinel/Cluster,Valkey,Redis-TLS,KeyPrefix-Node↔Rust-byte-parity,SQL-compile-time-`.sqlx`,PGroonga,`JSON.stringify`-完全一致,Ajv↔serde,`trustProxy`,`X-Forwarded-*`,`Host`,`RUST_LOG`,`ring`,`noyalib`,...（個別ADR参照）. 
