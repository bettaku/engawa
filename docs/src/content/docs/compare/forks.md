---
title: 他のフォークとの比較
description: engawaと、CherryPick・Misskey・Sharkey・yojo-artとの機能の有無。
---

このページは、engawaと他のMisskey系フォークを機能の有無で比べたものです。網羅は目指していません。

:::caution[engawaが書いた表です]
中立な比較表ではありません。取り上げる機能はengawaを基準に選んでいるため、他の実装の長所が抜け落ちている可能性があります。
:::

## 記号の意味

| 記号 | 意味 |
| --- | --- |
| ○ | ある |
| ◌ | 一部のみ |
| × | ない |
| ? | 未調査、または公開情報から判断できない |

**優劣を表す記号は置いていません。** 「ある」か「ないか」だけを示します。どちらが優れているかは用途によるので、この表では判断しません。

「×」と「?」は区別しています。調べていないものを「ない」とは書きません。

## 調査の基準

| 実装 | リポジトリ | 調査対象 | 調査日 |
| --- | --- | --- | --- |
| engawa | [bettaku/engawa](https://github.com/bettaku/engawa) | `4.17.0-engawa20260408`（現行ツリー） | 2026-09-20 |
| CherryPick | [kokonect-link/cherrypick](https://github.com/kokonect-link/cherrypick) | `4.17.0` | 2026-09-20 |
| Misskey | [misskey-dev/misskey](https://github.com/misskey-dev/misskey) | `2025.10.2` | 2026-09-20 |
| Sharkey | [TransFem-org/Sharkey](https://activitypub.software/TransFem-org/Sharkey) | `develop` `9be347ef06`（2026-09-20） | 2026-09-20 |
| yojo-art | [yojo-art/cherrypick](https://github.com/yojo-art/cherrypick) | `1.11.1`（2026-09-15） | 2026-09-20 |

いずれも各リポジトリのソースコードを直接参照して判定しています。Sharkeyはリリースタグではなく`develop`ブランチの特定コミットを見ています。

yojo-artの`1.11.1`は`basedCherrypickVersion`が`4.17.0`で、engawaと同じCherryPickを土台にしています。

## 比較表

| 機能 | engawa | CherryPick | Misskey | Sharkey | yojo-art |
| --- | :---: | :---: | :---: | :---: | :---: |
| ノートの編集 | ○ | ○ | × | ○ | ○ |
| 編集履歴の閲覧 | × | × | × | ○ | × |
| 公開範囲「プライベート」 | ○ | × | × | × | × |
| 検索許可の指定 | ○ | × | × | × | ○ |
| `isIndexable`の連合 | ○ | × | × | × | ○ |
| Authorized Fetch | ○ | × | × | ○ | × |
| 高度な検索（OpenSearch） | × | × | × | × | ○ |
| チャンネル | × | ○ | ○ | ○ | ○ |
| リバーシ | × | ○ | ○ | ○ | ○ |
| バブルゲーム | × | ○ | ○ | ○ | ○ |
| ステータスページの掲示 | ○ | × | × | × | ○ |
| `robots.txt`の設定 | ○ | × | × | ○ | × |

ノートの最大文字数は記号で表せないため、別に示します。

| | engawa | CherryPick | Misskey | Sharkey | yojo-art |
| --- | :---: | :---: | :---: | :---: | :---: |
| ノートの最大文字数 | 5120 | 3000 | 3000 | 設定可能 | 5120 |

Sharkeyは定数ではなく設定値（`config.maxNoteLength`）で決まるため、サーバーごとに異なります。

## 判定の基準

それぞれ、何を満たせば「○」なのかを定めています。

- **ノートの編集** — 投稿済みの自分のノートを、削除・再投稿を経ずに同じノートIDのまま本文を変更できること。投稿前の下書きの編集は含めません。engawa・CherryPick・yojo-artは`notes/update`、Sharkeyは`notes/edit`と`NoteEditService.edit()`で実装しています。Misskey `2025.10.2` にはなく、「削除して編集」はノートIDが変わるため「×」としています。
- **編集履歴の閲覧** — 編集されたノートについて、過去の版を閲覧できること。Sharkeyの`notes/versions`で判定しています。
- **公開範囲「プライベート」** — 投稿時に、自分だけが見られる公開範囲を選べること。`visibility`が`private`を取りうるかで判定しています。
- **検索許可の指定** — ノート単位で検索インデックスへの登録可否を指定できること。`searchableBy`の有無で判定しています。
- **`isIndexable`の連合** — ユーザー単位の検索可否を表すプロパティを連合できること。`MiUser.isIndexable`の有無で判定しています。
- **Authorized Fetch** — ActivityPubのリクエストに対し、署名を検証してから応答する動作に対応していること。engawaは`Meta.enableAuthorizedFetch`、Sharkeyは`ActivityPubServerService`の`checkAuthorizedFetch()`で実装しています。**有効化の方法は実装ごとに異なります。**
- **高度な検索（OpenSearch）** — OpenSearchを用いた条件付きのノート検索ができること。`notes/advanced-search`と`AdvancedSearchService`の有無で判定しています。
- **チャンネル** — チャンネルを作成し、チャンネルにノートを投稿できること。`channels/create`の有無で判定しています。
- **リバーシ** — サーバー内でリバーシの対局ができること。`reversi/match`の有無で判定しています。
- **バブルゲーム** — ドロップ＆フュージョンで遊べること。`bubble-game/ranking`の有無で判定しています。
- **ステータスページの掲示** — `/about`に外部のステータスページへのリンクを掲示できること。`Meta.statusUrl`の有無で判定しています。
- **`robots.txt`の設定** — 管理画面から`robots.txt`の内容を設定できること。`Meta.robotsTxt`の有無で判定しています。

## この表で分からないこと

**この表は「誰が最初に実装したか」を表せません。** 横に並べた有無を見るだけでは、engawaが追加したのか、フォーク元から引き継いだだけなのかが区別できません。

たとえば「ノートの編集」はengawaが「○」でMisskeyが「×」ですが、これはengawaの独自機能ではありません。CherryPickが実装したものを引き継いでいるだけです。

engawa自身が何を足し引きしたのかは、[MisskeyとCherryPickとの差異](/engawa/compare/upstream/)をご覧ください。

## yojo-artについて

yojo-artはengawaと同じくCherryPick `4.17.0` を土台とするフォークで、engawaの上流ではありません。表を見ると分かるとおり、両者は似た機能を持っています。

- **共通するもの** — 検索許可の指定、`isIndexable`の連合、ステータスページの掲示、ノートの最大文字数5120。
- **yojo-artにのみあるもの** — 高度な検索（OpenSearch）。engawaも一度取り込みましたが、現在は削除済みです。
- **engawaにのみあるもの** — 公開範囲「プライベート」、Authorized Fetch、`robots.txt`の設定。

過去に双方向の取り込みがありました。リポジトリに同梱されている`CHANGELOG_yojo.md`はyojo-art側の履歴で、そこに載っている機能がengawaにあるとは限りません。
