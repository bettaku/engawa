---
title: テスト
description: フロントエンド・SDK・バックエンドのテストと、連合のE2Eテストの動かし方
lastUpdated: 2026-10-24
sidebar:
  order: 3
---

PRを出す前に、`pnpm test` と `pnpm lint` が通ることを確認してください。このページでは、それぞれのテストを個別に動かす方法をまとめています。

## フロントエンドとSDK

データベースなどを用意しなくても動きます。

```bash
pnpm --filter frontend test
pnpm --filter cherrypick-js test
```

## バックエンド

バックエンドのテストには3種類あります。

| 種類 | 場所 |
|---|---|
| ユニットテスト | `packages/backend/test/unit` |
| 単一サーバーのE2Eテスト | `packages/backend/test/e2e` |
| 複数サーバー（連合）のE2Eテスト | `packages/backend/test-federation` |

### ユニットテスト・単一サーバーのE2Eテスト

テスト用の設定ファイルをコピーします。

```bash
cp .github/cherrypick/test.yml .config/
```

テスト用のPostgreSQLとRedisを起動します。

```bash
docker compose -f packages/backend/test/compose.yml up
```

代わりに、消えてもかまわない空のデータベースを用意し、`.config/test.yml` を書き換えてもかまいません。

テストを実行します。

```bash
pnpm --filter backend test      # ユニットテスト
pnpm --filter backend test:e2e  # 単一サーバーのE2Eテスト
```

特定のテストだけを動かすときは、`packages/backend` からの相対パスを渡します。

```bash
pnpm --filter backend test test/unit/activitypub.ts
pnpm --filter backend test:e2e test/e2e/nodeinfo.ts
```

`-t` でテスト名による絞り込みもできます。ファイルの変更を監視して実行し直す場合は `pnpm --filter backend vitest-watch` を使います。

### 複数サーバー（連合）のE2Eテスト

[`packages/backend/test-federation/README.md`](https://github.com/bettaku/engawa/blob/develop/packages/backend/test-federation/README.md) を参照してください。

## フロントエンドのE2Eテスト

[Playwright](https://playwright.dev/) で、実際にサーバーを起動してブラウザから操作するテストです。バックエンドのテストと同じく、テスト用のデータベースとRedis（`.config/test.yml`）が必要です。

```bash
pnpm build
pnpm --filter frontend exec playwright install chromium
pnpm start-server-and-test start:test http://localhost:61812 "pnpm --filter frontend test:e2e"
```

`start:test` は `.config/test.yml` の設定でサーバーを起動します。すでにサーバーが動いている場合は、環境変数 `CHERRYPICK_URL` で接続先を指定し、`pnpm --filter frontend test:e2e` だけを実行することもできます。

## CI

テストは GitHub Actions で自動的に実行されます。設定は [`.github/workflows`](https://github.com/bettaku/engawa/tree/develop/.github/workflows) にあります。
