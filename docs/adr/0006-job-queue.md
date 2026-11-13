# ADR-0006: ジョブとキューの管理

- 状態: 提案
- 作成日: 2026-11-13
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md) §3.2・§5.1・§5.3・§12（RUST-08）、[ADR-0005](0005-redis-client.md)

## 背景

現行は`bullmq` 5.61.0（2025-10-06公開）で、キューが11、ジョブが45、cronで動くジョブが11ある（RUST-01の棚卸し）。npmの最新は6.7.6（2026-11-12公開）で、現行はメジャー版が1つ古い。

移行計画の方針は次のとおり。

- §3.2: 初期はNode.js / BullMQがキューを管理し、移行済みの処理を内部RPCで呼ぶ。将来のRustによるキュー管理には、公式のRustクレート`bullmq-official`を評価候補にする。「採用済みとは扱わない」。
- §5.3: BullMQの予約・ロック・再試行・完了判定はNode.jsが担当する。Rustによる直接のキュー管理へ進むときは、実際のBullMQの版で、enqueue、claim、lock更新、stalled、retry、backoff、delayed、scheduler、失敗・完了の保持、管理APIを検証する。「Redisのキーを推測して操作する独自互換実装は作らない」。
- §5.1: 内部RPCは、Unix socketまたはアクセスを制限した内部ネットワークで提供し、呼び出し元認証、入力検証、期限、処理件数上限、trace ID、operation IDを持たせる。
- §12: BullMQの版間互換の検証はRUST-08で行う。

候補の現状は次のとおり。

| クレート | 最新の安定版 | 公開日 | MSRV | 備考 |
| --- | --- | --- | --- | --- |
| `bullmq-official` | 1.5.1 | 2026-11-12 | 1.85 | 最初の公開は1.0.0（2026-07-12）。4か月で29版 |
| `apalis` | 1.1.1 | 2026-11-10 | 宣言なし | 旧ブランチは0.7.3を使っていた |
| `apalis-redis` | 1.1.1 | 2026-11-11 | 宣言なし | `redis ^1.8.1`に依存する |

`bullmq-official`について、公式資料で確認したこと。

- crates.ioでの名前は`bullmq-official`で、コードからは`bullmq`として使う。`bullmq`、`bullmq-rust`、`bullmq-rs`の名前はほかのクレートが取っている。
- 「ほかのBullMQ SDKと同じLuaスクリプトとRedisのデータ構造を使う」と説明している。docs.rsは「Node.jsとElixirの実装と完全に互換」と書いている。対応するNode.js版の`bullmq`の版の範囲は書かれていない。
- Redis 6.2以降（またはValkey、Dragonflyなどの互換サーバー）が必要で、非同期のランタイムはTokioである。
- docs.rsには、`queue`、`worker`、`job_scheduler`（cronなどの繰り返し）、`flow_producer`、`queue_events`のモジュールがある。遅延ジョブ、stalledの回復、ロックの更新についての説明は、確認したページにはなかった。
- 依存の版を完全一致で指定している: `redis =1.8.1`、`tokio =1.54.1`、`serde =1.0.229`、`serde_json =1.0.154`、`tokio-stream =0.1.19`、`rmp-serde =1.3.1`。

`apalis-redis`について、docs.rsで確認したこと。

- 「信頼できるタスクキュー」で、Redis互換のサービスをバックエンドに使えると説明している。
- BullMQを含む、ほかのキューの形式との互換についての記述はない。

## 検討した選択肢

### A. 初期はNode.js / BullMQがキューを管理し、Rustは内部RPCで呼ばれる（決定案）

### B. apalis（旧ブランチの選択）

採らない。理由は次のとおり。

1. **既存のキューと互換がない。** `apalis-redis`はBullMQとの互換をうたっていない。採る場合、Redis上の既存のジョブ（遅延、予約、再試行待ち、cronの登録）を別の形式へ移すことになる。計画 §5.3は、将来時刻の予約ジョブを「空になるまで待つ」で済ませないと定めている。
2. **混在期間に、同じジョブを両方の実装で扱えない。** Node.js版が登録したジョブをRust版が処理する、またはその逆ができない。ジョブ種別ごとに担当を移すという計画 §5.3の進め方が取れない。
3. **切り戻しが難しい。** Rust側のキューに入ったジョブを、Node.js版が読めない。計画 §9は、切り戻しのときにactive / delayed / failedのジョブを照合し、旧実装が処理できる状態を保つことを求めている。
4. **管理画面の互換がなくなる。** 現行のキューの管理（計画 §3.2の「管理画面との互換」）は、BullMQのデータ構造を前提にしている。
5. **失うものがない。** 旧ブランチの`engawa_backend/src/queue/mod.rs`は空で、apalisを使うコードは書かれていない。

apalisそのものの品質を評価したものではない。既存のBullMQのデータを引き継ぐ要件に合わない、という判断である。

### C. 最初から`bullmq-official`でRustがキューを直接扱う

採らない（評価候補にとどめる）。理由は次のとおり。

1. **対応するNode.js版の版が分からない。** 現行は5.61.0で、最新は6.7.6である。Rustクレートが、どの版のLuaスクリプトとジョブの状態に対応するかは、資料に書かれていない。計画 §3.2は実機での検証を求めている。
2. **公開から日が浅く、更新が速い。** 最初の公開から4か月で29版が出ている。
3. **依存を完全一致で固定している。** `redis`、`tokio`、`serde`の版が`bullmq-official`の版に縛られる。ほかのクレートが要求する版と合わないと、ビルドできないか、同じクレートの2つの版を抱える。採る場合は、`bullmq-official`の更新のたびに、これらの版も同時に動く。
4. **必要になる時期が遠い。** Rustがキューを直接扱うのはフェーズ5である。それまではNode.js版のworkerが動いている。

### D. BullMQのRedisのキーとLuaを自前で再実装する

採らない。計画 §5.3が明示的に禁じている。

### E. PostgreSQLをキューにする（outboxの延長）

今回は比較していない。計画のoutbox（§5.1）は、DB更新とジョブ登録の整合のための中継であり、キューの置き換えではない。フェーズ5の「Rustキュー管理の方式選定」で、Cと並べて比較する候補にはなる。

## 決定案

1. フェーズ4までは、キューの管理（登録、予約、ロック、再試行、完了判定、cronの登録）をNode.js版のBullMQが担当する。Rust版はBullMQのキーを読み書きしない。Rust版は`redisForJobQueue`に接続しない。
2. 移行済みのジョブ処理は、Node.js版のworkerが内部RPCでRust版を呼ぶ。RPCは計画 §5.1の要件（呼び出し元認証、入力検証、期限、処理件数上限、trace ID、operation ID）を満たす。
3. Rust版がジョブを登録する必要がある操作（フェーズ4以降）は、同じDBトランザクションにoutboxのレコードを書き、中継処理がBullMQへ投入する（計画 §5.1）。Rust版から直接BullMQへ投入しない。
4. `apalis`は採らない。
5. `bullmq-official`は、RUST-08で評価する候補にとどめる。評価の結果は、このADRを置き換える新しいADRに書く。評価が終わるまで、依存に加えない。
6. 内部RPCの方式（転送路、直列化、認証の方法）は、このADRでは決めない。RUST-08で、ロックの更新と処理時間の関係を測ってから、別のADRにする。

## 採用前に検証すること

RUST-08で確かめる。決定案の1〜3を「採用」にするための項目。

- [ ] **RPCのタイムアウトと再試行**: RPCがタイムアウトした後もRust側の処理が続く場合に、BullMQの再試行で二重に実行されても最終状態が変わらないか（計画 §5.3）。operation IDで結果を照会できるか。
- [ ] **ロックの更新**: 処理時間が長いジョブ（インポート、エクスポート、アカウントの削除）で、Node.js側のロックの更新がRPCの待機中も続くか。
- [ ] **停止時の待機**: Node.js版のworkerを止めるとき、実行中のRPCを待つ時間の上限と、Rust側の処理の中断の扱い。
- [ ] **並列度**: 現行の並列度（`deliverJobConcurrency`の既定128、`inboxJobConcurrency`の既定16）でRPCを呼んだときの、接続数とRust側の負荷制限。
- [ ] **outboxの中継**: 中継の再実行、投入に成功した後の応答の消失で、ジョブが重複しても整合するか（計画 §5.1）。

RUST-08で確かめる。`bullmq-official`の評価（決定案の5）のための項目。

- [ ] **版の対応**: `bullmq-official`の特定の版が、Node.js版の`bullmq`のどの版と同じLuaスクリプトを使うか。5.61.0と互換か、6.x系への更新が前提か。
- [ ] **相互運用**: Node.js版が登録したジョブをRust版が処理し、Rust版が登録したジョブをNode.js版が処理する。対象は、enqueue、claim、lock更新、stalled、retry、backoff、delayed、scheduler、失敗・完了の保持、管理API（計画 §5.3）。
- [ ] **現行が使う機能の網羅**: 現行のコードが使うBullMQの機能（繰り返し、レート制限、重複の排除、優先度など）を一覧にし、Rustクレートの対応と突き合わせる。現行が使う機能の一覧は未作成。
- [ ] **依存の固定の影響**: 完全一致の指定が、ほかのクレート（SQLx、Axum、`redis`を使うadapter）と同じ`Cargo.lock`で解決できるか。
- [ ] **保守の体制**: 公開の頻度、破壊的変更の告知、Node.js版との同期の取り方。

## 影響

- フェーズ5まで、Node.js版のworkerとBullMQが必須のまま残る。バックエンドからNode.jsをなくすという最終目標（計画 §10）は、キュー管理の方式を決めるまで達成できない。
- ジョブ処理を移すたびに、RPCの往復が1回増える。処理が短く、数が多いジョブ（`deliver`）では、往復の費用が効果を打ち消す可能性がある。RUST-02の計測と合わせて、移す対象を選ぶ。
- Node.js版の`bullmq`を6.x系へ上げる作業が、`bullmq-official`の評価の前提になる可能性がある。上げる場合、Rust移行と別のPRで行う。

## 要判断

| # | 判断すること | 選択肢 | 推奨 |
| --- | --- | --- | --- |
| 1 | Node.js版の`bullmq`を6.x系へ上げる時期 | (a) RUST-08の評価の前に上げる (b) 評価で「5.61.0と互換がない」と分かってから上げる (c) 上げない | (b)。先に、Rustクレートがどの版に対応するかを確かめる。ただしセキュリティ上の理由で上げる必要が出たら、Rust移行と無関係に上げる |
| 2 | 内部RPCの方式 | (a) Unix socket上のHTTP / JSON（Axumをそのまま使える） (b) gRPC (c) そのほか | (a)を第一候補にして、RUST-08で確かめる。新しい依存と生成コードが要らず、Node.js側も標準の機能で呼べる。型の同期が問題になったら(b)を検討する |
| 3 | フェーズ5で`bullmq-official`が要件を満たさなかった場合 | (a) Node.js版のworkerをbridgeとして残す (b) PostgreSQLをキューにする方式を比較する (c) 別のキューへ移し、ジョブの状態を移管する | 今は決めない。計画 §11は、bridgeの継続を中間成果として認めている |

## 出典

確認日: 2026-11-13

- 版・公開日・MSRV・依存: crates.ioのAPI
  - <https://crates.io/api/v1/crates/bullmq-official>、<https://crates.io/api/v1/crates/bullmq-official/1.5.1/dependencies>
  - <https://crates.io/api/v1/crates/apalis>、<https://crates.io/api/v1/crates/apalis-redis>、<https://crates.io/api/v1/crates/apalis-redis/1.1.1/dependencies>
- BullMQのRust版の紹介: <https://docs.bullmq.io/rust/introduction>
- `bullmq-official` 1.5.1のドキュメント: <https://docs.rs/bullmq-official/1.5.1/bullmq/>
- `apalis-redis`のドキュメント: <https://docs.rs/apalis-redis/latest/apalis_redis/>
- Node.js版の`bullmq`の版と公開日: <https://registry.npmjs.org/bullmq>
- 冪等なジョブの指針（計画が参照する資料）: <https://docs.bullmq.io/patterns/idempotent-jobs>
- 現行: `packages/backend/package.json`、`packages/backend/src/queue/const.ts`（コミット`5e8cc3b2cd`）、棚卸しの`queue-jobs.csv`
- 未確認: `bullmq-official`が対応するNode.js版の版の範囲、遅延ジョブ・stalledの回復・ロックの更新の対応、`apalis-redis`のRedis上のキーの形式、現行のコードが使うBullMQの機能の一覧
