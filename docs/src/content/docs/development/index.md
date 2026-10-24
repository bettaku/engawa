---
title: 開発者向けドキュメント
description: engawaの開発に関する技術的な情報と、コード全体に共通するルール
lastUpdated: 2026-10-24
sidebar:
  order: 1
---

このセクションには、engawaの開発に関する技術的な情報をまとめています。Issueの立て方・PRの送り方・リリースの手順など、プロジェクトへの参加のしかたについては [CONTRIBUTING.md](https://github.com/bettaku/engawa/blob/develop/CONTRIBUTING.md) を参照してください。

## ページ一覧

- [開発環境を作る](/engawa/development/setup/): 必要なソフトウェア、開発サーバーの起動、よく使うコマンド。
- [テスト](/engawa/development/testing/): フロントエンド・SDK・バックエンドのテストと、連合のE2Eテストの動かし方。
- [バックエンドの注意点](/engawa/development/backend/): NestJS・TypeORM・SQL・マイグレーションで気をつけること。
- [フロントエンドの注意点](/engawa/development/frontend/): Vue・ルーター（nirax）・アイコン・Storybook・CSSで気をつけること。
- [テーマのプロパティ](/engawa/development/theme-properties/): テーマファイルの各プロパティが、UIのどこに反映されるか。

## リポジトリの構成

pnpmのモノレポです。主なパッケージは次のとおりです。

| パッケージ | 役割 |
|---|---|
| `packages/backend` | APIサーバー（NestJS・Fastify・TypeORM・PostgreSQL・Redis・BullMQ） |
| `packages/frontend` | Webクライアント（Vue 3・Vite） |
| `packages/frontend-shared` | フロントエンドのパッケージ間で共有するコンポーネント・ユーティリティ |
| `packages/frontend-embed` | 埋め込み用のノート・タイムライン |
| `packages/sw` | Service Worker |
| `packages/cherrypick-js` | TypeScript SDK（型はバックエンドから自動生成） |
| `packages/icons-subsetter` | ビルド時に、使っているTabler Iconsだけを残す |
| `locales` | ロケールファイル（`ja-JP.yml` が原文） |
| `docs` | このドキュメントサイト（Starlight） |

## コード全体に共通するルール

### 言語とフォーマット

- TypeScriptは strict モードで書きます。
- フォーマットには [Biome](https://biomejs.dev/) を使います（Prettierは使いません）。各パッケージで `pnpm format:write` を実行すると整形されます。
- デフォルトエクスポート（`export default`）は避けます。
- 非nullアサーション（`!`）は避けます。

### ファイル名に `index` を使わない

ESMではディレクトリのインポートが廃止されています。また、ディレクトリとしてインポートしていなくても、ファイル名が `index` だと一部のライブラリがディレクトリのインポートとみなしてエラーになります。

### engawa（Misskey）固有の概念には `Mi` を付ける

TypeORMのエンティティ（`MiUser`・`MiNote`・`MiDriveFile` など）のように、Misskey由来のドメイン固有の概念には `Mi` を付けます。Googleが自社サービスを Map ではなく Google Map と呼ぶのと同じで、他のドメインの同じような概念と区別でき、名前の衝突も防げます。ただし、文脈からMisskeyのものだと明らかで、衝突の心配もない一時的なローカル変数に限っては、`Mi` を省略してかまいません。

### JSONのimportに気をつける

TypeScriptでJSONを `import` すると、`tsc` でコンパイルしたときに、そのJSONファイルも出力先にコピーされます。意図せずファイルが書き換わることがあるので、書き換えられて困るJSONは `import` ではなく `fs.readFileSync` などで読み込んでください。

### HTMLのクラス名に `follow` を使わない

広告ブロッカーに誤ってブロックされます。

### コミットメッセージ

`type(scope): 概要` の形式で書きます。`type` は `fix`・`refactor`・`feat`・`enhance`・`perf`・`chore` のいずれかです。PRのタイトルも同じ形式にします。
