# RUST-01 棚卸し: 現行バックエンドの機能・設定・副作用

作成日: 2026-11-13

状態: 初版。機械抽出の結果と、そこから読み取れる担当単位の案。人による確認が要る項目は[未確定一覧](#6-未確定一覧)にまとめた。

関連: [Rust移行計画](../../RUST_BACKEND_MIGRATION_PLAN.md) §2・§5.1・§12（RUST-01）

## 1. この資料の位置づけ

移行計画のRUST-01は、成果物として「ルート／ジョブごとの担当表、参照コード、互換試験、未確定一覧」を求めている。この資料はその初版である。

- 表の本体はCSVで、`packages/backend/src`から機械的に生成する。手で編集しない。
- この文書には、CSVの読み方、集計、担当単位の案、未確定の項目を書く。
- 対象コミット: `05518ad068`（`summary.json`の`generatedFrom`）。

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
| [api-endpoints.csv](api-endpoints.csv) | 446 | `/api/*`のエンドポイント。認証、権限、レート制限、GET可否、キャッシュ秒数、由来、到達する書き込み・ジョブ・イベント・外部通信、参照しているテスト |
| [http-routes.csv](http-routes.csv) | 91 | エンドポイント表の外で登録しているHTTPルート（ActivityPub、Web画面、ファイル、OAuth、well-knownなど） |
| [stream-channels.csv](stream-channels.csv) | 16 | Streamingのチャンネル。購読するイベント、クライアントから受けるメッセージ |
| [queue-jobs.csv](queue-jobs.csv) | 45 | キューとジョブ。cron、並列度、制限、到達する副作用、登録元 |
| [write-sites.csv](write-sites.csv) | 365 | DBへ書き込むコード上の位置と、そこへ届く入口の数 |
| [tables.csv](tables.csv) | 79 | テーブルごとの書き込み元クラスと、届く入口の数 |
| [hubs.csv](hubs.csv) | 4 | ハブ層（§3.2）自体の副作用 |
| [config-keys.csv](config-keys.csv) | 368 | 設定スキーマのキー、型、既定値、対応する環境変数 |
| [env-vars.csv](env-vars.csv) | 20 | 環境変数と参照箇所 |
| [redis-commands.csv](redis-commands.csv) | 108 | Redisクライアントを直接呼ぶ箇所（接続、コマンド、第1引数） |
| [caches.csv](caches.csv) | 31 | Redis・メモリのキャッシュ定義とTTL |
| [internal-events.csv](internal-events.csv) | 33 | 内部イベントの型、発行箇所、購読箇所 |
| [timers.csv](timers.csv) | 25 | プロセス内のタイマーと`CollapsedQueue` |
| [summary.json](summary.json) | — | 集計値 |

## 3. 抽出の方法と限界

### 3.1 方法

1. 全クラスについて、コンストラクター引数とフィールドの型、メソッドの本体を取り出す。
2. メソッドごとに、次を記録する。
   - リポジトリへの書き込み（`insert`・`insertOne`・`update`・`delete`・`save`・`increment`・`decrement`・`upsert`など）
   - クエリビルダーとエンティティマネージャーでの書き込み、生のSQL
   - 他のサービスの呼び出し、`QueueService`の呼び出し、イベントの発行、Redisのコマンド
3. 入口（エンドポイント、ジョブ、チャンネル、サーバークラス）から呼び出しをたどり、届く副作用を集める。

### 3.2 ハブ層

次の層は、多数の入口から届き、それ自体が広い副作用を持つ。入口ごとの集計はここで打ち切り、「どのハブに触れるか」だけを`hubs`列に記録した。ハブ自体の副作用は[hubs.csv](hubs.csv)にある。

| ハブ | 対象 | 触れる入口 | 意味 |
| --- | --- | --- | --- |
| `pack` | `*EntityService` | API 248、ジョブ 21、チャンネル 10 | 表示用の変換。中でリモートの解決や更新をするものがある（技術的負債の設計書 P3-3） |
| `apResolve` | `core/activitypub/models/*`、`RemoteUserResolveService`、`ApResolverService`、`ApDbResolverService` | API 12、ジョブ 7 | リモートのユーザー・ノートの取得と作成。ノートの作成やドライブの更新まで届く |
| `notify` | `NotificationService` | API 20、ジョブ 13 | 通知の作成。Redis Streamへの書き込み、Web Push、購読の削除 |
| `lazyInit` | `MetaService.fetch`、`SystemAccountService.fetch`など | API 14、ジョブ 3 | 初回のアクセスで行を作る処理 |

ハブで打ち切らない場合、たとえば`following/create`は`note.insert`に届く。経路は`UserFollowingService.follow` → `AccountMoveService.validateAlsoKnownAs` → `ApPersonService.updatePerson` → `updateFeatured` → `ApNoteService.createNote`である。これは誤検出ではなく、実際にある経路である。`apResolve`に触れる入口は、移行単位を決めるときに個別に見る必要がある。

### 3.3 限界

- 静的な近似である。呼び出しの有無は条件分岐を見ていないので、実際より広く出る。
- 次のものは拾えない。
  - コールバックやアロー関数のプロパティ経由の呼び出し
  - 継承したメソッド
  - チャートの書き込み（`core/chart`はテーブルを動的に決める。`tickCharts`などが「書き込みなし」と出るのはこのため）
  - `pipeline`・`multi`の中のRedisコマンド
- `effect`列の`read`は「DBへの書き込みとジョブ登録を検出しなかった」という意味である。認証に伴う更新（トークンの`lastUsedAt`、IP履歴）とレート制限のカウンターは、全エンドポイント共通の処理（`ApiCallService`・`AuthenticateService`）にあり、この列には含めていない。
- `origin`列は、エンドポイント名が上流にあるかどうかだけで決めている。上流と同じ名前で、フォークが中身を変えたものは`misskey`と出る。

## 4. 集計

### 4.1 入口

| 種類 | 数 | 補足 |
| --- | ---: | --- |
| APIエンドポイント | 446 | 認証なし 103、ユーザー 252、モデレーター 71、管理者 20 |
| エンドポイント表の外のHTTPルート | 91 | Web画面 42、ActivityPub 16、API直下 10、well-known 7、OAuth 4、ファイル 4、ほか 8 |
| Streamingチャンネル | 16 | 認証なしで使えるもの 8 |
| ジョブ | 45 | キューは11。cronで動くもの 11（うち1つは到達しない重複。§5.4） |
| CLIコマンド | 2 | `ping`、`reset-captcha`（`boot/cli.ts`）。ほかに`check:config` |

### 4.2 APIエンドポイント

| 項目 | 数 |
| --- | ---: |
| DBへの書き込みまたはジョブ登録に届く | 234 |
| Redisへの書き込みだけに届く | 2 |
| `kind`は`write:`だが書き込みを検出できなかった | 11 |
| 書き込みを検出しなかった | 199 |
| GETを許可（`allowGet`） | 26 |
| 応答スキーマ（`res`）がない | 165 |
| テストから名前で参照されていない | 318（書き込み系247のうち163） |

由来は、Misskeyと同名が407、CherryPickで追加が35、engawaで追加が4である。

engawaで追加した4つは、`admin/index/full`、`admin/index/reindex`、`admin/set-user-sensitive`、`admin/unset-user-sensitive`である。CherryPickで追加した35のうち、まとまっているのは次のとおり。

- ユーザーグループ: `users/groups/*` 12、`i/user-group-invites`
- ノートの編集・履歴: `notes/update`、`notes/history`
- 自動削除・アカウントの切り詰め: `i/auto-delete-settings`、`i/update-auto-delete-settings`、`i/truncate-account`
- 通報の自動処理: `admin/abuse-report-resolver/*` 4
- そのほか: `notes/bubble-timeline`、`notes/events/search`、`notes/polls/translate`、`users/translate`、`users/stats`、`flash/gen-token`、`federation/remote-software`、`admin/emoji/steal`、`admin/avatar-decorations/copy`・`list-remote`、`admin/invite/revoke`、`chat/rooms/invitations/cancel`・`reject`

### 4.3 データ

| 項目 | 数 |
| --- | ---: |
| エンティティ（テーブル） | 75 |
| DBへ書き込むコード上の位置 | 365（リポジトリ 312、エンティティマネージャー 27、クエリビルダー 22、生のSQL 4） |
| 設定キー | 368（最上位 50） |
| 環境変数 | 20（`NODE_ENV`の参照が38箇所） |
| Redisを直接呼ぶ箇所 | 108（`redisClient` 57、`redisForSub` 25、`redisForTimelines` 13、`redisForReactions` 8） |
| キャッシュ定義 | 31（Redis 12、メモリだけ 19） |
| 内部イベントの型 | 33（エンティティ全体を載せるもの 18） |
| プロセス内のタイマー | 25 |

書き込み元のクラスが多いテーブルは、`user_profile`（21クラス）、`user`（19）、`note`（10）、`following`（6）、`instance`（6）である。移行計画§5.1の「担当実装を一つに固定する」ときに、呼び出し元の整理がもっとも重くなるのはこの5つである。

## 5. 担当単位の案

移行計画§5.1は、ルート単位ではなく「業務操作と、その操作を呼ぶ全経路」を移行単位にすると定めている。以下は、抽出結果から読み取れる単位の案である。確定は未確定一覧の解消後に行う。

### 5.1 フェーズ2の候補: 認証なしで副作用のない参照

認証なしでGETを許可し、書き込みを検出しなかったエンドポイントは26ある。計画が最初の対象に選んだ`emojis`もこの中にある。

| まとまり | エンドポイント | ハブ | 備考 |
| --- | --- | --- | --- |
| 絵文字 | `emojis`、`emoji` | `pack` | `cacheSec` 3600。テストからの参照はない。fixtureを新しく作る必要がある |
| 装飾 | `get-avatar-decorations` | なし | |
| チャート | `charts/*` 12 | なし | チャートの読み取りは動的なテーブルを使う（§3.3）。DB層の検証に向く |
| 統計 | `retention`、`server-info`、`get-online-users-count`、`hashtags/trend`、`federation/stats` | 一部`pack` | `server-info`はホストの情報を読む。`get-online-users-count`と`hashtags/trend`はRedisを読む |
| ノートの一覧 | `notes/featured`、`users/featured-notes`、`notes/reactions` | `pack` | ノートの`pack`が要る。公開範囲の判定を伴うのでフェーズ3に送る |
| 連合 | `federation/instances`、`federation/remote-software` | `lazyInit` | |
| 外部取得 | `fetch-rss` | なし | 外向きHTTP。SSRF対策の移植が先に要る |

`emojis`の次の候補は、ハブに触れない`get-avatar-decorations`、`retention`、`charts/*`である。

### 5.2 フェーズ3の単位: 認証付きの参照と配信

| 単位 | 入口 | 先に要るもの |
| --- | --- | --- |
| 認証・権限の共通処理 | 全エンドポイント、全チャンネル | トークンの種類（native・app・MiAuth・flash）、ロール、凍結、レート制限。認証に伴う更新の担当 |
| ユーザーの参照 | `users/*`の読み取り 25、`i`の読み取り 20 | `pack`からの書き込みと外部通信の除去（P3-3）。`users/show`は`apResolve`に触れる |
| ノートの参照・タイムライン | `notes/*`の読み取り 27、チャンネル 10 | 公開範囲の判定表（P2-7）、`redisForTimelines`のデータ形式 |
| Streaming | チャンネル 16、`/streaming` | Pub/Subのチャネルと本文の契約（P2-3） |

### 5.3 フェーズ4の単位: 業務操作

書き込みに届く入口が複数の種類にまたがる操作を、[write-sites.csv](write-sites.csv)から拾った。

| 操作 | 中心のサービス | 届く入口 | 書き込むテーブル（中心のもの） | 注意点 |
| --- | --- | --- | --- | --- |
| ノートの作成 | `NoteCreateService` | `notes/create`、`postScheduledNote`ジョブ、`inbox`ジョブ（`apResolve`経由） | `note`、`poll`、`event`、`hashtag`、`user`、`instance` | 後処理は`setImmediate`（P3-1）。`deliver`、`endedPollNotification`、`scheduledNoteDelete`、`userWebhookDeliver`を登録する |
| ノートの削除 | `NoteDeleteService` | API 2、ジョブ 3 | `note`、`instance`、`moderation_log` | これとは別に、`notesRepository.delete`を直接呼ぶジョブが3つある（P1-3） |
| ノートの編集 | `NoteUpdateService` | `notes/update` | `note`、履歴 | CherryPickで追加。後処理は`setImmediate` |
| リアクション | `ReactionService`、`ReactionsBufferingService` | API、`inbox`ジョブ、`bakeBufferedReactions`ジョブ | `note`、`note_reaction` | `redisForReactions`に未反映の差分を持つ（P1-4） |
| フォロー・ブロック | `UserFollowingService`、`UserBlockingService` | `following/*` 8、`relationship`ジョブ 4、`inbox`ジョブ | `following`、`follow_request`、`blocking`、`user`、`instance` | `apResolve`に触れる。`notify`に触れる |
| ドライブ | `DriveService` | `drive/*` 8、エクスポート系ジョブ 9、`deleteDriveFiles`、`cleanRemoteFiles`、`apResolve` | `drive_file` | ストレージ（S3互換・ローカル）、画像・動画処理、外向きHTTP |
| アカウントの削除・切り詰め | 各ジョブ | `deleteAccount`、`truncateAccount` | `user`、`note`、`drive_file`、`page` | メール送信を伴う |
| プロフィール・設定 | 21クラス | `i/*`の書き込み 41 | `user_profile`、`user` | 書き込み元がもっとも分散している |
| 管理・モデレーション | 各サービス | `admin/*`の書き込み 86 | `meta`、`moderation_log`、`role`ほか | `metaUpdated`は`MiMeta`全体を配る（P2-3） |
| チャット | `ChatService` | `chat/*`の書き込み 17、`inbox`ジョブ | `chat_message`、`chat_room`ほか | プロセス内の遅延（`setTimeout`）がある |

### 5.4 フェーズ5の単位: 連合とジョブ

| 単位 | 入口 | 内容 |
| --- | --- | --- |
| ActivityPubの受信 | `POST /inbox`、`POST /users/:user/inbox` → `inbox`ジョブ | 並列度は`inboxJobConcurrency`（既定16）。書き込むテーブルは22種類で、全ジョブで最多（2番目は`postScheduledNote`の8） |
| ActivityPubの配送 | `deliver`ジョブ | 登録元が26メソッド。並列度は`deliverJobConcurrency`（既定128） |
| ActivityPubの公開 | ActivityPubのGETルート 14 | アクター、ノート、コレクション、公開鍵、絵文字、いいね、フォロー |
| Webhook | `userWebhookDeliver`、`systemWebhookDeliver` | 外向きHTTP |
| 定期処理 | `system`キューの10ジョブ | チャート3、クリーンアップ3、保持率、ミュートの期限、bake、モデレーターの活動確認、自動削除 |
| インポート・エクスポート | `db`キューの17ジョブ | ドライブへの書き込みと、外部ファイルの取得 |
| 認証の発行 | `signin`系、`signup`系、OAuth、MiAuth、パスキー | `ApiServerService`に直接登録したルートとOAuthのルート |

### 5.5 Web画面とファイル

`ClientServerService`の42ルートは、OGP付きのHTML、フィード（Atom・RSS・JSON）、埋め込み、マニフェスト、静的アセット、URLプレビュー（`/url`）である。`FileServerService`の4ルートは、ファイル配信とプロキシである。どちらも移行計画§2の表に載っているが、フェーズの割り当ては計画にない。未確定一覧の#9に挙げた。

## 6. 未確定一覧

抽出の過程で見つかった、判断または人による確認が要る項目である。

### 6.1 使われていない、または届かないコード

| # | 項目 | 根拠 | 判断すること |
| --- | --- | --- | --- |
| 1 | `db/reportAbuse`ジョブ | `createReportAbuseJob`の呼び出し元がない | 削除するか（技術的負債の設計書 P2-4と同じ結論） |
| 2 | `relationship/unblock`ジョブ | `createUnblockJob`の呼び出し元がない | 削除するか、上流の意図を確認する |
| 3 | `objectStorage/autoDeleteNotes`の分岐 | cronは`system`キューにだけ登録される | 削除する（P1-3に含まれる） |
| 4 | 内部イベント`mute`・`unmute`・`updateUserProfile` | 型はあるが発行箇所がない | 型を削除するか |
| 5 | 内部イベント`unfollow`・`blockingCreated`・`blockingDeleted`・`policiesUpdated` | 発行するが購読箇所がない | 発行をやめるか。Rust側で購読する予定があるなら残す |
| 6 | `scheduledNoteDelete`キュー | `QUEUE_TYPES`にないので管理画面から見えない | P1-1で登録する |

### 6.2 抽出では決められなかったもの

| # | 項目 | 内容 |
| --- | --- | --- |
| 7 | `kind`は`write:`だが書き込みを検出できなかった11エンドポイント | `admin/index/full`、`admin/index/reindex`、`admin/send-email`、`admin/system-webhook/list`、`admin/system-webhook/show`、`chat/read-all`、`chat/rooms/members`、`notifications/create`、`notifications/flush`、`notifications/mark-all-as-read`、`notifications/test-notification`。通知系は`notify`ハブ（Redis Stream）へ書くと見られる。検索索引とメールは外部への書き込みである。いずれも個別には確認していない。`system-webhook/list`・`show`と`chat/rooms/members`は、`kind`の付け方が読み取りと合っていない可能性がある |
| 8 | 上流と同名でフォークが中身を変えたエンドポイント | `origin`列では分からない。`git diff 2025.10.2 -- packages/backend/src/server/api/endpoints`で差分のあるファイルを列挙し、列を追加する |
| 9 | Web画面・ファイル配信のフェーズ | 移行計画のフェーズ表に割り当てがない |
| 10 | チャートの書き込み先 | 動的なテーブルなので抽出できていない。`core/chart`を別に棚卸しする |
| 11 | どの入口にも届かない書き込み位置が31ある | 多くはハブの中（`ApPersonService` 8、`SystemAccountService` 5）とチャート（6）。残りの`AvatarDecorationService`、`PollService`、`NoteCreateService`、`MetaService`の各位置は、抽出の漏れか未使用かを確認する |
| 12 | テストから参照されていない318エンドポイント | 名前の文字列で数えただけである。移行する単位ごとに、契約fixtureで補う範囲を決める（RUST-03） |

### 6.3 計画側の未確定（この棚卸しの範囲外）

- 本番で実際に使われている設定（検索のprovider、オブジェクトストレージ、`dbReplications`、Redisの分離）。設定キーは368あるが、利用実績は運用側にしかない。
- 入口ごとの負荷の分布。RUST-02で測る。
- 連合の相手として検証するソフトウェアと版。

## 7. 次の作業

1. 未確定一覧の#1〜#6を判断し、削除するものはRust移行と別のPRで消す。
2. #8（フォークで中身を変えたエンドポイント）の列を生成スクリプトに足す。
3. `emojis`の契約fixtureを作る（RUST-03）。テストからの参照がないので、既存のテストは流用できない。
4. 技術的負債の設計書のP1-3・P1-4を進めるとき、[write-sites.csv](write-sites.csv)の`note`・`note_reaction`の行を、呼び出し元の一覧（同設計書の付録C）の元にする。
