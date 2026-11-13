# ADR-0007: ツールチェーンとTLS実装

- 状態: 提案
- 作成日: 2026-11-13
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md) §3.2・§8.1・§11、[ADR-0001](0001-layout-and-workspace.md)、[ADR-0003](0003-postgresql-access.md)、[ADR-0005](0005-redis-client.md)

## 背景

移行計画 §3.2は、「ライブラリのバージョン、MSRV、TLS実装、依存機能は着手時に再確認してADRと`rust-toolchain.toml`、`Cargo.lock`に固定する」と定めている。§11は、対応するCPU・OS・ネイティブ依存と配布サイズを未確定事項に挙げ、「現行配布対象を一覧化し、CIでRustバイナリとFFmpeg等を含むイメージを検証」するとしている。

### Rustの版

| 項目 | 値 | 根拠 |
| --- | --- | --- |
| 安定版の最新 | 1.100.0（2026-11-09のコミット。チャネルの更新日は2026-11-12） | 安定版チャネルのマニフェスト |
| ローカルの開発環境 | rustc 1.94.0（2026-03-02）、cargo 1.94.0 | `rustc --version` |
| 2024 editionが安定した版 | 1.85.0 | Edition Guide |
| 旧ブランチの指定 | `rust-version = "1.91.0"`、`edition = "2024"`、`resolver = "2"` | `feat/backend-rs`の`Cargo.toml` |

### 候補のクレートが要求する最低版（MSRV）

| クレート | 版 | MSRV |
| --- | --- | --- |
| `sqlx` | 0.9.0 | **1.94.0** |
| `redis` | 1.8.1 | 1.88 |
| `serde_with` | 3.24.0 | 1.88 |
| `cargo-deny` / `cargo-audit`（CIの道具） | 0.20.2 / 0.23.0 | 1.88 |
| `tokio` | 1.54.1 | 1.85 |
| `tokio-tungstenite` | 0.30.0 | 1.85 |
| `bullmq-official`（評価候補） | 1.5.1 | 1.85 |
| `reqwest`（外向きHTTPの候補。未選定） | 0.13.5 | 1.85.0 |
| `axum` | 0.8.9 | 1.80 |
| `serde_json` | 1.0.154 | 1.71 |
| `rustls` | 0.23.46 | 1.71 |

下限は`sqlx` 0.9.0の1.94.0で決まる。ローカルの1.94.0は、この下限とちょうど同じである。

### TLS

現行のNode.js版は、OpenSSL（Node.jsに同梱）でTLSを扱う。Rust版でTLSを使うのは、外向きの接続（PostgreSQL、Redis、連合・Webhook・URLプレビューなどの外向きHTTP、S3互換ストレージ）である。内向きのTLSを入口（リバースプロキシ）で終端するか、バックエンドで終端する構成があるかは未確認。

| クレート | 最新の安定版 | 公開日 | MSRV | 備考 |
| --- | --- | --- | --- | --- |
| `rustls` | 0.23.46 | 2026-10-14 | 1.71 | `0.24.0-dev.3`がプレリリースにある |
| `tokio-rustls` | 0.26.6 | 2026-09-28 | 1.71 | |
| `aws-lc-rs` | 1.19.0 | 2026-10-28 | 1.71.0 | `rustls`の既定の暗号実装 |
| `ring` | 0.17.14 | 2025-03-11 | 1.66.0 | `rustls`の任意の暗号実装 |
| `native-tls` | 0.2.18 | 2026-02-18 | 1.80 | OSのTLS実装を使う |

公式資料で確認したこと。

- `rustls`は既定で`aws-lc-rs`を暗号の実装に使う。`ring`は機能を有効にすると使える。既定の機能を外すと`aws-lc-rs`への依存がなくなる。
- `rustls`のドキュメントは、`aws-lc-rs`には「cmakeなどの追加のビルド時の依存がある」と書いている。一方、`aws-lc-rs`の要件のページは、FIPSでない通常の構成ではC / C++コンパイラーが必要で、CMake、bindgen、Goは不要としている。2つの記述が食い違うので、実際のビルド環境で確かめる。
- `sqlx` 0.9.0のTLSの機能は、`tls-rustls-aws-lc-rs`、`tls-rustls-ring`（ルート証明書の違いで`-native-roots`と`-webpki`）、`tls-native-tls`、`tls-none`である。`tls-rustls`は`ring`のほうを選ぶ。
- `redis` 1.8.1のTLSの機能は、`tls-rustls`（Tokioでは`tokio-rustls-comp`）、`tls-rustls-webpki-roots`、`tls-native-tls`である。`tls-rustls`がどちらの暗号実装を使うかは未確認。
- `sqlx-core` 0.9.0、`redis` 1.8.1、`reqwest` 0.13.5は、いずれも`rustls`の0.23系に依存する。

### 配布対象

現行のDockerイメージは、`node:24.19.0-bookworm`（実行は`-slim`）を土台に、`linux/amd64`と`linux/arm64`を、それぞれのアーキテクチャのランナーでビルドしている。Dockerを使わない配布（systemd、Helm）と、開発者のOS（macOS、WSL）でのビルドの要否は、一覧になっていない。

## 検討した選択肢

### ツールチェーンの固定

- **A. `rust-toolchain.toml`で安定版の特定の版に固定し、`Cargo.toml`の`rust-version`を同じ版にする（決定案）。**
- B. `stable`を追従する（版を固定しない）。採らない。ビルドする日によってコンパイラーとClippyの指摘が変わり、CIが理由なく落ちる。計画 §3.2の「固定する」に反する。
- C. 依存の下限（1.94.0）に固定し、上げない。採らない。配布するのはバイナリで、利用者が古いコンパイラーでビルドする事情がない。古い版に留まる利点がなく、依存の更新で下限が上がるたびに作業が止まる。
- D. nightlyを使う。採らない。安定版で足りない機能は今のところない。

### TLS

- **A. `rustls`に統一し、暗号の実装を1つにそろえる（決定案）。**
- B. `native-tls`（Linuxでは OpenSSL）。採らない。実行イメージにOpenSSLの共有ライブラリが要り、ビルドにヘッダーが要る。土台のイメージの更新でTLSの挙動が変わる。ただし、現行のNode.js版（OpenSSL）で通っている接続先が`rustls`で拒否される場合の退避先として残す（下の検証）。
- C. クレートごとに既定のTLSを使う。採らない。`sqlx`の`tls-rustls`は`ring`、`rustls`の既定は`aws-lc-rs`なので、何も指定しないと2つの暗号実装が同じバイナリに入る。

## 決定案

1. **edition**は2024とする。
2. **ツールチェーン**は、`packages/backend-rs/rust-toolchain.toml`で安定版の特定の版（`1.x.y`の形）に固定する。`rustfmt`と`clippy`を同じファイルで指定する。固定する版は、RUST-05の着手時点の安定版の最新とする。この文書の確認日の時点では1.100.0である。
3. **MSRV**（`Cargo.toml`の`rust-version`）は、固定したツールチェーンと同じ版にする。古いコンパイラーでのビルドは保証しない。
4. **更新**は、ツールチェーンと依存のどちらも、専用のPRで行う。機能のPRに混ぜない。安定版が出るたびに上げる義務は設けず、上げる間隔は下の要判断#2で決める。
5. **`Cargo.lock`**をコミットする。CIとDockerのビルドは`--locked`を付け、`Cargo.lock`と違う依存でビルドしない。
6. **依存の監査**（計画 §8.1）をCIに入れる。脆弱性の告知と、ライセンス（本体はAGPL-3.0-only）の両立を検査する。道具は`cargo-deny`を第一候補とする。
7. **TLS**は`rustls`に統一する。`sqlx`、`redis`、外向きHTTPのクレートで、`rustls`を使う機能を明示的に選び、既定の機能に任せない。
8. **暗号の実装**は、プロセス全体で1つにする。第一候補は`aws-lc-rs`（`rustls`の既定）とし、下の検証で`linux/amd64`と`linux/arm64`のビルドを確かめてから確定する。`ring`は、`aws-lc-rs`のビルドが配布対象で成立しなかった場合の代替とする。
9. **ルート証明書**は、接続先の種類で分けて決める。連合など不特定の相手への外向きHTTPと、利用者が用意したDB・Redis（自前の認証局を使うことがある）では要件が違う。方式（OSの証明書ストア、同梱の証明書、設定で渡す証明書）は検証で決める。

## 採用前に検証すること

RUST-05で確かめる。

- [ ] **`aws-lc-rs`のビルド**: `node:24.19.0-bookworm`系のビルドステージ、または公式のRustイメージで、`linux/amd64`と`linux/arm64`の両方がビルドできるか。必要な道具（Cコンパイラー、CMakeの要否）を記録する。公式のRustイメージに、固定する版のタグがあるかは未確認。
- [ ] **暗号の実装が1つか**: `cargo tree`で、`aws-lc-rs`と`ring`の両方が入っていないかを確かめる。入る場合は、どのクレートのどの機能が引き込んでいるかを特定する。CIで検査できるようにする。
- [ ] **`rustls`の重複**: `rustls`が1つの版に解決されるか。
- [ ] **現行の接続先との互換**: 現行の設定でTLSを使っているPostgreSQLとRedisに、`rustls`で接続できるか。自前の認証局、古いTLSの版、証明書の検証を無効にする設定（現行の設定スキーマにあるか未確認）の扱いを決める。
- [ ] **依存解決とMSRV**: 2024 editionで、依存の解決が`rust-version`を考慮するか。考慮する場合、`rust-version`を固定した版にしておけば、それを超えるMSRVの依存が選ばれないか。今回は未確認。
- [ ] **ビルド時間とキャッシュ**: 両方のアーキテクチャでのreleaseビルドの時間と、CIのキャッシュの効き方（[ADR-0001](0001-layout-and-workspace.md)）。
- [ ] **バイナリの大きさと実行イメージ**: 実行イメージに要る共有ライブラリ（glibcの版）と、イメージの大きさの増分（計画 §11）。
- [ ] **ライセンスの検査**: `cargo-deny`で、依存のライセンスがAGPL-3.0-onlyの配布と両立するかを検査できるか。`aws-lc-rs`（`ISC AND (Apache-2.0 OR ISC)`）と`ring`（`Apache-2.0 AND ISC`）を含める。

RUST-08または連合の移行時に確かめる。

- [ ] **外向きHTTPのTLS**: 連合先のサーバーとの接続で、`rustls`が対応しない暗号スイートやTLSの版を使う相手がどれだけあるか。現行の配送の失敗ログと突き合わせる。
- [ ] **内向きのTLS**: バックエンドでTLSを終端する構成をサポートするか。

## 影響

- 開発者は、rustupを入れれば`rust-toolchain.toml`の版が自動で使われる。ローカルの1.94.0は、固定する版がそれより新しい場合、rustupが新しい版を取得する。
- ツールチェーンを上げるPRでは、Clippyの新しい指摘への対応が発生する。
- `aws-lc-rs`を採ると、ビルドにCコンパイラーが要る。純粋なRustだけのビルドにはならない。
- `rustls`は、OpenSSLが受け入れる古い設定の一部を受け入れない可能性がある。Node.js版で動いている構成がRust版で接続できない、という差が出うる。差は「Rust版で未対応の設定」として起動時に検出する（計画 §6）。
- 依存の版を完全一致で指定するクレート（`bullmq-official`。[ADR-0006](0006-job-queue.md)）を採ると、`tokio`や`serde`の版を自由に上げられなくなる。

## 要判断

| # | 判断すること | 選択肢 | 推奨 |
| --- | --- | --- | --- |
| 1 | 対応するCPU・OS | (a) Dockerイメージの`linux/amd64`と`linux/arm64`（glibc）だけを保証する (b) Dockerを使わないLinuxでのビルドも保証する (c) musl（Alpine）や、開発用にmacOSでのビルドも保証する | (a)を保証の範囲にし、macOSとWSLでの開発用ビルドは「CIで確かめないが、壊れたら直す」とする。現行の配布対象の一覧（計画 §11）を作ってから確定する |
| 2 | ツールチェーンを上げる間隔 | (a) 安定版が出るたび（6週間ごと） (b) 四半期ごと (c) 依存が要求したときだけ | (b)。加えて、依存のMSRVが上がったときと、コンパイラーのセキュリティ修正が出たときに上げる |
| 3 | 最初に固定する版 | (a) 着手時点の最新（今なら1.100.0） (b) ローカルにある1.94.0 | (a)。1.94.0は`sqlx`の下限とちょうど同じで、次に依存を上げたときに足りなくなる見込みが高い |
| 4 | 暗号の実装 | (a) `aws-lc-rs` (b) `ring` | 検証の結果で決める。両方のアーキテクチャでビルドできれば(a)。`ring`は最後の公開が2025-03-11で、`rustls`の既定から外れている |
| 5 | 依存の更新の自動化 | (a) RenovateでCargoも対象にする (b) 手で上げる | (a)。現行の`renovate.json5`にCargoの記述がないので、設定を足す。まとめ方（`tokio`系、`rustls`系を1つのPRに）は別に決める |

## 出典

確認日: 2026-11-13

- 安定版の最新: <https://static.rust-lang.org/dist/channel-rust-stable.toml>
- 2024 edition: <https://doc.rust-lang.org/edition-guide/rust-2024/index.html>
- 版・公開日・MSRV・依存: crates.ioのAPI
  - <https://crates.io/api/v1/crates/rustls>、<https://crates.io/api/v1/crates/tokio-rustls>
  - <https://crates.io/api/v1/crates/aws-lc-rs>、<https://crates.io/api/v1/crates/ring>、<https://crates.io/api/v1/crates/native-tls>
  - <https://crates.io/api/v1/crates/sqlx-core/0.9.0/dependencies>、<https://crates.io/api/v1/crates/redis/1.8.1/dependencies>、<https://crates.io/api/v1/crates/reqwest/0.13.5/dependencies>
  - <https://crates.io/api/v1/crates/cargo-deny>、<https://crates.io/api/v1/crates/cargo-audit>
  - そのほかのクレートは、それぞれのADRの出典を参照
- `rustls`の暗号の実装とビルドの要件: <https://docs.rs/rustls/0.23.46/rustls/>
- `aws-lc-rs`のビルドの要件: <https://aws.github.io/aws-lc-rs/requirements/index.html>
- `sqlx`と`redis`のTLSの機能: <https://docs.rs/crate/sqlx/0.9.0/features>、<https://docs.rs/crate/redis/1.8.1/features>
- 現行: `Dockerfile`、`.github/workflows/docker-develop.yml`、`renovate.json5`（コミット`5e8cc3b2cd`）
- 未確認: `aws-lc-rs`のビルドにCMakeが要るか（2つの資料が食い違う）、`redis`の`tls-rustls`が使う暗号の実装、2024 editionの依存解決がMSRVを考慮するか、公式のRustイメージのタグ、内向きのTLSを終端する場所、現行の設定でのTLSの利用状況、Docker以外の配布対象
