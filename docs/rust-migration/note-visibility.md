# ノートの公開範囲の判定表

pre-rust-tech-debt.md の P2-7（公開範囲判定の単一仕様化）。ノートを誰が見られるかの判定は複数の系統に分かれていて、それぞれが独自に実装している。この文書は、それらが従うべき判定表と、現在の系統ごとの差をまとめる。

- 判定表の本体: [test/fixtures/note-visibility.json](../../packages/backend/test/fixtures/note-visibility.json)。Rust実装の受入試験でも、同じファイルを読む。
- 共通テスト: [test/unit/note-visibility.ts](../../packages/backend/test/unit/note-visibility.ts)。判定表のすべての組み合わせについて、各系統の結果を確かめる。

## 判定表

行は公開範囲、列は閲覧者とノートの関係。○は見られる、×は見られない、—はその組み合わせが起きないもの。

| 公開範囲 | 未ログイン | 投稿者 | フォロワー | 無関係 | 指名の相手 | メンションされた | 返信先の投稿者 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public` | ○ | ○ | ○ | ○ | — | ○ | ○ |
| `home` | ○ | ○ | ○ | ○ | — | ○ | ○ |
| `followers` | × | ○ | ○ | × | — | ○ | ○ |
| `specified` | × | ○ | × | × | ○ | × | × |
| `private` | × | ○ | × | × | — | 未決定 | × |

- 「指名の相手」は、ノートの`visibleUserIds`に含まれる閲覧者。`visibleUserIds`を持つのは`specified`のノートだけである。
- 「メンションされた」は、ノートの`mentions`に含まれるが、`visibleUserIds`には含まれない閲覧者。ローカルで`specified`のノートを作るときは、メンションした相手を`visibleUserIds`に加えるので、この関係になるのは主にリモートのノートである。
- 「返信先の投稿者」は、ノートの`replyUserId`が閲覧者であるもの。
- `private`でメンションされた閲覧者に見せるかどうかは決まっていない（pre-rust-tech-debt.md §8-4）。共通テストは、この組み合わせの結果を判定表と照合しない。

### 投稿者の設定

公開範囲で見られる場合に、投稿者の設定でさらに絞り込む。投稿者本人は常に見られる。

| 設定 | 判定 |
| --- | --- |
| `requireSigninToViewContents` | 未ログインの閲覧者には見せない |
| `makeNotesHiddenBefore` | 該当するノートを、投稿者以外に見せない |
| `makeNotesFollowersOnlyBefore` | 該当する`public`・`home`のノートを、`followers`の行で判定する |

### 範囲外

- リモートの閲覧者。`isVisibleForMe`は、投稿者と閲覧者がどちらもリモートのとき、フォロー関係を知りえないのでフォロワーとみなす。これはActivityPubの受信処理のための扱いで、閲覧の判定とは別に扱う。
- ミュート・ブロック、連合の停止、チャンネル、ロールのタイムラインなど、公開範囲以外の絞り込み。
- 検索の`searchableBy`。検索は、公開範囲の判定（SQLの系統）に加えて`searchableBy`で絞り込む。

## 系統

| 系統 | 実装 | 投稿者の設定 | 用途 |
| --- | --- | --- | --- |
| `query` | `QueryService.generateVisibilityQuery` | 見ない | タイムライン、検索（SQL）などの一覧 |
| `isVisibleForMe` | `NoteEntityService.isVisibleForMe` | 見ない | 個別のノートへの操作の前の確認 |
| `streaming` | Streamingの`Channel.isNoteVisibleForMe` | 見ない | Streamingのチャンネルに流すかどうか |
| `isCurrentlyVisibleForMe` | `NoteEntityService.isCurrentlyVisibleForMe` | 見る | ノートの内容や、ノートに紐づく情報を返す前の認可 |
| `packed` | `NoteEntityService.shouldHideNote` | 見る | packしたノートの内容を隠すかどうか（API・Streaming） |

一覧（`query`）やStreaming（`streaming`）の系統は、投稿者の設定を見ない。これらで返したノートは、packするときに`shouldHideNote`で内容を隠す。

次の系統は、共通テストではまだ扱っていない。

- 検索のElasticsearch: `public`・`home`のノートだけを索引に入れ、それ以外は索引から消す（P1-5）。
- ActivityPub（`ActivityPubServerService`）: 閲覧者によらず、`public`・`home`で`localOnly`でないノートだけを返す。

## 既知の差

判定表と異なる結果を返す系統。共通テストの`knownDeviations`に同じものを書いている。差を直したら、両方から消す。

| 組み合わせ | 系統 | 現在の結果 | 判定表 | 備考 |
| --- | --- | --- | --- | --- |
| `specified` / メンションされた | `query` | ○ | × | SQLは公開範囲によらず`mentions`を見る。packで内容を隠す |
| `private` / メンションされた | `query`・`streaming` | ○ | 未決定 | §8-4で決める。`isVisibleForMe`・`isCurrentlyVisibleForMe`・`packed`は× |
| `private` / 投稿者以外（未ログイン・フォロワー・無関係・返信先の投稿者） | `streaming` | ○ | × | `Channel.isNoteVisibleForMe`は`private`を扱わない。packで内容を隠す |

修正済み:

- `followers` / 返信先の投稿者: `isVisibleForMe`・`isCurrentlyVisibleForMe`が、`reply`リレーションを読み込んでいないノートでは×を返していた。`replyUserId`を見るようにした。
