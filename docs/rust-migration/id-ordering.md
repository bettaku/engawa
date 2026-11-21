# IDの生成と順序

pre-rust-tech-debt.md の P2-9（IDの生成・比較の仕様）。タイムライン、ページング、自動削除（`id < gen(date)`）、通知の既読位置は、IDやRedis Stream IDの大小比較に依存している。この文書は、その比較が成り立つための前提をまとめる。Rust実装も同じ前提に従う。

- テスト: [test/unit/misc/id-ordering.ts](../../packages/backend/test/unit/misc/id-ordering.ts)（IDの方式ごとの順序とPostgreSQLとの一致）、[test/unit/misc/redis-stream-id.ts](../../packages/backend/test/unit/misc/redis-stream-id.ts)（Stream IDの比較）、[test/unit/NotificationService.ts](../../packages/backend/test/unit/NotificationService.ts)（既読位置の判定）
- 実装: [core/IdService.ts](../../packages/backend/src/core/IdService.ts)、[misc/id/](../../packages/backend/src/misc/id/)、[misc/redis-stream-id.ts](../../packages/backend/src/misc/redis-stream-id.ts)

## IDの方式

方式は設定ファイルの`id`で選ぶ（既定は`aidx`）。運用中に方式を変えると、新旧のIDの大小が時刻順にならないので、変えてはならない。

| 方式 | 長さ | 文字 | 時刻部分 | 時刻の分解能 | 時刻以外の部分 |
| --- | --- | --- | --- | --- | --- |
| `aid` | 10 | `[0-9a-z]` | 先頭8文字。2000-01-01からの経過ミリ秒（base36） | 1ms | 2文字のカウンタ（プロセスごとに乱数で始まる） |
| `aidx` | 16 | `[0-9a-z]` | 先頭8文字。aidと同じ | 1ms | 4文字のノードID（プロセスごとの乱数）＋4文字のカウンタ |
| `meid` | 24 | `[0-9a-f]` | 先頭12文字。UNIX時刻（ms）＋`0x800000000000`（hex） | 1ms | 12文字の乱数 |
| `meidg` | 24 | `g[0-9a-f]` | 2〜12文字目。UNIX時刻（ms、hex） | 1ms | 12文字の乱数 |
| `ulid` | 26 | Crockford's Base32（大文字。I・L・O・Uを除く） | 先頭10文字。UNIX時刻（ms） | 1ms | 16文字（80ビット）の乱数 |
| `objectid` | 24 | `[0-9a-f]` | 先頭8文字。UNIX時刻（秒、hex） | 1秒 | 16文字の乱数 |

## 順序の前提

1. **固定長・ASCII**: 同じ方式のIDは同じ長さで、上の表の文字だけからなる。
2. **時刻順**: 時刻部分が違う（分解能の単位で）2つのIDは、文字列として比較すると時刻の順に並ぶ。
3. **同じ時刻の中の順序は決まっていない**: 時刻部分が同じIDどうしの大小は、生成した順とは限らない。カウンタは桁あふれで戻り、ノードIDや乱数はプロセスごとに違う。同じ時刻のIDの大小に意味を持たせてはならない。ただし大小は全順序なので、IDによるページングで取りこぼしや重複は起きない。
4. **比較の一致**: JavaScriptの文字列比較（UTF-16のコード単位順）、バイト列の比較（PostgreSQLの`C`照合順序）、PostgreSQLの`varchar`列の既定の照合順序（`en_US.utf8`など）での`ORDER BY`・`<`は、同じ方式のIDについて同じ結果になる。1と、使う文字が英数字の片方の大文字小文字だけであることによる。
   - FanoutTimeline（[FanoutTimelineService.ts](../../packages/backend/src/core/FanoutTimelineService.ts)）はRedisのリストから取ったIDをJSで比較し、DBへのフォールバックはSQLで比較する。この2つが同じ順序になるのは、この前提による。
5. **時刻の上限**: 時刻部分の桁数で表せる範囲を超えると、2の前提が崩れる。`aid`・`aidx`は2089年頃、`objectid`は2106年まで。
6. **未来の時刻**: `IdService.gen(t)`は、`t`が現在より未来のときは現在時刻でIDを作る。

### 自動削除などの境界（`id < gen(date)`）

`gen(date)`は時刻`date`のIDを1つ作る。このIDより小さいIDは次のとおり。

- 時刻が`date`より前（分解能の単位で）のIDは、すべて小さい（前提2）。
- 時刻が`date`と同じIDは、小さいとは限らない（前提3）。境界のミリ秒（`objectid`では秒）のIDが、削除の対象になるかどうかは決まっていない。

境界をこれより厳密にする必要がある処理は、`id`ではなく作成日時の列で判定する。

## 通知のRedis Stream ID

通知はユーザーごとのRedis Stream（`notificationTimeline:<userId>`）に、IDから作ったStream IDで書き込む（`XADD`でIDを指定する）。

- Stream IDは`<ms>-<seq>`の形で、`ms`はIDの時刻部分（`IdService.parseFull`の`date`）、`seq`は時刻以外の部分を数値にしたもの（`additional`）。
- `ms`と`seq`は、どちらも符号なし64ビット整数でなければならない（Redisの制約）。`additional`は64ビットに収まるように作る。`ulid`は乱数部が80ビットあるので、上位64ビットを使う。
- 時刻以外の部分は固定長なので、数値にしても大小は変わらない。そのため、Stream IDの順序はIDの文字列の順序と一致する。`ulid`だけは、上位64ビットが同じ2つのIDが同じStream IDになりうる。その場合は`XADD`が失敗し、IDを作り直す。
- 書き込むStream IDが、Streamの最後の要素以下だと`XADD`は失敗する。同じミリ秒に複数のプロセスが通知を作るとき、またはStreamの最後の要素より小さいIDができたときに起きる。このときはIDを作り直して再試行する。

### 既読位置

`latestReadNotification:<userId>`は、最後に既読にした通知のStream IDを文字列で持つ。

- 既読位置と通知のStream IDは、`ms`、`seq`の順に**数値として**比較する（[misc/redis-stream-id.ts](../../packages/backend/src/misc/redis-stream-id.ts)の`compareRedisStreamId`）。文字列として比較すると、同じミリ秒で`seq`の桁数が違うときに誤る（`"1700000000000-9" > "1700000000000-10"`）。
- 既読位置がない、または`<ms>-<seq>`の形で読めない場合は、未読として扱う。
- 未読数（[UserEntityService.ts](../../packages/backend/src/core/entities/UserEntityService.ts)）は、Redisの`XREVRANGE`に既読位置を渡して数える。Redisが数値として比較するので、この経路は文字列比較の影響を受けない。
