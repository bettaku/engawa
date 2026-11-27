# 内部イベントの一覧（付録B）

pre-rust-tech-debt.md の P2-3（Pub/Subの内部イベントの本文とチャネル）の付録B。内部イベントは`GlobalEventService.publishInternalEvent`で発行し、Redisのチャネル`config.host`（ストリーミング配信と共用）に`{ channel: 'internal', message: { type, body } }`の形で流れる。型は[GlobalEventService.ts](../../packages/backend/src/core/GlobalEventService.ts)の`InternalEventTypes`。

## 本文の切り替え

エンティティ全体を載せていたイベントは、本文を最小限の「新本文」（`v: 2`を持つ）に切り替える。受信側は新本文を受け取ったら、DBから読み直す。

1. **第1リリース**: すべての受信側が、旧本文（エンティティ全体）と新本文の両方を処理できるようにする。発行側は旧本文のまま。このリリースを切り戻し先の最低版として固定する。
2. **第2リリース（このリリース）**: 発行側を新本文に切り替える（`toInternalEventRef`・`toRoleAssignmentEventRef`・`toMetaUpdatedEventRef`）。`publishInternalEvent`の型（`PublishedInternalEventTypes`）は、新本文を持つイベントに旧本文を渡すと型検査で失敗する。受信側は、切り戻しや入れ替えの途中に備えて旧本文も引き続き処理する。
   - **開始条件**: 内部イベントを受信するプロセス（APIとキュー・バックグラウンドのワーカーのすべて）が第1リリース以降の版に切り替わっていること。第1リリースより前の受信側は新本文をエンティティとして扱う。
3. **第3リリース以降（必要な場合だけ）**: 内部イベントを`<host>:internal`へ移す。

ロールバック: 第2→第1リリースへはそのまま戻せる（第1リリースの受信側は新本文も処理できる）。第1リリースより前へ戻すときは、次の順で行う。

1. すべてのプロセス（APIとキュー・バックグラウンドのワーカーのすべて）を第1リリースへ戻し、第2リリースのプロセスが残っていないこと（新本文を発行するプロセスがないこと）を確かめる。段階的に入れ替えている間は、残っている第2リリースのプロセスが新本文を発行し続ける。
2. その後で、第1リリースより前の版のプロセスを起動する。第1リリースより前の受信側は新本文をエンティティとして扱うので、新本文を発行するプロセスが残っている間は起動しない。

新本文の判定は`isInternalEventRef(body)`（`body.v === 2`）で行う。

一覧やキャッシュを持つ受信側（UserWebhookService・SystemWebhookService・AntennaService・RoleService・MetaService）は、新本文を受け取ったら、1件ずつDBから読み直して手元の一覧に反映するのではなく、一覧やキャッシュを捨てて次の取得でDBから読み直す。1件ずつ読み直すと、読み込み中に届いた後のイベント（削除など）や、取得中の一覧との順序が入れ替わり、削除済みの行を一覧に戻すことがある。捨てる前に始めた取得の結果は、キャッシュしない（世代を比べる）。旧本文で一覧を差分更新するときも世代を進め、取得中の一覧（その変更を含まない）を保存しない。Webhook・システムWebhook・アンテナの一覧は`ReloadableList`（[misc/reloadable-list.ts](../../packages/backend/src/misc/reloadable-list.ts)）で持ち、同時の読み込みを1つにまとめ、失敗したら短い間隔で再試行する（すべて失敗したらログに残す）。`metaUpdated`のGlobalModule・SystemAccountServiceは、受け取ったときにDBから読む（下の一覧の`metaUpdated`の行を参照）。

| 新本文の型 | 形 | 使うイベント |
| --- | --- | --- |
| `InternalEventRef<T>` | `{ v: 2, id }` | ロール、Webhook、システムWebhook、アンテナ、アバターデコレーションの作成・更新・削除 |
| `RoleAssignmentEventRef` | `{ v: 2, id, userId, roleId }` | `userRoleAssigned`、`userRoleUnassigned`（受信側のキャッシュがユーザーごとなので`userId`を持つ） |
| `MetaUpdatedEventRef` | `{ v: 2, changedKeys }` | `metaUpdated`（値は載せず、変わった列の名前だけ。除外する列の扱いはアドバイザリの[A5]に従う） |

## 一覧

「受信側」は、`redisForSub`の`message`でそのイベントを処理する箇所。ストリーミング（`StreamingApiServerService`）は内部イベントを処理しない。

| イベント | 旧本文 | 新本文 | 発行 | 受信側と処理 | 備考 |
| --- | --- | --- | --- | --- | --- |
| `userChangeSuspendedState` | `{ id, isSuspended }` | 変更なし | UserSuspendService | CacheService: ユーザーのキャッシュを読み直す | |
| `userChangeDeletedState` | `{ id, isDeleted }` | 変更なし | DeleteAccountService | CacheService: 同上 | |
| `userTokenRegenerated` | `{ id, oldToken, newToken }` | 変更なし | `i/regenerate-token` | CacheService: トークンのキャッシュを入れ替える | 本文にトークンを含む |
| `remoteUserUpdated` | `{ id }` | 変更なし | ApInboxService、ApPersonService、DeleteAccountProcessorService | CacheService: ユーザーのキャッシュを読み直す | |
| `localUserUpdated` | `{ id }` | 変更なし | AccountMoveService、`i/update` | CacheService: 同上 | |
| `follow` | `{ followerId, followeeId }` | 変更なし | UserFollowingService | CacheService: メモリ上のユーザーのフォロー数を加算し、`userFollowings`を消す | 購読処理に副作用（カウンタの加算）がある。P2-3の段階4でジョブか単一の担当へ移す |
| `unfollow` | `{ followerId, followeeId }` | 変更なし | UserFollowingService | なし | 発行しているが購読されていない |
| `blockingCreated`・`blockingDeleted` | `{ blockerId, blockeeId }` | 変更なし | UserBlockingService | なし | 同上 |
| `policiesUpdated` | `MiRole['policies']` | — | `admin/roles/update-default-policies` | なし | 同上。既定のポリシーは`metaUpdated`でも伝わる |
| `roleCreated`・`roleUpdated` | `MiRole` | `{ v: 2, id }` | RoleService | RoleService: 旧本文はロールのキャッシュに追加・置換、新本文はロールのキャッシュを捨てる。AbuseReportNotificationService（`roleUpdated`のみ）: 通報の通知先から権限のないユーザーを外す | |
| `roleDeleted` | `MiRole` | `{ v: 2, id }` | RoleService | RoleService: ロールのキャッシュから外す。AbuseReportNotificationService: 同上 | |
| `userRoleAssigned` | `MiRoleAssignment` | `{ v: 2, id, userId, roleId }` | RoleService | RoleService: 旧本文はユーザーの割り当てのキャッシュに追加、新本文はそのユーザーのキャッシュを捨てる | |
| `userRoleUnassigned` | `MiRoleAssignment` | `{ v: 2, id, userId, roleId }` | RoleService | RoleService: ユーザーの割り当てのキャッシュから外す。AbuseReportNotificationService: 同上 | |
| `webhookCreated`・`webhookUpdated`・`webhookDeleted` | `MiWebhook` | `{ v: 2, id }` | `i/webhooks/*` | UserWebhookService: 有効なWebhookの一覧を更新する。新本文は一覧を捨てる | 旧本文には`secret`を含む |
| `systemWebhookCreated`・`systemWebhookUpdated`・`systemWebhookDeleted` | `MiSystemWebhook` | `{ v: 2, id }` | SystemWebhookService | SystemWebhookService: 同上 | 旧本文には`secret`を含む |
| `antennaCreated`・`antennaUpdated`・`antennaDeleted` | `MiAntenna` | `{ v: 2, id }` | `antennas/*`、AntennaService、ImportAntennasProcessorService | AntennaService: 有効なアンテナの一覧を更新する。新本文は一覧を捨てる | 旧本文の`antennaCreated`は無効なアンテナも一覧に加えていた（新本文では加えない） |
| `avatarDecorationCreated`・`avatarDecorationUpdated`・`avatarDecorationDeleted` | `MiAvatarDecoration` | `{ v: 2, id }` | AvatarDecorationService | AvatarDecorationService: 一覧のキャッシュを捨てる（本文は使わない） | |
| `metaUpdated` | `{ before?: MiMeta, after: MiMeta }` | `{ v: 2, changedKeys }` | MetaService、`reset-db` | GlobalModule（注入済みの`meta`）: 旧本文は`after`を展開、新本文はDBから読み直す。MetaService: 旧本文は`after`をキャッシュ、新本文はキャッシュを捨てる。SystemAccountService: サーバー名が変わったら、システムアカウントの名前を更新する（届いた順に1つずつ。新本文は順番が来てからDBから名前を読む） | 購読処理に副作用（システムアカウントの更新）がある。P2-3の段階4で移す |
| `updateUserProfile` | `MiUserProfile` | — | なし | なし | 型だけが定義されていて、発行されていない |
| `userListMemberAdded`・`userListMemberRemoved` | `{ userListId, memberId }` | 変更なし | UserListService | UserListService: メンバーのキャッシュを更新する | P2-2で無効化の方法を変える |
