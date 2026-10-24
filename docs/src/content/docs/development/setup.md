---
title: 開発環境を作る
description: engawaの開発に必要なソフトウェアと、開発サーバーの起動、よく使うコマンド
lastUpdated: 2026-10-24
sidebar:
  order: 2
---

engawaの開発環境を作り、開発サーバーを起動するまでの手順です。サーバーとして運用するための手順は [インストール](/engawa/install/) を参照してください。

## 必要なもの

| ソフトウェア | 備考 |
|---|---|
| Node.js | バージョンはリポジトリの `.node-version` に書かれています（24系） |
| pnpm | `corepack enable` で、`package.json` の `packageManager` に書かれたバージョンが使われます |
| PostgreSQL | 15以上 |
| Redis | 7系 |
| FFmpeg | 動画のサムネイル生成などに使います |
| Git | サブモジュール（`fluent-emojis`）があるので `--recursive` で取得します |

:::caution[Windowsの場合]
WSL上でcloneしてください。Git for Windowsでcloneすると、改行コードの違いでファイルが壊れます。
:::

## ソースコードを取得する

```bash
git clone --recursive https://github.com/bettaku/engawa.git
cd engawa
pnpm install --frozen-lockfile
```

すでにcloneしていてサブモジュールを取得していない場合は、`git submodule update --init` を実行します。

## PostgreSQLとRedisを用意する

次のどれかの方法で用意します。

### Docker Composeを使う

PostgreSQLとRedisだけをコンテナで起動する設定が用意されています。

```bash
docker compose -f compose.local-db.yml up -d
```

データベースのユーザー名・パスワードは `.config/docker.env` で決まります（`.config/docker_example.env` をコピーして作ります）。

### システムに直接入れる

パッケージマネージャーなどで、PostgreSQLとRedisをシステムに入れてもかまいません。

### Dev Containerを使う

VS Codeの Dev Containers 拡張で、リポジトリのディレクトリを開きます。コンテナ内で次のコマンドが自動で実行され、データベースまで準備されます。

```bash
git submodule update --init
pnpm install --frozen-lockfile
cp .devcontainer/devcontainer.yml .config/default.yml
pnpm build
pnpm migrate
```

## 設定ファイルを書く

```bash
cp .config/example.yml .config/default.yml
```

`.config/default.yml` の `url`・`db`・`redis` を、自分の環境に合わせます。開発中は `url: http://localhost:3000/` のようにしておけば十分です。

設定ファイルのパスは、環境変数 `CHERRYPICK_CONFIG_YML` で変えられます（例: `2nd.yml`）。その他の環境変数は [バックエンドの環境変数](/engawa/install/environment-variables/) を参照してください。

## ビルドしてデータベースを初期化する

```bash
pnpm build
pnpm migrate
```

## 開発サーバーを起動する

```bash
pnpm dev
```

- バックエンドのソースを監視し、変更されると自動でビルドしてサーバーを再起動します。
- Service Worker は esbuild が監視します。
- フロントエンドは Vite の HMR が使えます。本番ビルドとは挙動が異なることがあります。
- Vite はバックエンドの後ろで動きます（HMR用のWebSocketを除き、バックエンドが `/vite` と `/embed_vite` をViteに中継します）。
- `http://localhost:3000` で開けます（`3000` は `.config/default.yml` の `port`）。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 全パッケージを監視モードで起動 |
| `pnpm build` | 本番用のビルド |
| `pnpm migrate` | データベースのマイグレーションを実行 |
| `pnpm lint` | 型チェックとESLint |
| `pnpm test` | 全パッケージのテスト（詳しくは [テスト](/engawa/development/testing/)） |
| `pnpm build-cherrypick-js-with-types` | バックエンドのAPIから、SDK（cherrypick-js）の型を生成し直す |
| `pnpm --filter frontend storybook-dev` | Storybookを起動（詳しくは [フロントエンドの注意点](/engawa/development/frontend/#storybook)） |

## よくあるつまずき

### `pnpm-lock.yaml` が競合した

引数なしで `pnpm` を実行すると、作り直されます。

### APIを変えたのに、フロントエンドの型が古いまま

バックエンドのAPI（エンドポイントやスキーマ）を変えたら、`pnpm build-cherrypick-js-with-types` でSDKの型を生成し直してください。CIでも、生成済みの型が最新かどうかを確認しています。

### ロケールを変えたのに、型エラーになる

ロケールファイルを編集したら、`pnpm build-assets` で型定義（`locales/index.d.ts`）を生成し直してください。`pnpm dev` を動かしていれば自動で行われます。
