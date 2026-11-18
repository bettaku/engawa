# Redisキャッシュの台帳

pre-rust-tech-debt.md の P2-1（Redisキャッシュの値をDTOとバージョン付きにする）と付録Aの台帳のうち、`RedisKVCache`・`RedisSingleCache`（[misc/cache.ts](../../packages/backend/src/misc/cache.ts)）で管理するキャッシュをまとめる。キャッシュ以外のRedisキー（ストリーム、タイムライン、ロック、BullMQなど）は設計書の付録Aを参照。

## キーの版（namespace）

| 版 | `RedisKVCache`のキー | `RedisSingleCache`のキー | 値 |
| --- | --- | --- | --- |
| 1 | `kvcache:<name>:<key>` | `singlecache:<name>` | 呼び出し側の変換関数の結果。多くはTypeORMエンティティの`JSON.stringify` |
| 2 | `kvcache:v2:<name>:<key>` | `singlecache:v2:<name>` | キャッシュごとに定義したDTO（第2リリースで定義する） |

キーにはRedis接続の`keyPrefix`（既定はホスト名）が前に付く。

読み書きする版は`CURRENT_CACHE_KEY_VERSION`（現在は1）で決める。版ごとの操作は次のとおり。

| 操作 | 自版のキー | ほかの版のキー |
| --- | --- | --- |
| `set`・`refresh`（値が変わった） | 書き込む | 同じMULTIで消す |
| `delete` | 消す | 消す |
| `fetch`のキャッシュミス（DBから読んだ値で埋める） | 書き込む | 消さない（値は変わっていないので、版の異なるプロセスが互いのキャッシュを消し合わないようにする） |

### 切り替えの手順

1. **第1リリース（このリリース）**: 値を変えるとき（`set`・`refresh`・`delete`）に、ほかの版のキーも消す。読み書きはv1のまま。
2. **第2リリース**: キャッシュごとのDTO型とシリアライザを定義し、`CURRENT_CACHE_KEY_VERSION`を2にする。
   - **開始条件**: 共有のRedisに書き込むプロセス（APIとキュー・バックグラウンドのワーカーのすべて）が第1リリース以降の版に切り替わり、それより前の版のプロセスが残っていないこと。第1リリースより前のプロセスはv1のキーだけを更新するので、v2のキーに古い値が残る。
   - 開始条件を満たしていれば、どちらの版のプロセスが値を変えても、`set`・`refresh`は自版のキーを書き込んでほかの版のキーを消し、`delete`は両方の版のキーを消す。そのため、値を変えた後に、ほかの版のキーに変更前の値が残ることはない。ただし、次の場合は古い値を読むことがある。
     - 並行するキャッシュミス: あるプロセスがDBから古い値を読んだ後に、別のプロセスが値を変えてキーを消し、その後で最初のプロセスが古い値でキーを埋めた場合。この値はキーのTTLまで残る。版の切り替えに関係なく、現行の`RedisKVCache`にもある競合で、この手順では解消しない。
     - ほかのプロセスのメモリ層: この手順では消えないので、メモリ層の寿命が過ぎるまでは古い値を返すことがある（P2-2の`cacheInvalidated`で消す）。
   - この保証は、値を変えるときにRedisのキーを消す経路に限られる。Redisを書き換えずにメモリだけを変える経路（`userListMembers`のメンバーの追加・削除。P2-2で修正）では、Redisに古い値が残る。
3. **切り戻し期間の後**: v1への対応を廃止する。`CACHE_KEY_VERSIONS`から1を外すと型`CacheKeyVersion`からも1が消えるので、v1を指定しているテスト（`kvCacheKey(..., 1)`など）も同じ変更で書き換える。v1キーはTTLで消える。

ロールバック: 第2リリースから第1リリースへはそのまま戻せる。第1リリースより前の版へは戻さない（ほかの版のキーを消さないので、新しい版が書いた後に古い値を読み続ける）。

メモリ層（プロセス内）の無効化は、この手順では扱わない。ほかのプロセスのメモリ層はP2-2の`cacheInvalidated`イベントで消す。

## 台帳

「TTL」はRedis / メモリ層の順。「書き込み」は値を更新・削除する処理（`refresh`・`set`・`delete`）の呼び出し元。

| 名前 | 種類 | 値（v1） | TTL | 書き込み | 無効化の方法 | DBから再生成 | 版 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `userProfile` | KV（userId） | `MiUserProfile`全体のJSON | 30分 / 1分 | `i/update`（`set`） | `i/update`以外の更新経路では無効化されない（P2-2） | できる | 1→2。v2では用途に必要な列だけのDTOにする。除外する列はアドバイザリの[A5]に従う |
| `userMutings` | KV（muterId） | muteeIdの配列 | 30分 / 1分 | UserMutingService（`refresh`） | `refresh`（他プロセスのメモリ層は消えない。P2-2） | できる | 1→2 |
| `userBlocking` | KV（blockerId） | blockeeIdの配列 | 30分 / 1分 | UserBlockingService（`refresh`） | 同上 | できる | 1→2 |
| `userBlocked` | KV（blockeeId） | blockerIdの配列 | 30分 / 1分 | UserBlockingService（`refresh`） | 同上 | できる | 1→2 |
| `renoteMutings` | KV（muterId） | muteeIdの配列 | 30分 / 1分 | UserRenoteMutingService（`refresh`） | 同上 | できる | 1→2 |
| `userFollowings` | KV（followerId） | `{ [followeeId]: { withReplies } }` | 30分 / 1分 | UserFollowingService（`refresh`）、`follow`イベント（`delete`） | 同上 | できる | 1→2 |
| `userListMembers` | KV（userListId） | userIdの配列 | 30分 / 1分 | なし（内部イベントでメモリ層だけを変える） | Redisに書き戻さない（P2-2） | できる | 1→2 |
| `userKeypair` | KV（userId） | `MiUserKeypair`全体のJSON | 24時間 / 1時間 | なし | TTLのみ（鍵は作成後に変わらない） | できる | 1→2。除外する列はアドバイザリの[A5]に従う |
| `federatedInstance` | KV（host） | `MiInstance`全体のJSON（または`null`） | 30分 / 3分 | FederatedInstanceService（`set`） | `set` | できる | 1→2 |
| `userSwSubscriptions` | KV（userId） | `MiSwSubscription[]`のJSON | 1時間 / 3分 | PushNotificationService（`refresh`） | `refresh` | できる | 1→2 |
| `localEmojis` | Single | `MiEmoji[]`のJSON | 30分 / 3分 | CustomEmojiService（`refresh`） | `refresh` | できる | 1→2 |
| `flashAccessTokens` | KV（token） | `StoredFlashToken`のJSON | 30分 / 1分 | `flash/gen-token`（`set`） | TTLのみ | **できない**（fetcherは`null`を返す。認証状態） | **版を持たない**（`version: null`）。P2-1の対象外。形式を変えるときは、旧形式を読める処理を先に配布し、TTL（30分）が過ぎて切り戻し期間が終わってから書き込み形式を変える |
