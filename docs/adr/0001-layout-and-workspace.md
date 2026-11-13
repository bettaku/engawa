# ADR-0001: Rustバックエンドの配置とワークスペース構成

- 状態: 提案
- 作成日: 2026-11-13
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

1. Rustバックエンドを`packages/backend-rs/`に置く。Cargoパッケージは1つとし、HTTPサーバーとworkerは同じパッケージの別の起動モード（またはバイナリ）にする。
2. `Cargo.toml`、`Cargo.lock`、`rust-toolchain.toml`は`packages/backend-rs/`に置く。ルートには置かない。
3. `pnpm-workspace.yaml`に`packages/backend-rs`を追加しない。`package.json`も置かない。
4. パッケージの中はモジュールで分ける。クレートへの分割は、次のどれかが実際に起きたときに、ADRを追加して行う。
   - 同じコードを別のバイナリ（運用CLIなど）が使い、依存を減らしたい
   - ビルド時間が計測で問題になり、分割で改善することを確かめた
   - 手続きマクロなど、技術的に別クレートが必要
5. CIはpnpmのジョブと別のworkflowにする。`packages/backend-rs/**`と、共通の契約・fixtureの配置先が変わったときに動かす。内容は計画 §8.1のとおり、format、Clippy、unit / integration、契約比較、依存監査、releaseビルドとする。`Cargo.lock`と違う依存でビルドしないよう、`--locked`を付ける。
6. ルートの`package.json`には、開発者が日常的に使う呼び出しだけを足す。CIはCargoを直接呼ぶ。
7. `target/`を`.gitignore`と`.dockerignore`に追加する。

## 採用前に検証すること

- [ ] `packages/backend-rs/`に`rust-toolchain.toml`を置いた状態で、ルートから`cargo --manifest-path`で呼んだときにツールチェーンの固定が効くか。効かない場合の呼び出し方（作業ディレクトリを移す、`cargo +版`を使う）を決める。rustupが設定ファイルを探す起点は未確認。
- [ ] `linux/amd64`と`linux/arm64`の両方のランナーで、Dockerのビルドステージとしてreleaseビルドが通るか。所要時間とキャッシュの効き方を測る。
- [ ] Renovate（`renovate.json5`）がサブディレクトリの`Cargo.toml`と`Cargo.lock`を更新対象にできるか。現行の設定にCargoの記述はない。
- [ ] Rustだけを変更したPRで、契約比較と混在E2Eが起動するか（計画 §8.1）。逆に、フロントエンドだけを変更したPRでRustのジョブが起動しないか。
- [ ] `check-spdx-license-id.yml`など、既存のリポジトリ全体を対象にするチェックが`.rs`と`Cargo.toml`をどう扱うか。

## 影響

- Dockerfileに、Rustのビルドステージと、成果物を実行イメージへコピーする手順が要る。混在期間は1つのイメージにNode.js版とRust版の両方が入る。イメージのサイズとビルド時間が増える。
- CIの必須チェックが増える。混在期間は既存のNode.jsのチェックも維持する（計画 §8.1）。
- 開発者は、Rustを触るときだけrustupを入れればよい。フロントエンドとNode.jsバックエンドの開発手順は変わらない。
- 後でクレートを分けるときは、モジュールの公開範囲（`pub(crate)`）を整理する作業が発生する。最初からモジュール間の依存の向きを一方向に保つことで、この費用を抑える。

## 要判断

| # | 判断すること | 選択肢 | 推奨 |
| --- | --- | --- | --- |
| 1 | Cargoパッケージの版をどう付けるか | (a) engawa本体の版と揃える (b) 独立に`0.x`から始める | (b)。混在期間は本番の既定実装ではなく、本体の版と揃えると「同じ版なら同じ機能」と読まれる。Rustを既定にする段階（計画のフェーズ6）で本体の版に統合する |
| 2 | パッケージ名とバイナリ名 | (a) `engawa-backend` (b) `backend-rs` (c) 旧ブランチの`engawa_backend` | (a)。Cargoの慣例はハイフン区切りで、ディレクトリ名に移行中の事情（`-rs`）を持ち込まない |
| 3 | Rustのジョブを必須チェックにする時期 | (a) `packages/backend-rs/`を作るPRから (b) `GET /api/emojis`を本番候補にする時点（RUST-07）から | (a)。formatとClippyの違反を後からまとめて直すより安い |
| 4 | Rustを触る担当者と、レビューできる人数 | 計画 §7は「Rust経験者を含む専任開発者3名」を仮定している | 判断材料がない。現在の体制を確認し、レビューできる人が1人だけなら、フェーズ1の範囲を先に絞る |

## 出典

確認日: 2026-11-13

- 移行計画 §3.1、§8.1（このリポジトリ）
- `pnpm-workspace.yaml`、`.github/workflows/docker-develop.yml`、`.github/workflows/release-artifacts.yml`（コミット`5e8cc3b2cd`）
- 旧ブランチ: `git show feat/backend-rs:Cargo.toml`（コミット`cc30d03b24`）
