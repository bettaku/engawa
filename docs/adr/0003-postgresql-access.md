# ADR-0003: PostgreSQLアクセス

- 状態: 提案
- 作成日: 2026-11-13
- 更新: 2026-11-14（要判断の決定を記入）
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md) §3.2・§4.2・§6、[ADR-0007](0007-toolchain-and-tls.md)、[ADR-0008](0008-legacy-backend-rs-branch.md)

## 背景

現行はTypeORM 0.3.31と`pg` 8.16.3で、CIはPostgreSQL 15を使う。スキーマの事実は次のとおり。

- テーブルは75、DBへ書き込むコード上の位置は365ある（RUST-01の棚卸し）。
- 列名はキャメルケースで、SQLでは引用が要る（例: `note."userId"`）。
- 配列の列を持つモデルが23ファイル、`jsonb`の列を持つモデルが15ファイルある。PostgreSQLのenum型は12ある（旧ブランチが2025-11時点のスキーマから生成した`sea_orm_active_enums.rs`による。現在の数は未確認）。
- マイグレーションは`packages/backend/migration/`に407ファイルある。
- 接続には`statement_timeout`とreplicationの設定がある（`packages/backend/src/postgres.ts`）。`statement_timeout`の10秒は既定値で、設定の`db.extra.statement_timeout`で上書きできる（10秒を置いた後に`config.db.extra`を展開している）。
- 検索はPGroongaの演算子（`&@~`）を使う経路がある（`SearchService`）。チャートはテーブル名を実行時に決める（棚卸し §3.3）。

移行計画の制約は次のとおり。

- §6: 混在期間のDDLは既存のTypeORMマイグレーションを唯一の管理元とする。Rustの通常起動でスキーマを同期・変更しない。
- §4.2: RustのDB行型と公開API型を分ける。TypeORMのrelationやentityをそのまま公開データに置き換えない。
- §3.2: 第一候補はSQLx。確認する点は、配列・JSON・日時・enum・NULL・引用付き列名・索引の互換と、複雑なSQLの保守性。

候補の現状は次のとおり。

| クレート | 最新の安定版 | 公開日 | MSRV | 備考 |
| --- | --- | --- | --- | --- |
| `sqlx` | 0.9.0 | 2026-05-21 | 1.94.0 | |
| `sea-orm` | 2.0.4 | 2026-09-27 | 1.94.0 | `sqlx ^0.9.0`と`sea-query ~1.0.0`に依存する |
| `seaography` | 1.1.4 | 2025-02-14 | 1.70 | 2.0系は`2.0.0-rc.9`（プレリリース）まで |

`sqlx` 0.9.0の機能について、docs.rsで確認したこと。

- 既定で有効な機能は`any`、`json`、`macros`、`migrate`である。`postgres`、ランタイム、TLSは既定で無効で、明示的に選ぶ。
- ランタイムの機能に`runtime-tokio`がある。
- TLSの機能は`tls-native-tls`、`tls-rustls`、`tls-rustls-aws-lc-rs`、`tls-rustls-ring`、`tls-rustls-ring-native-roots`、`tls-rustls-ring-webpki`、`tls-none`である。`tls-rustls`は`tls-rustls-ring`（さらに`tls-rustls-ring-webpki`）を有効にする。
- 型の機能に`chrono`、`time`、`uuid`、`ipnetwork`などがある。

## 検討した選択肢

### A. SQLx（決定案）

SQLを直接書き、行を型に対応させる。

### B. SeaORM（旧ブランチの選択）

採らない。理由は次のとおり。

1. **スキーマの定義が二重になる。** 混在期間のスキーマはTypeORMのマイグレーションが唯一の管理元である（計画 §6）。SeaORMのエンティティは、列・型・関連をRust側にもう一度書いたものになり、マイグレーションのたびに両方を直す。旧ブランチの`engawa_model`は、sea-orm-codegenが生成した91ファイル・約6,600行で、生成元のスキーマは2025-11（4.16.0）のものである。
2. **索引と制約を表現できない部分が残る。** 旧ブランチの`engawa_model/TODO.md`は「SeaORM 1.xではコード側でインデックス管理しない」と書いている（2.x系での扱いは未確認）。同じTODOには`score`列や`channelId`列の削除、`policies`の正規化といったスキーマ変更の案があり、「既存スキーマを維持する」という計画 §1の方針と逆を向いていた。
3. **エンティティが公開データに漏れやすい。** 旧ブランチのエンティティは`Serialize`と`Deserialize`を導出している。計画 §4.2はDB行型と公開API型を分けると定めている。
4. **SQLが見えなくなる。** タイムライン、検索、チャートは、現行でもクエリビルダーや生のSQLで書いている。互換性の検証は「同じSQLを発行しているか」「同じ索引を使うか」で行うので、発行されるSQLがコードにそのまま書いてあるほうが比較しやすい。
5. **列名の対応を全列に書くことになる。** キャメルケースの列名のため、旧ブランチの`note.rs`はほぼ全列に`column_name`の属性を付けている。SQLを直接書く場合も引用は要るが、対応を書く場所がSQLの1か所で済む。
6. **Seaography（GraphQL）は使う場面がない。** 公開APIの契約にGraphQLはない。安定版は2025-02から更新されていない。
7. **後から部分的に足せる。** SeaORMはSQLxの上に作られている。管理画面のCRUDなど、ORMが明らかに向く範囲が出てきたら、そのときにADRを追加して検討できる。逆（SeaORMからSQLxへ）は書き直しになる。

### C. `tokio-postgres`（＋接続プール）

今回は比較していない。版と保守状況は未確認。SQLを直接書く点はSQLxと同じで、SQLxのコンパイル時の検査と接続プールが要件を満たさなかったときの代替になる。

### D. Diesel（＋非同期対応）

採らない。スキーマをRust側の定義（`schema.rs`）に写す点でBの1点目と同じ問題がある。版と保守状況は未確認。

## 決定案

1. PostgreSQLへのアクセスはSQLxとする。有効にする機能は`postgres`、`runtime-tokio`、TLS（[ADR-0007](0007-toolchain-and-tls.md)で決めるもの）、`json`、日時の型（下の要判断#1）、`macros`を候補とする。
2. `migrate`機能は有効にしない。Rustのバイナリにマイグレーションを実行する経路を入れない。最終的なマイグレーション実行系の移管（計画のフェーズ6）は、別のADRで決める。
3. 行の型はSQLごと、または用途ごとに定義し、公開API型へは明示的に変換する。行の型に`Serialize`を導出しない。
4. SQLは、コンパイル時に検査する書き方を既定にする。テーブル名を実行時に決めるもの（チャート）など、検査できないSQLは場所を限定し、結合テストで補う。コンパイル時の検査にDBが要るか、事前に保存した情報で代用できるかは、下の検証で確かめてから運用を決める。
5. 検査に使うDBは、既存のマイグレーションを順に適用した使い捨てDBとする（計画 §6）。TypeORMの`synchronize`で作ったDBを使わない。本番用の索引とテスト用の索引が違うためである。
6. 接続プールの上限は、Node.js版との合計で管理する（計画 §6）。Rust側の上限は設定で明示し、既定値に頼らない。

## 採用前に検証すること

RUST-05とRUST-06（`GET /api/emojis`）で確かめる。

- [ ] **型の対応**: 配列（`varchar[]`など）、`jsonb`、`timestamp with time zone`、PostgreSQLのenum型、NULL、数値（`smallint`、`integer`、`bigint`、`numeric`）を、現行と同じ値として読み書きできるか。enum型を文字列として読むときに、SQL側でキャストが要るか。
- [ ] **引用付きの列名**: キャメルケースの列名を、コンパイル時に検査するSQLでそのまま書けるか。行の型のフィールド名との対応の付け方を決める。
- [ ] **コンパイル時の検査の運用**: DBなしでビルドする方法（事前に保存したクエリ情報）の有無と、CIで「保存した情報がSQLと合っているか」を検査する方法。docs.rsの`sqlx`のマクロの説明で確認する。今回は未確認。
- [ ] **動的なSQL**: 条件によって`WHERE`や`ORDER BY`が変わるクエリ（ページングの`sinceId` / `untilId`、検索）の書き方。組み立て方を1つに決め、プレースホルダーの番号の付け間違いを防ぐ。
- [ ] **PGroonga**: `&@~`演算子を含むSQLを、コンパイル時の検査に通せるか。検査用のDBに拡張が要るか。
- [ ] **接続**: `statement_timeout`（既定の10秒と、`db.extra`で上書きした値の両方）、replication（読み取り先の振り分け）、接続の再確立、DB停止時の挙動（計画のフェーズ1の完了条件）。
- [ ] **接続の中継**: PgBouncerなどを挟む構成でのプリペアドステートメントの扱い。現行の運用で中継を使っているかは未確認。
- [ ] **発行されるSQLの比較**: `GET /api/emojis`で、TypeORMが発行するSQLとRustが発行するSQLの実行計画を比較する。

## 影響

- SQLを手で書く量が増える。365か所の書き込み位置を移すときは、TypeORMが暗黙に行っていること（`save`のSELECT、relationの読み込み、既定値）を1つずつ確認する必要がある。
- スキーマが変わると、該当するSQLがコンパイルエラーになる。これは意図した効果だが、マイグレーションを足すPRがRustのビルドを壊すので、マイグレーションとRustのSQLを同じPRで直す運用にする。
- `sqlx` 0.9.0のMSRVが1.94.0で、候補の中でもっとも高い。ツールチェーンの下限はこれで決まる（[ADR-0007](0007-toolchain-and-tls.md)）。
- SQLxは0.x系で、0.8から0.9のように破壊的変更を含む更新がある。DBへのアクセスをモジュールに閉じ込め、業務処理からSQLxの型を直接使わない。

## 要判断

| # | 判断すること | 選択肢 | 推奨 | 決定 | 決定日 |
| --- | --- | --- | --- | --- | --- |
| 1 | 日時の型 | (a) `chrono` (b) `time` | PoCで決める。決め手は、JavaScriptの`toISOString()`と同じ文字列（ミリ秒3桁、`Z`）を出しやすいか（[ADR-0004](0004-serialization.md)）。どちらもSQLxの機能として対応している | 保留（PoCで決める。RUST-05） | — |
| 2 | コンパイル時の検査をどこまで必須にするか | (a) 全SQLで必須、例外は一覧にする (b) 推奨にとどめる | (a)。例外（動的なテーブル名など）は場所を限定して一覧にする | **決定**: (a)。全SQLで必須、例外は一覧にする | 2026-11-14 |
| 3 | 管理画面のCRUDなど、ORMが向く範囲が出たときの扱い | (a) SQLxのまま書く (b) その範囲だけSeaORMを足す | フェーズ5で判断する。それまでは(a) | 保留（フェーズ5で決める）。それまでは(a) | — |

## 出典

確認日: 2026-11-13

- 版・公開日・MSRV・依存: crates.ioのAPI
  - <https://crates.io/api/v1/crates/sqlx>
  - <https://crates.io/api/v1/crates/sea-orm>、<https://crates.io/api/v1/crates/sea-orm/2.0.4/dependencies>
  - <https://crates.io/api/v1/crates/seaography>
- `sqlx` 0.9.0の機能一覧: <https://docs.rs/crate/sqlx/0.9.0/features>
- SQLxの概要（計画が参照する資料）: <https://docs.rs/sqlx/latest/sqlx/>
- 旧ブランチ: `git show feat/backend-rs:crates/engawa_model/TODO.md`、`crates/engawa_model/src/note.rs`（コミット`cc30d03b24`）
- 現行: `packages/backend/src/postgres.ts`、`packages/backend/src/models/`、`.github/workflows/test-backend.yml`（コミット`5e8cc3b2cd`）
- 未確認: SQLxのマクロがDBなしでビルドする方法の詳細、SeaORM 2.xの索引の扱い、`tokio-postgres`とDieselの版と保守状況、enum型の現在の数、本番での接続の中継の有無
