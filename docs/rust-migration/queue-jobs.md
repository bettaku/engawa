# ジョブpayloadの一覧

pre-rust-tech-debt.md の P2-4（ジョブpayloadの版と形）で、BullMQのジョブpayloadを混在期間の共有契約として固定する。型は[queue/types.ts](../../packages/backend/src/queue/types.ts)、版の判定は[queue/job-version.ts](../../packages/backend/src/queue/job-version.ts)、処理結果の型は[queue/job-result.ts](../../packages/backend/src/queue/job-result.ts)。

キュー・ジョブ名・cron・副作用の一覧は、棚卸しの[inventory/queue-jobs.csv](inventory/queue-jobs.csv)にある。この文書はpayloadの形と版だけを扱う。

## 版

- すべてのジョブpayloadは版`v`を持つ。生成側（QueueService）は`v: 1`を書く（`JOB_DATA_VERSION`）。定期ジョブ（system queue）のテンプレートも`{ v: 1 }`を持つ。
- 処理側は、`v`がないジョブ（この版より前に登録されたもの）を`v: 1`とみなす。
- 処理側が受け付けない版のジョブは、処理の前に再試行しない失敗（`UnrecoverableError`）にする。失敗として残るので、処理側を更新した後に再実行（`admin/queue/retry-job`）できる。
- 受け付ける版は、キューとジョブ名ごとに`SUPPORTED_JOB_DATA_VERSIONS`で決める。

## 形の切り替え

形を変える種別は、新しい形に新しい版（`v: 2`）を付け、次の順で切り替える。

1. **第1リリース（このリリース）**: 処理側が新旧両方の版を受け付ける。生成側は旧い形（`v: 1`）のまま。
2. **第2リリース**: 生成側を新しい形に切り替える。
3. **第3リリース**: 旧い形のジョブが残っていないことを確かめてから、旧い形の処理を削除する。

ロールバック:

- 第2→第1リリースへは、そのまま戻せる（第1リリースの処理側は新しい形も処理できる）。
- 第1リリースより前の版へ戻すのは、新しい形のジョブが残っていないことを確かめてからにする。残っていると、旧い処理側はそれを処理できない（知らない形として誤動作するか失敗する）。

| キュー | ジョブ | v1（旧） | v2（新） | 状態 |
| --- | --- | --- | --- | --- |
| `inbox` | （ジョブ名はactivityのid） | `{ activity, signature: IParsedSignature }`（`@peertube/http-signature`の解析結果） | `{ v: 2, activity, signature: { keyId, algorithm, headers, signature, signingString }, request: { method, target, digest } }` | 第1リリース |
| `userWebhookDeliver` | （ジョブ名はwebhookのid） | `{ type, content, webhookId, userId, to, secret, createdAt, eventId }` | `{ v: 2, type, content, webhookId, userId, createdAt, eventId }` | 第1リリース |
| `systemWebhookDeliver` | （ジョブ名はwebhookのid） | `{ type, content, webhookId, to, secret, createdAt, eventId }` | `{ v: 2, type, content, webhookId, createdAt, eventId }` | 第1リリース |
| `db` | `importAntennas` | `{ user, antenna: Antenna[] }`（利用者がアップロードしたファイルの中身） | `{ v: 2, user, fileId }` | 第1リリース |

### inbox

署名の検証の担当は、v1・v2とも同じである。

- digestの検証: 受信時（ActivityPubServerService）。ジョブに入るのは検証済みのdigestである。
- 署名の暗号的な検証: worker（InboxProcessorService）。v2は`toParsedSignature`で`IParsedSignature`の形に組み立て直して検証する。

v2の`signature.algorithm`は、`parseRequest`が小文字にした値（`params.algorithm`）である。`signingString`は受信時に組み立てたものをそのまま持つ。`request.method`・`request.target`・`request.digest`は、署名の検証には使わないが、別の実装が受信時と同じ材料で検証し直せるように持つ。v2の組み立ては`buildInboxJobDataV2`で行う（第2リリースでActivityPubServerServiceから使う）。

### webhook

v2は送信先と`secret`を持たず、処理時にDBから読む。webhookが削除・無効化されていれば送らずに完了する（ユーザーのwebhookは、所有者が`userId`と異なる場合も送らない）。v1は登録した時点の送信先と`secret`で送り、処理時の有効・無効を見ない。

テスト送信（WebhookTestService）は、保存前の送信先と`secret`で送り、有効・無効の設定も無視するので、第2リリース以降もv1の形を使う。テスト送信は試行1回で、`secret`は送信者が入力した値である。

### importAntennas

v2はファイルのIDだけを持ち、中身は処理時に利用者のドライブから読む。ファイルが削除されていれば何もせずに完了する。アンテナの数の上限は、これまでどおり受付時（`i/import-antennas`）に確かめる。

## 形を変えない種別

次の種別は、形を変えずに`v: 1`だけを足した。

| キュー | ジョブ | payload |
| --- | --- | --- |
| `system` | 定期ジョブすべて | `{ v }`（中身は使わない） |
| `deliver` | （ジョブ名は送信先） | `{ user, content, digest, to, isSharedInbox }` |
| `relationship` | `follow`・`unfollow`・`block`・`unblock` | `{ from, to, silent?, requestId?, withReplies? }` |
| `db` | `deleteDriveFiles`・`exportCustomEmojis`・`exportNotes`・`exportClips`・`exportFavorites`・`exportMuting`・`exportBlocking`・`exportUserLists`・`exportAntennas`・`autoDeleteUserNotes` | `{ user }` |
| `db` | `exportFollowing` | `{ user, excludeMuting, excludeInactive }` |
| `db` | `importFollowing`・`importMuting`・`importBlocking`・`importUserLists`・`importCustomEmojis` | `{ user, fileId, withReplies? }` |
| `db` | `importFollowingToDb`・`importBlockingToDb` | `{ user, target, withReplies? }` |
| `db` | `deleteAccount` | `{ user, soft? }` |
| `db` | `truncateAccount` | `{ user }` |
| `db` | `syncNoteIndex` | `{ noteId }` |
| `objectStorage` | `deleteFile` | `{ key }` |
| `objectStorage` | `cleanRemoteFiles` | `{ v }` |
| `endedPollNotification` | （ジョブ名はノートのid） | `{ noteId }` |
| `postScheduledNote` | （ジョブ名はドラフトのid） | `{ noteDraftId }` |
| `scheduledNoteDelete` | （ジョブ名はノートのid） | `{ noteId }` |

`db`の`reportAbuse`は、payloadが`MiAbuseUserReport`の行全体で、版を持たない。生成している箇所がない（処理側だけが残っている）。この処理は通報の自動解決ルール（`admin/abuse-report-resolver/*`）を適用するもので、呼び出しがないため自動解決ルールが働いていない。削除するか、通報の受付から呼ぶように戻すかは別途決める。

## 処理結果

処理（processor）の結果は`JobResult`（`done`・`retry`・`fail`）で表し、BullMQの例外への対応は`toBullOutcome`だけで行う。

| 結果 | 意味 | BullMQでの扱い |
| --- | --- | --- |
| `done` | 完了。再試行しても結果が変わらないスキップを含む | 戻り値（メッセージ） |
| `retry` | 一時的な失敗 | `Error`を投げる。`attempts`とbackoffに従って再試行する |
| `fail` | 再試行しない失敗 | `UnrecoverableError`を投げる |

現在`JobResult`を返すのは、webhookの送信（`UserWebhookDeliverProcessorService.deliver`・`SystemWebhookDeliverProcessorService.deliver`）だけである。ほかの処理は、`UnrecoverableError`を直接投げている。
