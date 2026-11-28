# RUST-01 棚卸し: 現行バックエンドの機能・設定・副作用

作成日: 2026-11-13

更新日: 2026-11-28

状態: 第2版。対象コミットを更新して再生成し、抽出の漏れ（ハンドラーの登録、CLI、SQLの文字列、エンティティマネージャーのクエリビルダー、複数行の型宣言と名前のない`@Entity()`、チャート）を埋めた。未確定一覧は、判断済みのものと、別のPRで実施するものに分けた。

関連: [Rust移行計画](../../RUST_BACKEND_MIGRATION_PLAN.md) §2・§5.1・§12（RUST-01）

## 1. この資料の位置づけ

移行計画のRUST-01は、成果物として「ルート／ジョブごとの担当表、参照コード、互換試験、未確定一覧」を求めている。この資料はその成果物である。

- 表の本体はCSVで、`packages/backend/src`から機械的に生成する。手で編集しない。
- この文書には、CSVの読み方、集計、担当単位の案、未確定の項目を書く。
- 対象コミット: `bc26517d3b`（`summary.json`の`generatedFrom`）。
- 参照コードは各CSVの`file`・`line`列、互換試験は`testFileCount`・`testFiles`列にある。互換試験が足りない範囲は、移行する単位ごとにRUST-03の契約fixtureで補う（§6.2の#12）。

### 再生成

```sh
pnpm --filter backend build
node scripts/rust-inventory/generate.mjs
```

エンドポイントの定義（`meta`）は、ビルド済みの`packages/backend/built`から読む。そのほかはソースを正規表現で読む。上流との比較には、gitのタグ`2025.10.2`（Misskey）とリモートブランチ`upstream/develop`（CherryPick）を使う。別の参照を使うときは、環境変数`INVENTORY_MISSKEY_REF`と`INVENTORY_CHERRYPICK_REF`で指定する。

ある入口がある書き込みに届く経路は、次のように確認できる。

```sh
INVENTORY_TRACE='EP:following/create>note.insert' node scripts/rust-inventory/generate.mjs
```

## 2. ファイル一覧

| ファイル | 行数 | 内容 |
| --- | ---: | --- |
| [api-endpoints.csv](api-endpoints.csv) | 446 | `/api/*`のエンドポイント。認証、権限、レート制限、GET可否、キャッシュ秒数、由来、到達する書き込み・ジョブ・イベント・外部通信、参照しているテスト、上流との差分（`forkDiff`） |
| [http-routes.csv](http-routes.csv) | 91 | エンドポイント表の外で登録しているHTTPルート（ActivityPub、Web画面、ファイル、OAuth、well-knownなど） |
| [stream-channels.csv](stream-channels.csv) | 16 | Streamingのチャンネル。購読するイベント、クライアントから受けるメッセージ |
| [queue-jobs.csv](queue-jobs.csv) | 53 | キューとジョブ。cron、並列度、制限、到達する副作用、登録元 |
| [cli-commands.csv](cli-commands.csv) | 6 | `boot/cli.ts`の運用コマンドと、到達する副作用 |
| [write-sites.csv](write-sites.csv) | 371 | DBへ書き込むコード上の位置と、そこへ届く入口の数 |
| [tables.csv](tables.csv) | 79 | テーブルごとの書き込み元クラスと、届く入口の数 |
| [charts.csv](charts.csv) | 12 | チャートのテーブル、更新メソッド、更新する箇所、読む箇所 |
| [hubs.csv](hubs.csv) | 4 | ハブ層（§3.2）自体の副作用 |
| [config-keys.csv](config-keys.csv) | 359 | 設定スキーマのキー、型、既定値、対応する環境変数 |
| [env-vars.csv](env-vars.csv) | 24 | 環境変数と参照箇所 |
| [runtime-options.csv](runtime-options.csv) | 26 | 環境変数から作り、DIで渡す実行時の設定（`config.runtime`）の参照箇所 |
| [redis-commands.csv](redis-commands.csv) | 113 | Redisクライアントを直接呼ぶ箇所（接続、コマンド、第1引数） |
| [caches.csv](caches.csv) | 31 | Redis・メモリのキャッシュ定義とTTL |
| [internal-events.csv](internal-events.csv) | 31 | 内部イベントの型、発行箇所、購読箇所 |
| [timers.csv](timers.csv) | 20 | プロセス内のタイマーと`CollapsedQueue` |
| [summary.json](summary.json) | — | 集計値 |

## 3. 抽出の方法と限界

### 3.1 方法

1. 全クラスについて、コンストラクター引数とフィールドの型、メソッドの本体を取り出す。エンティティのテーブル名は`@Entity('名前')`から読み、名前のない`@Entity()`はTypeORMの既定の命名（クラス名のスネークケース）とする。
2. メソッドごとに、次を記録する。
   - リポジトリへの書き込み（`insert`・`insertOne`・`update`・`delete`・`save`・`increment`・`decrement`・`upsert`など）
   - クエリビルダーでの書き込み。リポジトリのもの（`this.xRepository.createQueryBuilder()`）と、エンティティマネージャーのもの（`manager.createQueryBuilder().update(MiNote)`）の両方
   - エンティティマネージャーでの書き込み（`manager.insert(MiNote, ...)`）
   - 生のSQL（`query()`）。SQLが文字列で書いてあれば、`INSERT INTO`・`UPDATE`・`DELETE FROM`からテーブルを読む。テーブル名を式で組み立てるものは`(dynamic)`、SQLを変数で渡すものは`(raw SQL)`とする。読み取りだけの文は数えない
   - 他のサービスの呼び出し、`QueueService`の呼び出し、イベントの発行、Redisのコマンド
3. 入口（エンドポイント、ジョブ、チャンネル、サーバークラス、CLIコマンド）から呼び出しをたどり、届く副作用を集める。
4. メソッドを値として渡す登録（`noteOutboxService.registerHandler('created', this.handleCreated)`）は、登録先が呼ぶメソッド（`NoteOutboxService.run`）からの呼び出しとして扱う。ノートの作成・更新・削除の副作用は、この経路で数える。
5. ジョブの登録元は、`QueueService`のメソッドが同じクラスの別メソッドを経由して登録するもの（`scheduleNotePost` → `ensureNotePostScheduled`）もたどる。

### 3.2 ハブ層

次の層は、多数の入口から届き、それ自体が広い副作用を持つ。入口ごとの集計はここで打ち切り、「どのハブに触れるか」だけを`hubs`列に記録した。ハブ自体の副作用は[hubs.csv](hubs.csv)にある。

| ハブ | 対象 | 触れる入口 | 意味 |
| --- | --- | --- | --- |
| `pack` | `*EntityService` | API 249、ジョブ 29、チャンネル 10 | 表示用の変換。中でリモートの解決や更新をするものがある（技術的負債の設計書 P3-3） |
| `apResolve` | `core/activitypub/models/*`、`RemoteUserResolveService`、`ApResolverService`、`ApDbResolverService` | API 12、ジョブ 8 | リモートのユーザー・ノートの取得と作成。ノートの作成やドライブの更新まで届く |
| `notify` | `NotificationService` | API 23、ジョブ 22 | 通知の作成。Redis Streamへの書き込み、Web Push、購読の削除 |
| `lazyInit` | `MetaService.fetch`、`SystemAccountService.fetch`など | API 14、ジョブ 2、チャンネル 1 | 初回のアクセスで行を作る処理 |

ハブで打ち切らない場合、たとえば`following/create`は`note.insert`に届く。経路は`UserFollowingService.follow` → `AccountMoveService.validateAlsoKnownAs` → `ApPersonService.updatePerson` → `updateFeatured` → `ApNoteService.createNote`である。これは誤検出ではなく、実際にある経路である。`apResolve`に触れる入口は、移行単位を決めるときに個別に見る必要がある。

### 3.3 限界

- 静的な近似である。呼び出しの有無は条件分岐を見ていないので、実際より広く出る。
- 次のものは拾えない。
  - コールバックやアロー関数のプロパティ経由の呼び出し（§3.1の4に挙げた`registerHandler`は除く）
  - 継承したメソッド
  - `pipeline`・`multi`の中のRedisコマンド
  - クラスの外の関数（`misc/reset-db.ts`など）からの書き込み
- チャートの書き込みは、テーブルを名前から動的に決めるので[write-sites.csv](write-sites.csv)には出ない。代わりに[charts.csv](charts.csv)にまとめた（§4.4）。
- `effect`列の`read`は「DBへの書き込みとジョブ登録を検出しなかった」という意味である。認証に伴う更新（トークンの`lastUsedAt`、IP履歴）とレート制限のカウンターは、全エンドポイント共通の処理（`ApiCallService`・`AuthenticateService`）にあり、この列には含めていない。
- `origin`列は、エンドポイント名が上流にあるかどうかだけで決めている。中身を変えたかどうかは`forkDiff`列で見る（§4.2）。

## 4. 集計

### 4.1 入口

| 種類 | 数 | 補足 |
| --- | ---: | --- |
| APIエンドポイント | 446 | 認証なし 103、ユーザー 252、モデレーター 71、管理者 20 |
| エンドポイント表の外のHTTPルート | 91 | Web画面 42、ActivityPub 16、API直下 10、well-known 7、OAuth 4、ファイル 4、ほか 8 |
| Streamingチャンネル | 16 | 認証なしで使えるもの 8 |
| ジョブ | 53 | キューは11。cronで動くもの 14（すべて`system`キュー） |
| CLIコマンド | 6 | `check-counters`・`repair-counters`、`ping`、`reset-captcha`、`bake-reactions`、`drain-note-outbox`、`register-job-schedulers`（`boot/cli.ts`）。ほかに`check:config` |

### 4.2 APIエンドポイント

| 項目 | 数 |
| --- | ---: |
| DBへの書き込みまたはジョブ登録に届く | 231 |
| Redisへの書き込みだけに届く | 2 |
| `kind`は`write:`だが書き込みを検出できなかった | 11 |
| 書き込みを検出しなかった | 202 |
| GETを許可（`allowGet`） | 26 |
| 応答スキーマ（`res`）がない | 162 |
| テストから名前で参照されていない | 316（書き込み系244のうち160） |
| 上流と同名で、フォークが中身を変えた | 131（Misskey由来 117、CherryPick由来 14） |

由来は、Misskeyと同名が407、CherryPickで追加が35、engawaで追加が4である。

`forkDiff`列は、由来の上流（Misskey由来は`2025.10.2`、CherryPick由来は`upstream/develop`）とのファイルの差分を`+追加/-削除`の行数で示す。空欄は差分なし、engawaで追加したものは対象外である。差分が大きいのは`admin/update-meta`（+218/-35）、`admin/meta`（+209/-37）、`notes/translate`（+171/-28）、`fetch-rss`（+61/-7）、`notes/create`（+50/-3）である。数行の差分の多くは、パッケージ名の置き換えや型の修正である。移行の最初の対象の`emojis`は差分がない（`emoji`は+14/-1）。

engawaで追加した4つは、`admin/index/full`、`admin/index/reindex`、`admin/set-user-sensitive`、`admin/unset-user-sensitive`である。CherryPickで追加した35のうち、まとまっているのは次のとおり。

- ユーザーグループ: `users/groups/*` 12、`i/user-group-invites`
- ノートの編集・履歴: `notes/update`、`notes/history`
- 自動削除・アカウントの切り詰め: `i/auto-delete-settings`、`i/update-auto-delete-settings`、`i/truncate-account`
- 通報の自動処理: `admin/abuse-report-resolver/*` 4
- そのほか: `notes/bubble-timeline`、`notes/events/search`、`notes/polls/translate`、`users/translate`、`users/stats`、`flash/gen-token`、`federation/remote-software`、`admin/emoji/steal`、`admin/avatar-decorations/copy`・`list-remote`、`admin/invite/revoke`、`chat/rooms/invitations/cancel`・`reject`

### 4.3 データ

| 項目 | 数 |
| --- | ---: |
| エンティティ（テーブル） | 78（書き込み位置を検出しなかったものはない） |
| DBへ書き込むコード上の位置 | 371（リポジトリ 302、エンティティマネージャー 27、クエリビルダー 27、生のSQL 15） |
| どの入口からも届かない書き込み位置 | 22（§6.2の#11） |
| 設定キー | 359（最上位 49） |
| 環境変数 | 24（サービスは`process.env`を読まず、DIの`config.runtime`を読む。参照箇所は[runtime-options.csv](runtime-options.csv)） |
| Redisを直接呼ぶ箇所 | 113（`redisClient` 58、`redisForSub` 25、`redisForTimelines` 13、`redisForReactions` 12） |
| キャッシュ定義 | 31（Redis 11、メモリだけ 20） |
| 内部イベントの型 | 31（エンティティ全体を載せるもの 18） |
| プロセス内のタイマー | 20 |

書き込み元のクラスが多いテーブルは、`user_profile`（21クラス）、`user`（20）、`note`（7）、`antenna`（7）、`following`（6）、`instance`（6）である。移行計画§5.1の「担当実装を一つに固定する」ときに、呼び出し元の整理がもっとも重くなるのは`user_profile`と`user`である。

テーブルを実行時に決める書き込み（チャートの基底クラスと`CounterConsistencyService`）は、`(dynamic)`という1行にまとめた。

### 4.4 チャート

チャートは12種類で、それぞれ`__chart__<名前>`（時間単位）と`__chart_day__<名前>`（日単位）の2テーブルを持つ。ユーザーやインスタンスごとに分ける（`grouped`）ものが6種類ある。

`update`などのメソッドはメモリ上のバッファに積むだけで、DBへの書き込みは次の3つで起きる。

- `ChartManagementService`の20分おきの`save`と、プロセス終了時の`save`
- `system`キューの`tickCharts`・`resyncCharts`・`cleanCharts`ジョブ

つまり、チャートの値はプロセスごとに最大20分ぶんメモリに溜まる。複数のプロセスがそれぞれバッファを持つのは現行のクラスタ構成でも同じだが、Rust版が同じチャートを更新するなら、保存の形式（時間の区切り、`uniqueIncrement`の扱い）をNode.js版と合わせる必要がある。プロセスを止めるときは終了時の`save`を待つ（drainの手順に含める）。更新する箇所は[charts.csv](charts.csv)の`updaters`列にある。`activeUsers`はタイムラインの読み取り系API 8つから更新され、読み取りのAPIが副作用を持つ数少ない例である。

## 5. 担当単位の案

移行計画§5.1は、ルート単位ではなく「業務操作と、その操作を呼ぶ全経路」を移行単位にすると定めている。以下は、抽出結果から読み取れる単位の案である。

### 5.1 フェーズ2の候補: 認証なしで副作用のない参照

認証なしでGETを許可し、書き込みを検出しなかったエンドポイントは26ある。計画が最初の対象に選んだ`emojis`もこの中にある。

| まとまり | エンドポイント | ハブ | 備考 |
| --- | --- | --- | --- |
| 絵文字 | `emojis`、`emoji` | `pack` | `cacheSec` 3600。契約fixtureはRUST-03で作成済み |
| 装飾 | `get-avatar-decorations` | なし | |
| チャート | `charts/*` 12 | なし | チャートの読み取りは動的なテーブルを使う（§4.4）。DB層の検証に向く |
| 統計 | `retention`、`server-info`、`get-online-users-count`、`hashtags/trend`、`federation/stats` | 一部`pack` | `server-info`はホストの情報を読む。`get-online-users-count`と`hashtags/trend`はRedisを読む |
| ノートの一覧 | `notes/featured`、`users/featured-notes`、`notes/reactions` | `pack` | ノートの`pack`が要る。公開範囲の判定を伴うのでフェーズ3に送る |
| 連合 | `federation/instances`、`federation/remote-software` | `lazyInit` | |
| 外部取得 | `fetch-rss` | なし | 外向きHTTP。SSRF対策の移植が先に要る。フォークが中身を変えている（+61/-7） |

`emojis`の次の候補は、ハブに触れない`get-avatar-decorations`、`retention`、`charts/*`である。

### 5.2 フェーズ3の単位: 認証付きの参照と配信

| 単位 | 入口 | 先に要るもの |
| --- | --- | --- |
| 認証・権限の共通処理 | 全エンドポイント、全チャンネル | トークンの種類（native・app・MiAuth・flash）、ロール、凍結、レート制限。認証に伴う更新の担当 |
| ユーザーの参照 | `users/*`の読み取り 25、`i`の読み取り 20 | `pack`からの書き込みと外部通信の除去（P3-3）。`users/show`は`apResolve`に触れ、`perUserPv`チャートを更新する |
| ノートの参照・タイムライン | `notes/*`の読み取り 27、チャンネル 10 | 公開範囲の判定表（P2-7）、`redisForTimelines`のデータ形式。タイムラインのAPIは`activeUsers`チャートを更新する |
| Streaming | チャンネル 16、`/streaming` | Pub/Subのチャネルと本文の契約（P2-3） |

### 5.3 フェーズ4の単位: 業務操作

書き込みに届く入口が複数の種類にまたがる操作を、[write-sites.csv](write-sites.csv)から拾った。

| 操作 | 中心のサービス | 届く入口 | 書き込むテーブル（中心のもの） | 注意点 |
| --- | --- | --- | --- | --- |
| ノートの作成 | `NoteCreateService` | `notes/create`、`postScheduledNote`ジョブ、`inbox`ジョブ（`apResolve`経由） | `note`、`note_outbox`、`poll`、`event`、`hashtag`、`user`、`instance` | 後処理は`note_outbox`を経由して`NoteCreateService.handleCreated`で行う。未処理分は`processNoteOutbox`ジョブと`sweepNoteOutbox`、運用時は`drain-note-outbox`で流す |
| ノートの削除 | `NoteDeleteService` | API 2、ジョブ 3 | `note`、`note_outbox`、`instance`、`moderation_log` | 後処理は`handleDeleted`。作成の後処理が終わる前の削除は、実行済みの副作用だけを取り消す |
| ノートの編集 | `NoteUpdateService` | `notes/update` | `note`、履歴 | CherryPickで追加。後処理は`handleUpdated` |
| リアクション | `ReactionService`、`ReactionsBufferingService` | API、`inbox`ジョブ、`bakeBufferedReactions`ジョブ、`bake-reactions`コマンド | `note`、`note_reaction`、`reaction_bake_ledger` | `redisForReactions`に未反映の差分を持つ（P1-4）。適用済みのバッチは台帳で判定する |
| フォロー・ブロック | `UserFollowingService`、`UserBlockingService` | `following/*` 8、`relationship`ジョブ 4、`inbox`ジョブ | `following`、`follow_request`、`blocking`、`user`、`instance` | `apResolve`に触れる。`notify`に触れる |
| ドライブ | `DriveService` | `drive/*` 8、エクスポート系ジョブ 9、`cleanRemoteFiles`、`apResolve` | `drive_file` | ストレージ（S3互換・ローカル）、画像・動画処理、外向きHTTP |
| アカウントの削除・切り詰め | 各ジョブ | `deleteAccount`、`truncateAccount` | `user`、`note`、`drive_file`、`page`ほか（それぞれ9・8テーブル） | メール送信を伴う |
| プロフィール・設定 | 21クラス | `i/*`の書き込み 41 | `user_profile`、`user` | 書き込み元がもっとも分散している |
| 管理・モデレーション | 各サービス | `admin/*`の書き込み 86 | `meta`、`moderation_log`、`role`ほか | `metaUpdated`は変更したキーだけを配る（P2-3） |
| チャット | `ChatService` | `chat/*`の書き込み 17、`inbox`ジョブ | `chat_message`、`chat_room`ほか | プロセス内の遅延（`setTimeout`）がある |
| 非正規化カウンタ | `CounterConsistencyService` | `check-counters`・`repair-counters`コマンド | `note`・`user`などのカウンタ列（`(dynamic)`） | 修復は運用コマンドだけ。通常の更新は各サービスが行う |

### 5.4 フェーズ5の単位: 連合とジョブ

| 単位 | 入口 | 内容 |
| --- | --- | --- |
| ActivityPubの受信 | `POST /inbox`、`POST /users/:user/inbox` → `inbox`ジョブ | 並列度は`inboxJobConcurrency`（既定16）。書き込むテーブルは22種類で、全ジョブで最多（2番目は`postScheduledNote`と`deleteAccount`の9） |
| ActivityPubの配送 | `deliver`ジョブ | 登録元が25メソッド。並列度は`deliverJobConcurrency`（既定128） |
| ActivityPubの公開 | ActivityPubのGETルート 14 | アクター、ノート、コレクション、公開鍵、絵文字、いいね、フォロー |
| Webhook | `userWebhookDeliver`、`systemWebhookDeliver` | 外向きHTTP。登録元はそれぞれ通常の送信とテスト送信の2つ |
| 定期処理 | `system`キューの14ジョブ | チャート3、クリーンアップ3、保持率、ミュートの期限、bake、モデレーターの活動確認、自動削除、予約削除・予約投稿の照合、`note_outbox`の掃除、インスタンスの受信数の反映 |
| インポート・エクスポート | `db`キューの17ジョブ | ドライブへの書き込みと、外部ファイルの取得 |
| 認証の発行 | `signin`系、`signup`系、OAuth、MiAuth、パスキー | `ApiServerService`に直接登録したルートとOAuthのルート |

### 5.5 Web画面とファイル

`ClientServerService`の42ルートは、OGP付きのHTML、フィード（Atom・RSS・JSON）、埋め込み、マニフェスト、静的アセット、URLプレビュー（`/url`）である。`FileServerService`の4ルートは、ファイル配信とプロキシである。

フェーズの割り当て（#9）は次のとおりとし、移行計画のフェーズ5に追記した。

- ファイル配信・プロキシ（`/files`、`/proxy`）は、フェーズ5のドライブと同じ単位にする。ストレージの読み方、画像の変換、外向きHTTPを共有するため。
- Web画面のHTML（OGP・埋め込み・フィード）は、ユーザー・ノートの参照（フェーズ3）が終わった後のフェーズ5に置く。`pack`と公開範囲の判定を使うため。
- 静的アセット（`/assets`、`/static-assets`、`/client-assets`など）はビルド成果物の配信で、業務の処理を持たない。振り分け層かRust版のどちらで配っても互換性に関わらないので、フェーズ1の振り分けの検証と一緒に扱う。
- URLプレビュー（`/url`）は外向きHTTPなので、`fetch-rss`と同じくSSRF対策の移植を先に行う。

## 6. 未確定一覧

### 6.1 使われていない、または届かないコード

| # | 項目 | 状態 | 判断 |
| --- | --- | --- | --- |
| 1 | `db/reportAbuse`ジョブ | 対応済み | P2-4で削除した |
| 2 | `relationship/unblock`ジョブ | 対応済み | 削除した（`createUnblockJob`、ワーカーの`unblock`の分岐、`RelationshipProcessorService.processUnblock`、テストの該当箇所）。呼び出し元はなく、上流でも同じだった |
| 3 | `objectStorage/autoDeleteNotes`の分岐 | 対応済み | P1-3で削除した |
| 4 | 内部イベント`mute`・`unmute`・`updateUserProfile` | 対応済み | 型を削除した（#2と同じPR）。発行箇所も購読箇所もなかった。Rust側の契約（[internal-events.md](../internal-events.md)）にも載せない |
| 5 | 内部イベント`unfollow`・`blockingCreated`・`blockingDeleted`・`policiesUpdated` | 判断済み | 残す。発行の費用は小さく、移行中にRust側がキャッシュの無効化に使う可能性がある。購読する予定がないことが決まった時点で、改めて発行をやめる |
| 6 | `scheduledNoteDelete`キュー | 対応済み | P1-1で`QUEUE_TYPES`に登録した |
| 13 | `db/deleteDriveFiles`ジョブ | 判断待ち | `createDeleteDriveFilesJob`の呼び出し元がない（今回の再生成で見つかった）。アカウントの削除は`deleteAccount`ジョブの中でドライブを消す。上流の状況を確認し、#2と同じく削除するか決める |

### 6.2 抽出では決められなかったもの

| # | 項目 | 状態 | 内容 |
| --- | --- | --- | --- |
| 7 | `kind`は`write:`だが書き込みを検出できなかった11エンドポイント | 確認済み | 次のとおり分類した。Rust版での担当を決めるときは、この分類を使う。`kind`は上流と同じ値で、トークンの権限の意味が変わるので直さない |
| 8 | 上流と同名でフォークが中身を変えたエンドポイント | 対応済み | `forkDiff`列を追加した（§4.2） |
| 9 | Web画面・ファイル配信のフェーズ | 判断済み | §5.5のとおり |
| 10 | チャートの書き込み先 | 対応済み | [charts.csv](charts.csv)を追加した（§4.4） |
| 11 | どの入口にも届かない書き込み位置 | 確認済み | 31から22に減った。残りは、ハブの中のもの18（`ApPersonService` 4、`SystemAccountService` 5、`ApNoteService` 2、`RemoteUserResolveService` 2、`PollService` 2（`ApNoteService`からだけ呼ばれる）、`ApImageService`、`ApQuestionService`、`MetaService`）と、チャートの基底クラスのもの4である。前者は[hubs.csv](hubs.csv)で数え、後者は§4.4で扱う。抽出の漏れや未使用のコードは残っていない |
| 12 | テストから参照されていない316エンドポイント | 方針を決めた | 名前の文字列で数えただけである。移行する単位ごとに、契約fixtureで補う範囲を決める（RUST-03） |

#7の分類:

| エンドポイント | 実際の書き込み先 |
| --- | --- |
| `admin/index/full`、`admin/index/reindex` | Elasticsearchの索引（外部への書き込み。`SearchService`のElasticsearchクライアントは抽出の対象外） |
| `admin/send-email` | メール（外部への書き込み） |
| `chat/read-all` | Redisのキーの削除（`pipeline`の中なので抽出できない） |
| `notifications/create`、`notifications/test-notification`、`notifications/flush`、`notifications/mark-all-as-read` | `notify`ハブ経由のRedis Stream・キーへの書き込み |
| `admin/system-webhook/list`、`admin/system-webhook/show`、`chat/rooms/members` | 書き込みなし。`kind`の付け方が読み取りと合っていない。Rust版では読み取りとして扱う |

### 6.3 計画側の未確定（この棚卸しの範囲外）

- 本番で実際に使われている設定（検索のprovider、オブジェクトストレージ、`dbReplications`、Redisの分離）。設定キーは359あるが、利用実績は運用側にしかない。
- 入口ごとの負荷の分布。RUST-02で測る。
- 連合の相手として検証するソフトウェアと版。

## 7. 次の作業

1. 未確定一覧の#13は上流を確認して判断する（#2・#4は削除済み）。
2. `emojis`の契約fixture（RUST-03）は作成済み。`forkDiff`で差分のないエンドポイントを次の参照APIに選ぶと、上流のテストと挙動を流用しやすい。
3. 技術的負債の設計書のP1-3・P1-4を進めるとき、[write-sites.csv](write-sites.csv)の`note`・`note_reaction`の行を、呼び出し元の一覧（同設計書の付録C）の元にする。
4. 対象コミットを進めたときは、再生成して差分を見る。行数と集計がこの文書と食い違ったら、この文書を直す。
