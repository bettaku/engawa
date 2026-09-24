---
title: MisskeyとCherryPickとの差異
description: engawaが、フォーク元であるCherryPickおよびMisskeyと、どこで異なるか。
---

engawaはCherryPickのフォークで、CherryPickはMisskeyのフォークです。このページは「Misskeyのつもりで使えるのはどこまでか」「CherryPickの記事をそのまま適用できるか」に答えるためのものです。

## このページの読み方

比較の基準は次のとおりです。

| | バージョン |
| --- | --- |
| engawa | `4.17.0-engawa20260408` |
| CherryPick | `4.17.0` |
| Misskey | `2025.10.2` |

掲載するのは、利用者から見える機能の**追加・削除・変更**だけです。内部のリファクタリング、依存パッケージの更新、パフォーマンス改善は載せていません。それらは[CHANGELOG](https://github.com/bettaku/engawa/blob/develop/CHANGELOG_engawa.md)をご覧ください。

各項目には確認に使ったAPIエンドポイントやファイルを添えています。記述が古くなっていないかを、読む側でも確かめられるようにするためです。

:::caution[連合上はCherryPickとして見えます]
engawaはnodeinfoでソフトウェア名を`cherrypick`として応答します。したがって他サーバーからは、engawaのサーバーはCherryPickのサーバーとして認識されます。これは互換性のための意図的な挙動です。
:::

## Misskeyとの差異のうち、CherryPick由来のもの

次の機能はCherryPickがMisskeyに対して加えたもので、engawaはそれを引き継いでいます。**engawa独自の機能ではありません。**

| 機能 | 確認に使ったもの |
| --- | --- |
| 投稿済みノートの編集 | `notes/update`、`NoteUpdateService.ts` |
| パスワードハッシュにArgon2idを使用 | `packages/backend/src/misc/password.ts` |
| サイコロウィジェット・検索ウィジェット | `packages/frontend/src/widgets/` |

CherryPickがMisskeyに対して持つ差異の全体は、[CherryPickのドキュメント](https://github.com/kokonect-link/cherrypick)を参照してください。ここでは、engawa独自の差異と混同しやすいものだけを挙げています。

## 追加された機能

CherryPick `4.17.0` に無く、engawaにあるものです。

### 投稿

- **公開範囲「プライベート」** — 自分だけが見られる公開範囲です。`visibility`に`private`を追加しています（`packages/backend/src/models/json-schema/note.ts`）。
- **ノートの最大文字数** — 後述の「変更された機能」を参照してください。

### 連合

- **`isIndexable`の連合** — kmyblueが提案する、ユーザー単位の検索インデックス登録可否を表すプロパティに対応しています（`MiUser.isIndexable`）。
- **検索許可の指定** — ノート単位で検索インデックスへの登録可否を指定できます（`searchableBy`）。
- **Authorized Fetch** — 送信元の署名を検証してからActivityを受け取る設定です（`Meta.enableAuthorizedFetch`、`Meta.enableBotProtectionForAuthorizedFetch`）。

### 管理者向け

- **ユーザーのセンシティブ指定** — ユーザー単位でセンシティブ扱いにできます（`admin/set-user-sensitive`、`admin/unset-user-sensitive`）。
- **ステータスページのURL設定** — `/about`にBetterstackやUptime Robotなどのステータスページを掲示できます（`Meta.statusUrl`）。
- **`robots.txt`のカスタマイズ** — 管理画面から内容を設定できます（`Meta.robotsTxt`）。
- **検索インデックスの再構築** — 全件の再構築と差分の再投入を管理画面から実行できます（`admin/index/full`、`admin/index/reindex`）。

## 削除された機能

CherryPick `4.17.0` とMisskey `2025.10.2` の両方にあり、engawaでは利用できないものです。UIから到達できず、対応するAPIエンドポイントもありません。

| 機能 | 削除されたもの |
| --- | --- |
| チャンネル | `channels/*` の全エンドポイント、`channel.vue`、`channels.vue`、`channel-editor.vue`、デッキのチャンネルカラム |
| リバーシ | `reversi/*` の全エンドポイント、`pages/reversi/` |
| バブルゲーム（ドロップ＆フュージョン） | `bubble-game/*` の全エンドポイント、`drop-and-fusion.vue` |

:::note[データベースとロケールには痕跡が残ります]
リバーシのマイグレーション（`packages/backend/migration/` の `*-reversi*.js`）とロケールの`_reversi:`ブロックは残っています。機能としては利用できませんが、テーブルと翻訳文字列は存在します。
:::

## 変更された機能

両方にあるものの、挙動や上限値が異なるものです。

| 項目 | engawa | CherryPick `4.17.0` | Misskey `2025.10.2` |
| --- | --- | --- | --- |
| ノートの最大文字数 | 5120 | 3000 | 3000 |

`packages/backend/src/const.ts` の `MAX_NOTE_TEXT_LENGTH` で定義しています。データベース側の上限（`DB_MAX_NOTE_TEXT_LENGTH`）は3者とも8192です。

:::note[yojo-artと共通する機能があります]
検索許可の指定、`isIndexable`の連合、ステータスページの掲示、ノートの最大文字数は、同じくCherryPickを土台とする[yojo-art](https://github.com/yojo-art/cherrypick)にも同様のものがあります。詳しくは[他のフォークとの比較](/engawa/compare/forks/)をご覧ください。
:::

## 既知の非互換

連合・API・データベースについて、他実装と噛み合わない点です。

- **公開範囲「プライベート」は他実装に伝わりません。** engawa独自の概念のため、他のサーバーから見ると意図した通りに扱われない可能性があります。engawaのサーバー内で完結する用途を想定しています。
- **nodeinfoのソフトウェア名は`cherrypick`です。** engawaとしては識別されません。
- **チャンネルを削除しているため、チャンネル付きのノートを受け取った場合の扱いがMisskey・CherryPickと異なります。**

## このページについて

記載が実装と食い違っている場合は、[Issue](https://github.com/bettaku/engawa/issues)でお知らせください。確認に使った情報を各項目に書いてあるのは、そのためです。
