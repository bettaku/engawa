# 基準負荷の計測環境（RUST-02）

Rust移行の前後で同じ条件の計測をくり返すための環境。目的・指標・結果は [docs/rust-migration/baseline/README.md](../../../docs/rust-migration/baseline/README.md) にまとめる。

Docker のコンテナで CPU とメモリに上限をかけ、Engawa・PostgreSQL・Redis・k6 を同じネットワークで動かす。結果はコンテナの cgroup（CPU時間・匿名メモリ）、k6（応答時間・失敗率）、`pg_stat_statements`（DBの文と実行時間）から取る。

## 必要なもの

- Docker（Docker Desktop の場合は、計測で使う CPU とメモリの合計より多く割り当てる。既定の構成は CPU 7・メモリ 4.5GB を使う）
- Node.js（`seed.mjs` と `summarize.mjs` をホストで動かす）
- 初回だけ `grafana/k6`・`postgres:15-alpine`・`redis:7-alpine` のイメージを取得する

## 手順

```sh
cd packages/backend/test-baseline
cp env.example .env           # 必要なら上限を変える
./run.sh build                # 現在のコミットから engawa-baseline:local を作る（10〜20分）
./run.sh seed small           # API でデータを投入し、snapshots/small.dump（PostgreSQL）と small.rdb（Redis）を取る
./run.sh measure emojis_anon 50 60s warm
./run.sh matrix 25 50 100     # 全シナリオ × 到着率。50rps と cold は3回ずつ。最後に results/summary.md（中央値）と runs.md（1回ずつ）を作る（約1時間50分）
./run.sh down
```

一度 `seed` したら、次からは `./run.sh restore small` でスナップショットから戻す。Redis も戻すので、タイムラインは本番と同じく fan-out の一覧から読まれる（Redis を戻さないと DB へのフォールバックの経路で測ることになる）。コミットを変えて比べるときは、`build` だけやり直して同じスナップショットを使う（マイグレーションが増えた場合は `restore` の後の起動で当たる）。

## シナリオ

[k6/baseline.js](k6/baseline.js) の `ENDPOINTS`。

| 名前 | 要求 | 意図 |
| --- | --- | --- |
| `emojis_anon` | `GET /api/emojis`（認証なし） | RUST-06 の最初の対象 |
| `meta_anon` | `POST /api/meta` | 匿名の参照。キャッシュが効く |
| `ltl_anon` | `POST /api/notes/local-timeline` | 匿名のタイムライン |
| `notes_show_anon` | `POST /api/notes/show` | 公開ノート1件の参照 |
| `users_show_anon` | `POST /api/users/show` | 利用者1人の参照 |
| `htl_auth` | `POST /api/notes/timeline` | 認証付きのタイムライン |
| `i_auth` | `POST /api/i` | 認証付きの自分の情報 |
| `notifications_auth` | `POST /api/i/notifications` | 認証付きの通知 |
| `mix` | 上の重み付き混合 | 重みは `fixture/weights.json`（本番ログから作る）。なければ仮の重み |

到着率は固定する（constant-arrival-rate）。サーバーが遅くなっても要求の数は減らず、処理しきれない分は「取りこぼし（dropped）」として出る。取りこぼしが出た計測は、その到着率でサーバーが飽和したことを示す。

## 重みを本番に合わせる

本番のアクセスログを [scripts/rust-baseline/analyze-access-log.mjs](../../../scripts/rust-baseline/analyze-access-log.mjs) で集計し、出力の `weights.json` を `fixture/weights.json` に置く。

```sh
node scripts/rust-baseline/analyze-access-log.mjs --out /tmp/rb access.log access.log.1.gz
cp /tmp/rb/weights.json packages/backend/test-baseline/fixture/weights.json
```

集計スクリプトは IP アドレス・User-Agent・Referer・クエリの値を読まずに捨てる。ログそのものはリポジトリに入れない。

## 規模を合わせる

`seed.mjs` の `SCALES` を本番の件数に近づける。本番の DB で次を数え、比率（利用者あたりのノート数、フォロー数など）を合わせる。

```sql
SELECT (SELECT count(*) FROM "user" WHERE host IS NULL) AS local_users,
       (SELECT count(*) FROM note WHERE "userHost" IS NULL) AS local_notes,
       (SELECT count(*) FROM following WHERE "followerHost" IS NULL) AS local_follows,
       (SELECT count(*) FROM emoji WHERE host IS NULL) AS local_emojis;
```

## 結果のファイル

`results/<commit>-<規模>-<シナリオ>-<到着率>rps-<cache>.*`

| ファイル | 中身 |
| --- | --- |
| `.json` | まとめ。`summarize.mjs` が作る |
| `.k6.json` | k6 の計測区間の値（エンドポイント別） |
| `.samples.tsv` | web・db・redis の累積 CPU 時間と匿名メモリ（1秒ごと。時刻は Docker VM の uptime 秒） |
| `.web.log` | 計測区間の web コンテナのログ |
| `.procs.tsv` | 計測直後の web コンテナ内のプロセスごとの RSS と最大 RSS（kB） |
| `.pgss.tsv` | 計測区間の `pg_stat_statements` 上位40文 |

同じ条件で2回目以降を測ると、名前の末尾に `-2`、`-3` … が付く。
| `.env` | コミット、イメージ、上限、ホスト |

`results/` と `snapshots/` は git に入れない。残す結果は docs 側に転記する。

## 指標の定義

- **web CPU ms/要求**: 計測区間の web コンテナの CPU 時間から、直前10秒の待機時の CPU 使用率×区間長を引き、成功した要求数で割る。移行計画 §8.3 の「CPU / 成功要求」。
- **web anon 最大**: 計測区間の cgroup `memory.stat` の `anon` の最大。ページキャッシュを含まない、プロセスの RSS に近い値。コンテナ全体なので、`pnpm run` の起動ラッパー（2プロセスで約250MiB）も含む。
- **Engawa RSS**: `.procs.tsv` のうち `Engawa (master)` と `Engawa (worker)` の RSS の合計。Rust 版と比べるときはこちらを使う（起動ラッパーの分は Node 版の配布方法の費用として別に記す）。
- **DB 実行ms/要求**: `pg_stat_statements` の上位40文の実行時間の合計を成功要求数で割る（下限値）。
- **cold**: web・db・redis を再起動した直後に、ウォームアップなしで測る。待機時の CPU は計測後の10秒の区間から取る。
- **疑わしい計測**: web が 1コアに張り付いた秒数の合計が10秒以上、取りこぼしが1%超、失敗が1%超、待機区間（計測の前後）に web が 0.5 コア以上動いていた、のどれか。`summary.md` の中央値からは除く。原因を追うときは、その計測の `.web.log` と `.samples.tsv` を見る。
- **利用者ごとのレート制限**: `i/notifications` は 1人 1回/秒。k6 は認証付きの要求を毎回ランダムな利用者で送り、1人あたり制限の80%を超える到着率では始める前に止まる。

## 制約

- Docker Desktop の VM のページキャッシュは再起動しても残る。cold でもディスクからの読み込みは再現しない。
- `seed` は並行に投入するので、IDや作成順は実行ごとに変わる。比べるときは同じスナップショットを使う。
- ホストと他のプロセスの影響を受ける。比べる計測は同じマシンで、続けて実行する。macOS の Docker Desktop では、同じ条件でも p95・p99 が数倍ぶれることがある（2026-11-24 の初回で `emojis_anon` 50rps の p95 が 6〜69ms）。判定に使う値は、同じ条件を3回以上測った中央値にするか、専用の Linux マシンで測る。
- cgroup は `sampler` コンテナ（[sampler.sh](sampler.sh)）がホストの `/sys/fs/cgroup` から読む。計測対象のコンテナに `docker exec` を毎秒繰り返すと、Docker Desktop の VM に負荷がかかり、p95 が数十倍に悪化した（初回の実測）。Docker Desktop 以外では cgroup のパスが `/sys/fs/cgroup/docker/<ID>` と違う場合があり、その場合は `sampler.sh` を直す。
- Streaming・連合（inbox）・キューの処理時間はこの環境ではまだ測らない（docs 側の「範囲外」を参照）。

## 調査用の道具

計測の異常（docs §4.3 の張り付きなど）を追うときに使う。通常の計測では使わない。

| ファイル | 使い方 |
| --- | --- |
| [compose.gc.yml](compose.gc.yml) + [gc-report.mjs](gc-report.mjs) | `docker compose -f compose.yml -f compose.gc.yml up -d web` で `--trace-gc` 付きで起動し、`node gc-report.mjs results/<name>.web.log` でプロセスごと・区間ごとの GC を集計する |
| [compose.prof.yml](compose.prof.yml) + [prof-capture.mjs](prof-capture.mjs) + [prof-report.mjs](prof-report.mjs) | `--inspect` 付きで起動し（127.0.0.1 にだけ公開）、`node prof-capture.mjs --seconds 600 --out results/prof/x.cpuprofile` で動いている master の CPU プロファイルを取る。`node prof-report.mjs <file>` で、CPU を使い切った秒に動いていた関数を出す。`--cpu-prof` は終了時にしか書かず、終了処理が長いと書かれないので使わない |
| [soak.sh](soak.sh) | web を再起動せずに全シナリオを繰り返し流し、その間 10分ごとにプロファイルを取る。`compose.prof.yml` で起動してから `./soak.sh 3 50 2m` |

チャートは20分ごとに保存される。認証付きのタイムラインを流した後の保存は、修正前の版では数十秒〜数分 master を止める（docs §4.3）。計測区間がこの時刻に重なると張り付きの印が付く。
