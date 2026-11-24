# ADR-0005: Redisクライアント

- 状態: 提案
- 作成日: 2026-11-13
- 更新: 2026-11-14（要判断の決定を記入。同日、決定に伴って出た#4・#5も決定）
- 関連: [移行計画](../RUST_BACKEND_MIGRATION_PLAN.md) §3.2・§5.2、[ADR-0006](0006-job-queue.md)、[ADR-0007](0007-toolchain-and-tls.md)

## 背景

現行は`ioredis` 5.8.1で、`GlobalModule`が用途別に6つの接続を作る。

サーバーは、場所によってRedisとValkeyが混ざっている。CI（`test-backend.yml`）とテスト用のcompose（`packages/backend/test/compose.yml`）は`redis:7`を使う。配布用のcomposeの例（`compose_example.yml`）と開発用のcompose（`compose.local-db.yml`）は`valkey/valkey:9.0-alpine`を使う。RHEL系のインストール手順は、RHEL 10系の標準リポジトリにRedisがないため、Valkeyを入れる手順になっている（`docs/src/content/docs/install/systemd-rhel.md`）。つまり、利用者の環境ではValkeyのほうが既定に近く、現行のNode.js版の自動テストはValkeyを通っていない。

| 接続 | 設定 | 用途・特徴 |
| --- | --- | --- |
| `redis` | `config.redis` | 通常のキャッシュ、通知のRedis Streams、TOTPの使用済み状態など。直接呼ぶ箇所は57 |
| `redisForPub` | `config.redisForPubsub` | publish専用 |
| `redisForSub` | `config.redisForPubsub` | subscribe専用。接続時に`config.host`のチャネルを購読する。直接呼ぶ箇所は25（`on` / `off`が中心） |
| `redisForTimelines` | `config.redisForTimelines` | タイムライン。直接呼ぶ箇所は13 |
| `redisForReactions` | `config.redisForReactions` | DBへ反映する前のリアクションの差分。直接呼ぶ箇所は8 |
| `redisForJobQueue` | `config.redisForJobQueue` | BullMQ用。`maxRetriesPerRequest: null`、`keyPrefix: undefined`で作る |

`redisForPubsub`以下の4つの設定は、省略すると`config.redis`と同じになる。

そのほかの事実は次のとおり。

- キーのprefixは、ioredisの`keyPrefix`で付けている。設定に`keyPrefix`があればその値を使い、なければ`${prefix ?? host}:`を使う（`config.ts`の`convertRedisOptions`）。BullMQのprefixは別で、`{prefix}:queue:{キュー名}`または`queue:{キュー名}`である（`queue/const.ts`）。
- 接続のアドレスファミリーは既定で`0`（IPv4とIPv6の両方）である。
- 直接呼ぶ箇所は108ある。多い順に、`pipeline` 24、イベントの`on` / `off` 23、`del` 8、`get` 7、`set` 7である。Streams（`xadd`、`xrange`、`xrevrange`、`xdel`、`xlen`）、リスト、セット、`scan`、`getdel`、`multi`も使う（RUST-01の棚卸し。`pipeline`と`multi`の中のコマンドは数えていない）。
- アプリのコードが直接Luaを呼ぶ箇所（`eval`、`evalsha`、`defineCommand`）は、`packages/backend/src`にない。LuaはBullMQの内部で使われる。
- `GlobalModule`が作るのは単体の接続（`Redis.Redis`）だけで、Redis Cluster用のクライアントは作っていない。ただし設定スキーマはioredisのオプションをそのまま受け付けるので、Sentinelなどが設定で使われている可能性は残る。本番の構成は未確認（棚卸し §6.3）。

移行計画 §5.2は、Redisを「一括して破棄できるキャッシュ」として扱わないと定めている。通知の履歴（Streams）、既読位置、リアクションの未反映分、TOTPの使用済み状態は、PostgreSQLから再生成できない。Pub/Subは切断中のメッセージを再送しないので、再接続時にキャッシュを無効化して権限をDBから再確認する。

候補の現状は次のとおり。

| クレート | 最新の安定版 | 公開日 | MSRV | 備考 |
| --- | --- | --- | --- | --- |
| `redis`（redis-rs） | 1.8.1 | 2026-10-30 | 1.88 | `2.0.0-rc.2`がプレリリースにある |
| `fred` | 10.1.0 | 2025-02-27 | 1.75 | GitHubのリポジトリへの最後のpushも2025-02-27。アーカイブはされていない |
| `deadpool-redis` | 0.23.1 | 2026-08-26 | 1.88 | 接続プール |
| `bb8-redis` | 0.26.0 | 2025-12-09 | 1.75 | 接続プール |

`redis` 1.8.1について、docs.rsで確認したこと。

- 既定で有効な機能は`acl`、`geospatial`、`num-bigint`、`script`、`streams`である。非同期（`tokio-comp`）、TLS（`tls-rustls`、`tokio-rustls-comp`、`tls-native-tls`など）、`connection-manager`、`cluster-async`、`sentinel`は既定で無効で、明示的に選ぶ。
- `MultiplexedConnection`は複製が安価で、複数のスレッドから同時に使える。自動の再接続は`ConnectionManager`（`connection-manager`機能）が受け持つ。非同期の接続には既定のタイムアウトがある。
- 非同期のPub/Subは、送信側と受信側に分けて使える。RESP3では、同じ接続でプッシュを受け取る設定ができる。再接続後に購読が自動で復元されるかは、ドキュメントに書かれていない。
- `Script`型は、スクリプトが未登録なら登録してから呼ぶ。パイプラインの中では自動の登録と再試行をしない。
- ioredisの`keyPrefix`に当たる機能は、ドキュメントに書かれていない。

## 検討した選択肢

### A. `redis`（redis-rs）を、用途別のadapterに閉じ込める（決定案）

### B. `fred`

採らない。最後の公開が2025-02-27で、1年8か月のあいだ更新がない。今回の確認では、保守が続いていると判断できる材料がなかった。機能の比較（再接続、Pub/Sub）はしていない。

### C. クライアントを業務処理から直接使う（adapterを作らない）

採らない。現行の108か所は、キーの名前、TTL、値の形式をそれぞれの場所で決めている。同じ形をRustで繰り返すと、Node.js版とのデータ形式の互換（計画 §5.2）を検査する場所が定まらない。

### D. 旧ブランチの構成（`redis` 0.32.7に`r2d2`機能、`moka`によるメモリキャッシュ）

採らない。`r2d2`は同期の接続プールで、Tokioの上で使う非同期の接続と合わない。旧ブランチの`engawa_util/src/cache.rs`は、`delete`だけが実装され、生成（`new`）は`todo!()`である。

## 決定案

1. Redisのクライアントは`redis`クレート（redis-rs）とし、Tokio用の非同期の機能を使う。
2. クライアントを業務処理から直接呼ばない。用途別の小さなadapterを作り、adapterが「キーの組み立て、prefix、値の形式、TTL、再接続時の扱い」を受け持つ。adapterの単位は、現行の接続と同じ用途の区分にする。

   | adapter | 対応する現行の接続 | Rust側で必要になる時期（目安） |
   | --- | --- | --- |
   | キャッシュ・汎用 | `redis` | フェーズ1（接続の確認）〜2 |
   | イベントの購読 | `redisForSub` | フェーズ2〜3（キャッシュの無効化、Streaming） |
   | イベントの発行 | `redisForPub` | フェーズ4（Rustが書き込みを担当する操作から） |
   | タイムライン | `redisForTimelines` | フェーズ3 |
   | リアクション | `redisForReactions` | フェーズ4 |
   | ジョブキュー | `redisForJobQueue` | 当面は作らない（[ADR-0006](0006-job-queue.md)） |

3. prefixはadapterが付ける。ioredisの`keyPrefix`と同じキーになることを、Node.js版が書いたキーをRustが読み、その逆も行う試験で確かめる。試験は、`keyPrefix`を明示した設定と、明示しない設定（`${prefix ?? host}:`になる）の両方で行う。prefixをクライアントの機能や呼び出し側に任せない。
4. Pub/Subの購読は、再接続を検知したら「再購読し、関連するメモリ上のキャッシュを捨てる」処理をadapterに入れる（計画 §5.2）。クライアントが購読を自動で復元するかどうかに依存しない。
   - 購読が切れている間は、無効化の通知が届かない。再接続のときにキャッシュを捨てるだけでは、切れている間、変更前の内容を使い続ける。このため、切断を検知した時点で、通知で無効化しているメモリ上のキャッシュを使わないようにし、再購読が済むまではDB（またはRedis）から読み直す。認証・認可の判断に使うキャッシュ（ユーザー、アクセストークン、ロール、停止状態など）には、必ずこれを適用する。対象のキャッシュの一覧と、切断を検知するまでの時間の上限は、下の検証で決める。
5. 検証対象のサーバーは、単体のRedis 7と、単体のValkeyとする（要判断#1。2026-11-14決定）。Valkeyの版は、配布用のcomposeが使う9.0系と、RHEL 10系の標準リポジトリが配る版を対象にする（後者の版は未確認）。Rust版の結合試験は、RedisとValkeyの両方で回す。SentinelとRedis Clusterは「Rust版では未検証」とし、設定スキーマとドキュメントにそう書く。Valkey以外の互換サーバー（DragonflyDB、KeyDBなど）は検証対象にせず、「Rust版では未検証」と書く（要判断#4。2026-11-14決定）。
6. 接続プールのクレート（`deadpool-redis`、`bb8-redis`）は、最初は入れない。`MultiplexedConnection`と`ConnectionManager`で足りるかを検証し、ブロックするコマンドやトランザクションで専用の接続が要ると分かったときに追加する。
7. メモリ上のキャッシュ（現行の`MemoryKVCache`など、メモリだけのキャッシュ定義が19ある）に使うクレートは、このADRでは決めない。必要になった時点で決める。

## 採用前に検証すること

RUST-05で確かめる。

- [ ] **再接続**: Redisを止めて再開したとき、`ConnectionManager`が接続を戻すまでの時間と、その間のコマンドの挙動（待つ、失敗する）。ioredisの`maxRetriesPerRequest`と同じ意味の設定があるか。既定のタイムアウトの値と、現行との差。
- [ ] **Pub/Subの再購読**: 再接続後に購読が戻るか。戻らないなら、adapterで再購読する。再接続を検知する方法を決める。
- [ ] **購読が切れている間のキャッシュ**: 通知で無効化しているメモリ上のキャッシュを一覧にし、認証・認可に使うものを分ける。購読を切った状態で権限を変え（トークンの失効、ロールの変更、凍結）、切断を検知した後は変更前の権限で通らないことを確かめる。切断を検知するまでの時間の上限を測る。
- [ ] **prefix**: ioredisの`keyPrefix`がキーに付くコマンドと、付かないもの（Pub/Subのチャネル名、`scan`のパターンと結果など）を一覧にし、Rust側で同じにする。現行の`redisForSub`は`config.host`をチャネル名に使っている。
- [ ] **RESP2とRESP3**: どちらで接続するか。Redis 7とValkeyの両方で確認する。
- [ ] **Valkeyでの動作**: この節の項目（再接続、Pub/Subの再購読、prefix、`pipeline`と`multi`）と、各フェーズの項目（値の形式、Streams、レート制限）を、Valkey 9.0でも確かめる。RedisとValkeyで結果が違う項目を一覧にする。`redis`クレートがValkeyをどこまで対象にしているかは未確認。
- [ ] **SentinelとClusterが設定された場合の扱い**: 未検証の構成の設定を、起動時に検出して警告するか、起動を拒否するか（計画 §6の「未対応の設定を黙って無視しない」）。
- [ ] **TLSとアドレスファミリー**: 現行の設定（ioredisの`tls`、`family`）で動いている構成に、同じ設定で接続できるか。TLSの実装は[ADR-0007](0007-toolchain-and-tls.md)に従う。
- [ ] **`pipeline`と`multi`**: 現行の24か所の`pipeline`が、原子性を前提にしているか（`multi`を使うべきところで`pipeline`を使っていないか）を確認し、Rust側で同じ保証にする。
- [ ] **接続数**: Node.js版との合計で、Redisの接続数の上限に収まるか（計画 §6）。

各フェーズの着手時に確かめる。

- [ ] **値の形式**: 共有するキャッシュのキー、TTL、値のJSONが、Node.js版と互換か（計画 §5.2）。互換にできないものは別のnamespaceに置き、両側の無効化を保証する。
- [ ] **Streams**: 通知の履歴（`notificationTimeline:{userId}`）のIDと上限の指定が、現行と同じか。
- [ ] **レート制限**: 同じ利用者のカウンターをNode.js版と共有するか、入口の1か所で適用するか（計画 §5.2）。

## 影響

- Rust側に、Node.js版と同じキーと値の形式を知っているコードが増える。形式を変えるときは、両方を同じPRで直す。adapterに閉じ込めることで、直す場所を限定する。
- `bullmq-official`は`redis`クレートの版を`=1.8.1`と完全一致で指定している（[ADR-0006](0006-job-queue.md)）。将来これを採る場合、Redisクライアントの版を自由に上げられなくなる。adapterの外に`redis`クレートの型を出さないことで、版の制約の影響を小さくする。
- Rust版の結合試験が、RedisとValkeyの2通りになる。CIの時間が増える。現行のNode.js版のCIはRedis 7だけで回っているので、Valkeyで見つかった差がRust版に固有か、Node.js版にもあるかを切り分ける手順が要る。このため、Node.js版のCIにもValkeyを足す（要判断#5。2026-11-14決定）。作業はRust移行と別のPRで行い、このADRの範囲では変更しない。
- `redis`クレートは2.0系のプレリリースが出ている。1.x系から2.x系への移行で破壊的変更があると見込み、adapterの層で吸収する。

## 要判断

| # | 判断すること | 選択肢 | 推奨 | 決定 | 決定日 |
| --- | --- | --- | --- | --- | --- |
| 1 | サポートするRedisの構成 | (a) 単体のRedis 7だけ (b) Sentinel、Clusterも含める (c) Valkey、DragonflyDBなどの互換サーバーも含める | 本番と、利用者が実際に使っている構成を確認してから決める。現行のコードはClusterを使っていない。確認できるまでは(a)を検証対象とし、ほかは「Rust版では未検証」と明記する | **決定（推奨と違う）**: 単体のRedis 7に加えて、Valkeyなどの互換サーバーを検証対象にする。SentinelとClusterは選ばれておらず、「Rust版では未検証」のままとする | 2026-11-14 |
| 2 | 用途別の接続を、Rust側でも設定どおりに分けるか | (a) 現行と同じ5つの設定を読む (b) 最初は`redis`だけ読み、ほかが設定されていたら起動を拒否する | (a)。設定の意味を変えない（計画 §6）。ただしフェーズ1〜2で使わない接続は作らない | **決定**: (a)。現行と同じ5つの設定を読む | 2026-11-14 |
| 3 | `fred`を再評価する条件 | (a) 再評価しない (b) 検証で`redis`クレートに不足が見つかり、かつ`fred`の更新が再開した場合に再評価する | (b) | **決定**: (b) | 2026-11-14 |
| 4 | Valkey以外の互換サーバー（DragonflyDB、KeyDBなど）を検証対象にするか（2026-11-14の決定で新しく出た項目） | (a) Valkeyだけ (b) 利用実績のあるものを足す | (a)。リポジトリのcomposeとインストール手順に出てくる互換サーバーはValkeyだけである。ほかは「Rust版では未検証」と書く | **決定**: (a)。Valkeyだけ | 2026-11-14 |
| 5 | Node.js版のCIにもValkeyを足すか（同上） | (a) 足す (b) Rust版の結合試験だけで回す | (a)。配布用のcomposeの既定がValkeyなのに、現行の自動テストが通っていない。Rust移行と別のPRで行う | **決定**: (a)。足す。Rust移行と別のPRで行う | 2026-11-14 |

要判断#1の選択肢(c)は、「(a)に互換サーバーを足す」という意味で書いたもので、(b)のSentinel・Clusterを含まない。決定はこの読み方で反映した。

## 出典

確認日: 2026-11-13

- 版・公開日・MSRV: crates.ioのAPI
  - <https://crates.io/api/v1/crates/redis>、<https://crates.io/api/v1/crates/fred>
  - <https://crates.io/api/v1/crates/deadpool-redis>、<https://crates.io/api/v1/crates/bb8-redis>
- `redis` 1.8.1の機能一覧: <https://docs.rs/crate/redis/1.8.1/features>
- `redis` 1.8.1のドキュメント: <https://docs.rs/redis/1.8.1/redis/>
- `fred`のリポジトリの状態: <https://api.github.com/repos/aembke/fred.rs>（`archived: false`、`pushed_at: 2025-02-27`）
- Redis Pub/Subの配送の保証（計画が参照する資料）: <https://redis.io/docs/latest/develop/pubsub/>
- 現行: `packages/backend/src/GlobalModule.ts`、`packages/backend/src/config.ts`、`packages/backend/src/queue/const.ts`（コミット`5e8cc3b2cd`）、棚卸しの`redis-commands.csv`
- サーバーの指定: `compose_example.yml`、`compose.local-db.yml`、`packages/backend/test/compose.yml`、`.github/workflows/test-backend.yml`、`docs/src/content/docs/install/systemd-rhel.md`（コミット`5e8cc3b2cd`。2026-11-14確認）
- 未確認: RHEL 10系が配るValkeyの版、`redis`クレートのValkeyへの対応の範囲、`redis`クレートの再接続後の購読の復元、ioredisの`keyPrefix`が付かないコマンドの一覧、本番のRedisの構成、互換サーバーでの動作
