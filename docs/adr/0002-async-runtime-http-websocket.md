# ADR-0002: 非同期ランタイム・HTTP・WebSocket

- 状態: 提案
- 作成日: 2026-11-13
- 更新: 2026-11-14（要判断の決定を記入）
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md) §3.2・§4.1・§4.3・§9、[ADR-0007](0007-toolchain-and-tls.md)

## 背景

現行のHTTPサーバーはFastify 5.12.7（`@fastify/multipart` 9.2.1、`@fastify/cors` 10.1.0、`@fastify/rate-limit` 10.2.2ほか）で、Streamingは`ws` 8.21.3を`noServer: true`で使っている（`packages/backend/src/server/api/StreamingApiServerService.ts`）。入口の数は、APIエンドポイント446、それ以外のHTTPルート91、Streamingチャンネル16である（RUST-01の棚卸し）。

移行計画 §3.2は第一候補を「Tokio + Axum / Tower」とし、採用前に確認する点として、raw bodyの保持、Fastify相当のエラー変換、multipart、接続終了、負荷制限、チームの保守性を挙げている。

候補の現状は次のとおり。

| クレート | 最新の安定版 | 公開日 | MSRV | 備考 |
| --- | --- | --- | --- | --- |
| `tokio` | 1.54.1 | 2026-10-21 | 1.85 | |
| `axum` | 0.8.9 | 2026-04-14 | 1.80 | 0.9系のプレリリースはcrates.ioにない |
| `tower` | 0.5.3 | 2026-01-12 | 1.64.0 | |
| `tower-http` | 0.7.1 | 2026-08-31 | 1.65 | `axum` 0.8.9は`tower-http ^0.6.8`を任意の依存に持つ |
| `hyper` | 1.12.0 | 2026-10-06 | 1.63 | |
| `tokio-tungstenite` | 0.30.0 | 2026-07-11 | 1.85 | `axum` 0.8.9の`ws`機能は`^0.29.0`に依存する |

Axumの公式ドキュメントから確認したこと。

- Axumは独自のミドルウェア機構を持たず、`tower::Service`の上に作られている。
- TokioとHyperの上で動く前提であり、ランタイムからの独立は当面の目標ではないと明記している。
- `ws`、`multipart`、`http2`、`macros`は既定で無効の機能である。`multipart`は`multer ^3`に依存する。

## 検討した選択肢

### A. Tokio + Axum + Tower（決定案）

### B. Hyperを直接使う

採らない。ルーティング、抽出、エラー変換を自前で書くことになる。Axumが合わない箇所（raw bodyなど）だけTowerのServiceとして書けば足りる。

### C. ほかのHTTPフレームワーク（actix-web、poem、salvoなど）

今回は比較していない。各クレートの版と保守状況は未確認。計画が第一候補にAxumを挙げており、SQLx（[ADR-0003](0003-postgresql-access.md)）と`redis`（[ADR-0005](0005-redis-client.md)）がTokioを前提にするので、下の検証でAxumに重大な不足が見つかったときに比較する。

### D. 旧ブランチの構成（`axum` 0.8.6に`async-std`を併用）

採らない。旧ブランチの`Cargo.toml`は`tokio`と`async-std`の両方を依存に持つ。`async-std`を使うのは、sea-orm-cliが生成した`engawa_migration`の`main`（`#[async_std::main]`）だけである。マイグレーションをRustで持たない（[ADR-0003](0003-postgresql-access.md)）ので、この依存は要らない。ランタイムはTokioの1つにする。

## 決定案

1. 非同期ランタイムはTokioとする。ほかのランタイムを依存に入れない。
2. HTTPはAxumとし、共通処理（認証、レート制限、エラー変換、trace ID、タイムアウト、負荷制限）はTowerのレイヤーとして書く。
3. WebSocketはAxumの`ws`機能（`tokio-tungstenite`）を第一候補にする。ただしStreamingの移行はフェーズ3であり、採否はそのときの検証で決める。フェーズ1〜2では`ws`機能を有効にしない。
4. 有効にする機能は使うものだけにする。旧ブランチのように`tokio`の`full`や`axum`の全機能を指定しない。
5. `tower-http`を直接使うときは、`axum`が依存する系列（現時点で0.6系）と重複しないかを`cargo tree`で確認してから版を選ぶ。

版は、RUST-05の着手時に再確認して`Cargo.lock`に固定する。上の表の版を、この文書で固定するものではない。

## 採用前に検証すること

RUST-05（基盤のPoC）で確かめる。

- [ ] **エラー変換**: Fastifyと現行の`ApiCallService`が返す、status、`error: { message, code, id, kind, info? }`、`WWW-Authenticate`、`Retry-After`、`Content-Type`とcharsetを、Axumで同じに返せるか（計画 §4.1）。不正なJSON、未知のルート、メソッド違い、bodyの上限超過を含める。
- [ ] **入力**: POST主体のルート、`allowGet`（26エンドポイント）、JSONとmultipartの両方を受けるルートを、同じハンドラーで扱えるか。
- [ ] **接続終了とSIGTERM**: 処理中のリクエストを待って終了できるか。待機時間の上限を設定できるか（計画のフェーズ1の完了条件）。
- [ ] **負荷制限**: 同時接続数、同時処理数、bodyの大きさ、タイムアウトを、Towerのレイヤーで制御できるか。超過時の応答を決める。
- [ ] **転送**: 既存の入口から振り分けたとき、`Host`、元IP、`trustProxy`相当の扱いが現行と一致するか（計画 §9）。
- [ ] **`api/ping`の互換**: 応答のbody、ヘッダー、CORSを比較する（計画のフェーズ1）。

RUST-08または各フェーズの着手時に確かめる。

- [ ] **raw bodyの保持**: ActivityPubの受信で、bodyのバイト列をdigestの検証まで保持できるか（計画 §4.3）。JSONとして解釈する前のバイト列と、解釈後の値の両方を1回の読み取りで得る方法を決める。
- [ ] **multipart**: `@fastify/multipart`の上限（ファイルの大きさ、フィールド数）、一時ファイルの扱い、途中で切れたアップロードの後始末を再現できるか。
- [ ] **WebSocket**: 現行の`ws`の設定（圧縮、最大メッセージ長、ping間隔）と、`tokio-tungstenite`の対応。圧縮（permessage-deflate）の対応は未確認。新規接続から切り替え、旧接続をdrainする手順（計画 §9）。
- [ ] **HTTP/2**: 入口（リバースプロキシ）とバックエンドの間で使うか。使わないなら`http2`機能は有効にしない。
- [ ] **保守性**: レビュー担当者が、Towerのレイヤーと抽出器の型エラーを読めるか。読めない場合は、共通処理の書き方を絞った指針を作る。

## 影響

- Axumは0.x系で、0.7から0.8のように破壊的変更を含む更新がある。共通処理をTowerのレイヤーに置き、ハンドラーからAxumの型を業務処理へ渡さないことで、更新の影響を入口の層に閉じ込める。
- Fastifyのプラグインが暗黙に行っている処理（CORS、`Content-Type`の判定、エラーの整形）は、Axumでは明示的に書く。書き漏らしは契約のfixture（RUST-03）で検出する。
- Tokioを前提にするので、DB・Redis・外向きHTTPのクレートもTokio対応のものから選ぶ。

## 要判断

| # | 判断すること | 選択肢 | 推奨 | 決定 | 決定日 |
| --- | --- | --- | --- | --- | --- |
| 1 | Axumが検証項目を満たさなかったときの扱い | (a) 該当箇所だけTowerのServiceを自前で書く (b) フレームワークを比較し直す | (a)を先に試す。raw bodyとmultipartは自前のServiceで解決できる見込みが高い。エラー変換が再現できない場合だけ(b) | **決定**: 推奨どおり。(a)を先に試し、エラー変換が再現できない場合だけ(b) | 2026-11-14 |
| 2 | Streaming（WebSocket）を同じプロセスに置くか | (a) HTTPと同じプロセス (b) 別の起動モード | フェーズ3で決める。現行は同じプロセスである。接続数が多く、再起動時のdrainの都合が違うので、(b)にできる構造にしておく | 保留（フェーズ3で決める） | — |

## 出典

確認日: 2026-11-13

- 版・公開日・MSRV・依存: crates.ioのAPI
  - <https://crates.io/api/v1/crates/tokio>
  - <https://crates.io/api/v1/crates/axum>、<https://crates.io/api/v1/crates/axum/0.8.9/dependencies>
  - <https://crates.io/api/v1/crates/tower>、<https://crates.io/api/v1/crates/tower-http>
  - <https://crates.io/api/v1/crates/hyper>、<https://crates.io/api/v1/crates/tokio-tungstenite>
- Axumの機能と設計方針: <https://docs.rs/axum/0.8.9/axum/>
- 現行の版: `packages/backend/package.json`、`pnpm-lock.yaml`（コミット`5e8cc3b2cd`）
- 未確認: `tokio-tungstenite`の圧縮対応、Axum以外のHTTPフレームワークの版と保守状況
