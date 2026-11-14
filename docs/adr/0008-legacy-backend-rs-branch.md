# ADR-0008: 旧ブランチ`feat/backend-rs`の扱い

- 状態: 提案
- 作成日: 2026-11-13
- 更新: 2026-11-14（要判断の決定を記入）
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md)、[ADR-0001](0001-layout-and-workspace.md)〜[ADR-0006](0006-job-queue.md)

## 背景

`feat/backend-rs`は、移行計画（2026-09-05）より前の2025-11に書かれた作業途中のブランチである。ローカルと`origin`の両方にあり、同じコミット`cc30d03b24`を指している。

### 概要

| 項目 | 内容 |
| --- | --- |
| コミット | 11。2025-11-08〜2025-11-23。メッセージはほぼ`wip` |
| 分岐元 | `1c9e68e41f`（2025-10-31）。`develop`との差は約1年分 |
| 差分 | 147ファイル、13,005行の追加、31行の削除 |
| 構成 | ルートに`Cargo.toml`（ワークスペース）と`Cargo.lock`（476パッケージ）。`crates/engawa_*`に7クレート、137ファイル |
| 版の指定 | `version = "4.16.0"`、`edition = "2024"`、`rust-version = "1.91.0"`、`license = "AGPL-3.0"` |
| 主な依存 | `sea-orm` 1.1.17（`seaography`機能付き）、`seaography` 1.1.4、`apalis` 0.7.3、`apalis-redis` 0.7.3、`axum` 0.8.6、`redis` 0.32.7（`r2d2`機能）、`tokio` 1.48.0（`full`）、`async-std` 1、`image` 0.25.8、`jxl-oxide` 0.12.5、`moka` 0.12.11、`toml` 0.9.8、`serde_yml` 0.0.12 |
| Rust以外の変更 | `Dockerfile`にFFmpeg 8.0をソースからビルドするステージ（約75行）を追加。`packages/backend/nsfw-model/`の7ファイルを削除 |

### 計画との食い違い

| 項目 | 旧ブランチ | 移行計画・ADRの決定案 |
| --- | --- | --- |
| 配置 | ルートのワークスペース、`crates/*`に7クレート | `packages/backend-rs/`に単一パッケージ（[ADR-0001](0001-layout-and-workspace.md)） |
| DB | SeaORMのエンティティとSeaORMのマイグレーション | SQLx。DDLはTypeORMのマイグレーションだけが管理する（[ADR-0003](0003-postgresql-access.md)、計画 §6） |
| スキーマ | 列の削除や正規化を予定（`engawa_model/TODO.md`） | 既存のスキーマを維持する（計画 §1） |
| ジョブ | apalis | Node.js / BullMQが管理する（[ADR-0006](0006-job-queue.md)） |
| 設定 | TOML。パスは環境変数`CONFIG_PATH`。`.env.production`を読む | 既存のYAMLと`CHERRYPICK_CONFIG_YML`の意味を維持する（計画 §6） |
| ランタイム | `tokio`と`async-std`の両方 | Tokioだけ（[ADR-0002](0002-async-runtime-http-websocket.md)） |
| 進め方 | 全体を書き直す前提（動く入口がない） | Node.js版と併存させ、機能単位で移す（計画 §1） |

### 中身

手で書いたRustは、全体で約500行である。残りは生成されたコードと文書である。

| クレート | ファイル | 中身 | 状態 |
| --- | --- | --- | --- |
| `engawa_backend` | `main.rs`（7行） | `fn main() { todo!() }` | 動かない |
| | `db/postgres.rs`（9行） | 接続先を直書きしたSeaORMの接続。呼び出し元なし | 動かない |
| | `queue/mod.rs` | 空 | — |
| | `service/image_process.rs`（89行） | `image`クレートによるWebP（可逆）・PNGへの変換とLanczos3での縮小 | 単体では動く見込み。試験なし |
| | `service/internal_storage.rs`（71行） | カレントディレクトリの`files/`への保存と削除。エラーは`Box<dyn Error>` | 単体では動く見込み。試験なし |
| `engawa_cli` | 4ファイル（計9行） | モジュールの宣言だけ | 空 |
| `engawa_config` | `server.rs`（132行） | 設定の構造体（6項目）とTOMLの読み込み。グローバルな`RwLock`に保持 | 現行の設定と互換なし |
| `engawa_mfe` | `syntax.pest`（150行） | MFMの文法定義（pest）。引用、検索、コードブロック、数式、リスト、URLなど | `lib.rs`が空で、文法を使うコードも試験もない |
| | `docs/syntax.md`（671行） | MFMの構文を日本語で説明した文書。ブロック5種とインライン構文の一覧 | 文書 |
| `engawa_migration` | ソース3ファイル | sea-orm-cliが生成したひな形。`Post`テーブルの例のまま、`up`と`down`は`todo!()` | 動かない |
| `engawa_model` | 91ファイル（約6,600行） | sea-orm-codegen 1.1.17が、2025-11時点のDBから生成したエンティティ。enumは12 | 生成物 |
| | `TODO.md`（13行） | スキーマ変更の案（`user.score`と`note.channelId`の削除、`role.policies`の正規化、`chatScope`のenum化） | メモ |
| `engawa_util` | `sql_like_escape.rs`（37行） | `\`、`%`、`_`の前に`\`を付ける。試験1件 | 動く。現行の`sql-like-escape.ts`と同じ規則 |
| | `radix.rs`（18行） | 正の整数をn進の文字列にする | 動く見込み。試験なし。負の数を渡すと空文字を返す |
| | `id/aidx.rs`（13行） | 定数3つ（`TIME2000`、`NODE_LENGTH`、`NOISE_LENGTH`）とカウンターの宣言だけ | 生成・解析の実装なし |
| | `id/`のほか5ファイル | `aid`、`meid`、`objectid`、`snowflake`、`ulid`。すべて空 | 空 |
| | `cache.rs`（30行） | Redisとメモリの2段のキャッシュ。`delete`だけ実装、`new`は`todo!()` | 動かない |
| | `sysinfo.rs`（20行） | 起動時にホスト名をログに出す | 途中 |

現行と突き合わせて分かったこと。

- `engawa_config`の`RedisConfig`は、用途別の接続を`redis.pubsub`、`redis.queue`、`redis.timeline`、`redis.reactions`の入れ子で持つ。現行の設定は、最上位の`redisForPubsub`、`redisForJobQueue`、`redisForTimelines`、`redisForReactions`である。検索のproviderも、旧ブランチは`postgres` / `meilisearch` / `elasticsearch`で、現行の`sqlLike` / `sqlPgroonga` / `meilisearch` / `elasticsearch`と違う。
- ID方式の列挙に`snowflake`があるが、現行の設定スキーマにはない。逆に、現行にある`meidg`がない。
- `aidx.rs`の3つの定数は、現行の`aidx.ts`と同じ値である。
- `cache.rs`のキー（`kvcache:{name}:{key}`）は、現行の`misc/cache.ts`と同じ形である。ただしprefixを付けていない。
- `internal_storage.rs`の保存先はカレントディレクトリが基準で、現行（ソースの位置が基準）と違う。返すURLも、現行は`config.url`を前に付ける。
- ソースの著作権表示が`SPDX-FileCopyright`で、リポジトリが検査している`SPDX-FileCopyrightText`と違う。ライセンスの識別子も、本体は`AGPL-3.0-only`である。

## 検討した選択肢

### A. ブランチを続きから使う（`develop`へrebaseして継続）

採らない。配置、DB、ジョブ、設定のすべてが決定案と違い、残せるのは下の表の数ファイルだけである。約1年分の差があるうえ、`Dockerfile`の変更と`nsfw-model`の削除というRustと無関係の変更が混ざっている。rebaseの手間に見合わない。

### B. 新しく作り、旧ブランチは参照だけにする（決定案）

### C. 何も参照せず、存在しないものとして扱う

採らない。`engawa_mfe/docs/syntax.md`と`engawa_model`は、後の作業の資料として使える（下の表）。

## 決定案

1. `packages/backend-rs/`は新しく作る。旧ブランチをmerge、rebase、cherry-pickしない。旧ブランチのコミット履歴を引き継がない。
2. 旧ブランチのコードを使うときは、下の表の候補に限り、必要になった時点で、現行の実装と突き合わせてから新しい構成の中に書き直す。書き直したコードには、現行の実装と同じ入出力を確かめる試験を付ける。
3. `Dockerfile`のFFmpegのビルドと`nsfw-model`の削除は、Rust移行と無関係なので、このADRでは扱わない。必要なら別のIssueにする。
4. ブランチ`feat/backend-rs`は、タグを付けてから消す（要判断#1。2026-11-14決定）。タグの名前は`archive/backend-rs-2025-11`を案とし、コミット`cc30d03b24`に付ける。実行するのは、このADRが「採用」になり、RUST-05の`packages/backend-rs/`が`develop`に入った後とする。対象はローカルと`origin`の両方で、`origin`のブランチの削除は元に戻しにくいので、実行のときに改めて指示を受ける。**2026-11-14の時点で、タグ付けも削除も実行していない。**
5. `syntax.md`は、MFMを扱う時点まで旧ブランチ（削除後はタグ）に置いたままにする（要判断#2）。`Dockerfile`のFFmpegのソースビルドと、`engawa_model/TODO.md`のスキーマ変更の案は、それぞれ別のIssueにする（要判断#3・#4）。Issueは、まだ作っていない。

### 流用の候補

| 候補 | 使い道 | 使う時期 | 条件・注意 |
| --- | --- | --- | --- |
| `engawa_util/src/sql_like_escape.rs` | そのままの規則で書き直す。37行で、移すというより書く量である | 検索・ユーザー名の前方一致を移すとき | 現行の`sqlLikeEscape`と同じ入出力を試験で確かめる。試験の入力を増やす（`\`、`_`、連続、空文字） |
| `engawa_util/src/radix.rs`と`id/aidx.rs`の定数 | ID生成の実装の出発点 | 書き込みを移す前（計画 §4.2のID試験） | 定数は現行と一致している。生成と解析は未実装なので、現行の`IdService`のfixtureを先に作る。`snowflake`は現行にないので作らない。`meidg`を足す |
| `engawa_mfe/docs/syntax.md` | MFMの入出力fixtureを作るときの、構文の一覧 | MFMの変換を扱うとき（計画 §3.2は、初期は既存処理への委譲を許容している） | 文書の正しさは、現行のMFMパーサーの挙動と照合していない。照合してから`docs/`へ移す |
| `engawa_mfe/src/syntax.pest` | MFMのパーサーをRustで書くと決めた場合の下書き | 同上 | 文法を使うコードも試験もない。動作は未確認。パーサーの方式（pestを使うか）は、その時点で別のADRにする |
| `engawa_model/`（生成されたエンティティ） | 「どの列が配列、JSON、enumか」を一覧する資料（[ADR-0003](0003-postgresql-access.md)の型の検証） | RUST-05 | コードとしては使わない。2025-11のスキーマなので、現在の列と違う可能性がある。現行のDBから列の一覧を取り直すほうが確実で、その場合この資料は要らない |
| `engawa_backend/src/service/image_process.rs` | `image`クレートでの変換の書き方の例 | 画像処理の代替を検証するとき（計画 §3.2は、初期は既存処理への委譲を許容している） | 現行のsharp / libvipsと出力（画質、大きさ、メタデータ）が同じかは未確認。WebPは可逆で出しており、現行の設定と違う可能性がある |

流用しないもの: `engawa_config`（形式とキーが現行と違う）、`engawa_migration`（ひな形。マイグレーションはRustで持たない）、`engawa_cli`（空）、`engawa_backend`の`main.rs`・`db/`・`queue/`、`engawa_util`の`cache.rs`・`sysinfo.rs`、`internal_storage.rs`（保存先とURLが現行と違う）、ルートの`Cargo.toml`と`Cargo.lock`（依存の選定が違う）。

## 採用前に検証すること

- [ ] 上の表の候補のうち、`syntax.md`を現行のMFMパーサーの挙動と照合する人と時期を決める。決まらないなら、候補から外す。
- [ ] `feat/backend-rs`を参照しているIssue、PR、文書、CIの設定がないかを確かめる（ブランチを消す場合）。今回は、リポジトリのworkflowにこのブランチ名の参照がないことだけを確認した。IssueとPRは未確認。
- [ ] `engawa_model/TODO.md`のスキーマ変更の案と、`Dockerfile`のFFmpegのソースビルドについて、Issueを作る（要判断#3・#4の決定）。
- [ ] ブランチを消す前に、タグが`origin`にあり、タグから流用の候補（`crates/engawa_mfe/docs/syntax.md`など）を読めることを確かめる。

## 影響

- 旧ブランチに費やした作業のうち、コードとして引き継ぐものはほぼない。引き継ぐのは、MFMの構文の文書と、IDとエスケープの小さな関数の考え方である。
- 旧ブランチが選んでいた技術（SeaORM、apalis、TOMLの設定）を採らない理由は、それぞれのADRに書いた。同じ選択を後から提案する人が、経緯を追える。
- ブランチを消すと、ブランチ名からはコミットにたどれなくなる。タグを付けてから消すので、内容は残る。タグを`origin`へpushしないままブランチを消すと、`origin`から内容が失われる。

## 要判断

| # | 判断すること | 選択肢 | 推奨 | 決定 | 決定日 |
| --- | --- | --- | --- | --- | --- |
| 1 | ブランチ`feat/backend-rs`をどうするか | (a) そのまま残す (b) タグ（例: `archive/backend-rs-2025-11`）を付けてからブランチを消す (c) タグを付けずに消す | (b)。ブランチの一覧に残ると、これが現在のRust実装だと誤解される。タグにすれば、流用の候補を後から参照できる。消すのは、このADRが「採用」になり、RUST-05の`packages/backend-rs/`が`develop`に入ってからでよい | **決定**: (b)。タグを付けてからブランチを消す。まだ実行していない | 2026-11-14 |
| 2 | `syntax.md`を今すぐ`docs/`へ移すか | (a) MFMを扱う時点まで待つ (b) 今、参考資料として移す | (a)。現行の挙動と照合していない文書を`docs/`に置くと、仕様として読まれる | **決定**: (a)。MFMを扱う時点まで待つ | 2026-11-14 |
| 3 | `Dockerfile`のFFmpegのソースビルドを取り込むか | (a) 取り込まない (b) 別のIssueで検討する | (b)。目的（対応コーデック、版の固定）がコミットメッセージから読み取れない。書いた本人に意図を確認する | **決定**: (b)。別のIssueで検討する | 2026-11-14 |
| 4 | `engawa_model/TODO.md`のスキーマ変更の案 | (a) 捨てる (b) Issueに残す | (b)。未使用の列の削除は、移行計画の「切り戻し期間の終了後に行う非互換変更」（§6）の候補になる | **決定**: (b)。Issueに残す | 2026-11-14 |

## 出典

確認日: 2026-11-13

- 旧ブランチ（コミット`cc30d03b24`）
  - `git show feat/backend-rs:Cargo.toml`
  - `git ls-tree -r --name-only feat/backend-rs crates/`
  - `git log develop..feat/backend-rs`、`git diff --stat $(git merge-base develop feat/backend-rs) feat/backend-rs`
  - 各ファイルの中身は`git show feat/backend-rs:crates/...`で読んだ。`engawa_model`の個々のエンティティは、`note.rs`と`sea_orm_active_enums.rs`だけを読み、残りは行数とファイル名で判断した
- 現行（コミット`5e8cc3b2cd`）: `packages/backend/src/misc/sql-like-escape.ts`、`packages/backend/src/misc/id/aidx.ts`、`packages/backend/src/misc/cache.ts`、`packages/backend/src/core/InternalStorageService.ts`、`packages/backend/config.schema.json`
- 未確認: `image_process.rs`と現行のsharpの出力の差、`syntax.md`・`syntax.pest`と現行のMFMパーサーの一致、ブランチを参照するIssue・PRの有無、`Dockerfile`の変更の意図
