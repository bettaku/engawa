# ADR-0001: Rustバックエンドの配置とワークスペース構成

- 状態: 提案
- 作成日: 2026-11-13
- 更新: 2026-11-14（要判断の決定を記入。同日、決定に伴って出た#5・#6も決定）
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md) §3.1・§8.1、[ADR-0007](0007-toolchain-and-tls.md)、[ADR-0008](0008-legacy-backend-rs-branch.md)

## 背景

移行計画 §3.1は、候補配置を`packages/backend-rs/`とし、「まず一つのCargoパッケージにHTTP、業務処理、DB・外部接続のモジュールを置き、共有が実際に必要になった部分だけcrateに分ける」「Cargoのビルド・チェックはpnpmと別のCIジョブにし、必要な呼び出しだけルートスクリプトに追加する」としている。

現行リポジトリの事実は次のとおり。

- pnpmのワークスペースは`pnpm-workspace.yaml`でパッケージを1つずつ列挙している（`packages/*`のglobではない）。`packages/backend-rs/`を置いても、列挙しなければpnpmの対象にならない。
- `.gitignore`と`.dockerignore`に、Cargoの`target/`を除外する行はない。
- GitHub Actionsのworkflowは27本あり、Rustを扱うものはない。Dockerイメージは`linux/amd64`（`ubuntu-latest`）と`linux/arm64`（`ubuntu-24.04-arm`）を、それぞれのアーキテクチャのランナーでビルドしている（`.github/workflows/docker-develop.yml`、`release-artifacts.yml`）。
- 旧ブランチ`feat/backend-rs`は、リポジトリのルートに`Cargo.toml`（ワークスペース）と`Cargo.lock`を置き、`crates/engawa_*`の7クレートに分けていた。手で書いたRustは全体で約500行で、`engawa_backend`の`main`は`todo!()`、`engawa_cli`と`engawa_mfe`にRustの実装はなく、`engawa_migration`は生成されたひな形のままである（[ADR-0008](0008-legacy-backend-rs-branch.md)）。

## 検討した選択肢

### A. `packages/backend-rs/`に単一のCargoパッケージ（決定案）

`Cargo.toml`、`Cargo.lock`、`rust-toolchain.toml`を`packages/backend-rs/`に置く。ルートにCargoのファイルを置かない。

### B. ルートにCargoワークスペース、`crates/*`に複数クレート（旧ブランチの構成）

採らない。理由は次のとおり。

- 境界が分かる前にクレートを分けると、境界の引き直しのたびに公開範囲と依存の向きを直すことになる。旧ブランチは、動くサーバーがない段階で7クレートに分けており、クレート間の依存は3本（`engawa_backend`→`engawa_config`、`engawa_cli`→`engawa_config`・`engawa_model`）だけだった。分割が役に立ったかを判断できる材料がない。
- ルートに`Cargo.toml`があると、エディターやCIがリポジトリ全体をRustのプロジェクトとして扱う。フロントエンドだけを触る人にもRustのツールチェーンの影響が及ぶ。
- 計画 §8.1は、workflowの`paths`条件に`packages/backend-rs/**`を足す方針である。配置が`crates/`と`Cargo.toml`に分かれると、条件が増える。

### C. `packages/backend-rs/`にCargoワークスペースを置き、最初から複数クレート

採らない。Bの1点目と同じ理由による。単一パッケージから始めても、後でワークスペースに変えるのは`Cargo.toml`の変更とディレクトリの移動で済む。

### D. 別リポジトリ

採らない。混在期間は、契約のfixture、設定スキーマ（`packages/backend/config.schema.json`）、TypeORMのマイグレーションをNode.js版と同じコミットで揃える必要がある（計画 §4.1、§6）。リポジトリを分けると、この対応を別の仕組みで保証することになる。

## 決定案

1. Rustバックエンドを`packages/backend-rs/`に置く。Cargoパッケージは1つとし、HTTPサーバーとworkerは同じパッケージの別の起動モード（またはバイナリ）にする。パッケージ名とバイナリ名は`engawa-backend`、版は本体と独立に`0.x`から始める（要判断#1・#2。2026-11-14決定）。
2. `Cargo.toml`、`Cargo.lock`、`rust-toolchain.toml`は`packages/backend-rs/`に置く。ルートには置かない。
3. `pnpm-workspace.yaml`に`packages/backend-rs`を追加しない。`package.json`も置かない。
4. パッケージの中はモジュールで分ける。クレートへの分割は、次のどれかが実際に起きたときに、ADRを追加して行う。
   - 同じコードを別のバイナリ（運用CLIなど）が使い、依存を減らしたい
   - ビルド時間が計測で問題になり、分割で改善することを確かめた
   - 手続きマクロなど、技術的に別クレートが必要
5. CIはpnpmのジョブと別のworkflowにする。`packages/backend-rs/**`と、共通の契約・fixtureの配置先が変わったときに動かす。内容は計画 §8.1のとおり、format、Clippy、unit / integration、契約比較、依存監査、releaseビルドとする。`Cargo.lock`と違う依存でビルドしないよう、`--locked`を付ける。このworkflowは、`packages/backend-rs/`を作る最初のPRから必須チェックにする（要判断#3。2026-11-14決定）。
   - Dockerを使わないLinuxでのビルドも保証する（[ADR-0007](0007-toolchain-and-tls.md)の要判断#1。2026-11-14決定）ので、Dockerイメージのビルドとは別に、インストール手順のあるディストリビューションでreleaseビルドと起動の確認を行うジョブを置く。対象は、現行のドキュメント（`docs/src/content/docs/install/systemd-ubuntu.md`、`systemd-rhel.md`）が想定するUbuntu 24.04・Debian 12と、AlmaLinux 10・Rocky Linux 10・RHEL 10の系列とする。RHEL系はコンテナイメージの中でビルドする。どのイメージを代表にするかは[ADR-0007](0007-toolchain-and-tls.md)の検証で決める。このジョブは`amd64`だけで回す（[ADR-0007](0007-toolchain-and-tls.md)の要判断#6）。Debian 12は、Dockerのビルド（bookwormが土台）で兼ねられるならUbuntu 24.04で代表させる（同#8）。
   - このジョブはPRごとに回して始める。所要時間が10分を超えるようなら、`develop`へのmerge時と定期実行へ移す（要判断#6。2026-11-14決定）。
6. ルートの`package.json`には、開発者が日常的に使う呼び出しだけを足す。CIはCargoを直接呼ぶ。
7. `target/`を`.gitignore`と`.dockerignore`に追加する。

### 体制が1人であることへの対応（フェーズ1の範囲を絞る案）

Rustのコードを書いてレビューできる人は、現状で1人である（要判断#4。2026-11-14決定）。計画 §7の期間は「Rust経験者を含む専任開発者3名」を仮定しているので、そのままは当てはまらない。計画書は書き換えず、フェーズ1の進め方をここに案として書く。確定は、RUST-05の着手時に行う。

**1. フェーズ1を2段に分け、前半だけを先に完了させる。**

| 段 | 内容 |
| --- | --- |
| 1a（先に完了させる） | `packages/backend-rs/`と必須のCI（format、Clippy、試験、依存監査、releaseビルド）。設定の読み込みと、未対応の設定の検出。構造化ログ。PostgreSQLへの接続（読み取りだけ）。内部health。`api/ping`の互換試験。SIGTERMでの終了 |
| 1b（1aの後） | Redisへの接続（[ADR-0005](0005-redis-client.md)のキャッシュ・汎用のadapterだけ）。DB・Redisの停止と再接続、接続上限の試験。入口での振り分けと、旧版への切り戻し |
| フェーズ1では扱わない | WebSocket（`ws`機能を有効にしない）。Pub/Sub、タイムライン、リアクションのadapter。multipart、raw bodyの保持。外向きHTTP。内部RPC。`bullmq-official`の評価 |

1aは、DBとRedisの障害試験を含まないので、計画のフェーズ1の完了条件（依存停止・再接続・SIGTERM・接続上限の検証、無変更の旧版へ戻せる）を満たさない。1bまで終えて、はじめてフェーズ1の完了とする。

**2. 並行作業をしない。** 計画 §12は、RUST-08（書き込み・キュー・連合の難所の検証）をRUST-06〜07と並行できるとしている。1人では並行させず、RUST-05 → 06 → 07 → 08の順に進める。RUST-08のうち、`bullmq-official`の評価（[ADR-0006](0006-job-queue.md)）は、フェーズ5まで結果を使わないので最後に回す。

**3. 配布対象ごとのCIは、ビルドの確認から始める。** Dockerを使わないLinuxの保証（[ADR-0007](0007-toolchain-and-tls.md)）は、1aでは「releaseビルドが通り、起動して`api/ping`に応答する」ことまでを確かめる。ディストリビューションごとの結合試験は1bで足す。

**4. レビューを機械の検査で補う。** 書く人とレビューする人が同じになるので、次を最初のPRから入れる。

- Clippyの警告をエラーにする。`unsafe`を禁止する設定にし、必要になったら箇所を限定して理由を書く。
- 依存を足すPRには、ADRの「出典」と同じ形で、版、MSRV、公開日、確認日を書く。
- 1つのPRを小さく保つ。目安を決め、超えるときは分ける。
- 挙動の検査は、人が読むことではなく、契約のfixtureとの比較（RUST-03）に置く。fixtureのない挙動を実装しない。

**5. 計画の完了条件との差を記録する。** 計画 §10は「複数人がレビュー・リリース・障害対応できる」ことを完了条件にしている。1人のままでは、この条件を満たせない。2人目は、`GET /api/emojis`を本番候補にする前（RUST-07の前）までに確保する。確保できない場合は、RUST-07を「隔離環境での検証まで」に縮める（要判断#5。2026-11-14決定）。

## 採用前に検証すること

- [ ] `packages/backend-rs/`に`rust-toolchain.toml`を置いた状態で、ルートから`cargo --manifest-path`で呼んだときにツールチェーンの固定が効くか。効かない場合の呼び出し方（作業ディレクトリを移す、`cargo +版`を使う）を決める。rustupが設定ファイルを探す起点は未確認。
- [ ] `linux/amd64`と`linux/arm64`の両方のランナーで、Dockerのビルドステージとしてreleaseビルドが通るか。所要時間とキャッシュの効き方を測る。
- [ ] Renovate（`renovate.json5`）がサブディレクトリの`Cargo.toml`と`Cargo.lock`を更新対象にできるか。現行の設定にCargoの記述はない。
- [ ] Rustだけを変更したPRで、契約比較と混在E2Eが起動するか（計画 §8.1）。逆に、フロントエンドだけを変更したPRでRustのジョブが起動しないか。
- [ ] Ubuntu 24.04のランナーと、RHEL 10系のコンテナイメージで、releaseビルドと起動の確認ができるか。所要時間を測る。PRごとに回して始め、10分を超えるようなら`develop`へのmerge時と定期実行へ移す（要判断#6）。RHEL 10系の公式のコンテナイメージの有無は未確認。
- [ ] `check-spdx-license-id.yml`など、既存のリポジトリ全体を対象にするチェックが`.rs`と`Cargo.toml`をどう扱うか。

## 影響

- Dockerfileに、Rustのビルドステージと、成果物を実行イメージへコピーする手順が要る。混在期間は1つのイメージにNode.js版とRust版の両方が入る。イメージのサイズとビルド時間が増える。
- CIの必須チェックが増える。混在期間は既存のNode.jsのチェックも維持する（計画 §8.1）。Dockerを使わないLinuxでのビルドの確認が加わるので、Rustのジョブは、Dockerの2アーキテクチャに加えてディストリビューションの数だけ増える。
- 体制が1人の間は、フェーズ1を2段に分ける。フェーズ1の完了は、計画の目安（4〜6週）より遅れる見込みである。遅れの幅は、1aの実績から見積もる。
- 開発者は、Rustを触るときだけrustupを入れればよい。フロントエンドとNode.jsバックエンドの開発手順は変わらない。
- 後でクレートを分けるときは、モジュールの公開範囲（`pub(crate)`）を整理する作業が発生する。最初からモジュール間の依存の向きを一方向に保つことで、この費用を抑える。

## 要判断

| # | 判断すること | 選択肢 | 推奨 | 決定 | 決定日 |
| --- | --- | --- | --- | --- | --- |
| 1 | Cargoパッケージの版をどう付けるか | (a) engawa本体の版と揃える (b) 独立に`0.x`から始める | (b)。混在期間は本番の既定実装ではなく、本体の版と揃えると「同じ版なら同じ機能」と読まれる。Rustを既定にする段階（計画のフェーズ6）で本体の版に統合する | **決定**: (b)。`0.x`から始める | 2026-11-14 |
| 2 | パッケージ名とバイナリ名 | (a) `engawa-backend` (b) `backend-rs` (c) 旧ブランチの`engawa_backend` | (a)。Cargoの慣例はハイフン区切りで、ディレクトリ名に移行中の事情（`-rs`）を持ち込まない | **決定**: (a)。`engawa-backend` | 2026-11-14 |
| 3 | Rustのジョブを必須チェックにする時期 | (a) `packages/backend-rs/`を作るPRから (b) `GET /api/emojis`を本番候補にする時点（RUST-07）から | (a)。formatとClippyの違反を後からまとめて直すより安い | **決定**: (a)。最初のPRから必須にする | 2026-11-14 |
| 4 | Rustを触る担当者と、レビューできる人数 | 計画 §7は「Rust経験者を含む専任開発者3名」を仮定している | 判断材料がない。現在の体制を確認し、レビューできる人が1人だけなら、フェーズ1の範囲を先に絞る | **決定**: 現状は1人。フェーズ1の範囲を絞る（下の「体制が1人であることへの対応」） | 2026-11-14 |
| 5 | 2人目のレビュー担当者を、いつまでに確保するか（2026-11-14の決定で新しく出た項目） | (a) `GET /api/emojis`を本番候補にする前（RUST-07の前） (b) 認証付きの参照を移す前（フェーズ3の前） (c) 期限を決めない | (a)。本番のトラフィックを受ける時点で、障害対応できる人が1人だけの状態を避ける。確保できない場合は、RUST-07を「隔離環境での検証まで」に縮める | **決定**: (a)。RUST-07の前。確保できない場合は、RUST-07を隔離環境での検証までに縮める | 2026-11-14 |
| 6 | Dockerを使わないLinux向けのジョブを、PRごとに回すか（同上） | (a) PRごと (b) `develop`へのmerge時と定期実行 | 所要時間を測ってから決める。1aの間は(a)で始め、10分を超えるようなら(b)へ移す | **決定**: (a)で始める。所要時間を測り、10分を超えるようなら(b)へ移す | 2026-11-14 |

## 出典

確認日: 2026-11-13

- 移行計画 §3.1、§8.1（このリポジトリ）
- `pnpm-workspace.yaml`、`.github/workflows/docker-develop.yml`、`.github/workflows/release-artifacts.yml`（コミット`5e8cc3b2cd`）
- 旧ブランチ: `git show feat/backend-rs:Cargo.toml`（コミット`cc30d03b24`）
- インストール手順が想定するディストリビューション: `docs/src/content/docs/install/index.md`、`systemd-ubuntu.md`、`systemd-rhel.md`（コミット`5e8cc3b2cd`。2026-11-14確認）
