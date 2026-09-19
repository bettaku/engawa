---
title: バックエンドの環境変数
description: バックエンドが参照する環境変数の用途、既定値、設定ファイルとの優先順位
lastUpdated: 2026-09-19
---

[Issue #308](https://github.com/bettaku/engawa/issues/308) に対応し、バックエンドのソースコード、起動処理、マイグレーションで直接参照する環境変数をまとめています。依存ライブラリやNode.js自体が解釈する環境変数、およびテストランナー・フロントエンドのビルド専用の変数は対象外です。変数名には、派生元の `CHERRYPICK`、`CP`、`MISSKEY` が残っています。

## 設定方法と優先順位

環境変数はバックエンドのプロセスに渡します。ビルド済みの環境で、リポジトリのルートから起動する例です。

```sh
NODE_ENV=production CP_WITH_LOG_TIME=1 pnpm start
```

systemdやコンテナで起動する場合も、起動するプロセスの環境変数として設定してください。バックエンドの起動処理には `.env` ファイルを自動で読み込む処理はありません。変更後はプロセスを再起動します。

環境変数だけで設定を完結させることはできません。YAML設定ファイルは必ず読み込まれ、DBホスト・ポートやRedisなどは引き続きファイルに記述します。[設定例](https://github.com/bettaku/engawa/blob/develop/.config/example.yml) も参照してください。

以下のフォールバック対象の項目は、**YAMLの値 → 環境変数 → コード上の既定値**の順に採用されます。環境変数を使うには、対応するYAMLの項目を省略するか `null` にします。YAMLに空文字列 `''` や `0` がある場合も、その値が優先されます。YAML内の `${DATABASE_PASSWORD}` のような文字列を展開する仕組みではありません。

実装: [config.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/config.ts)

## 実行環境と設定ファイル

| 変数 | 未設定時 | 用途・値 |
| --- | --- | --- |
| `NODE_ENV` | 本番モードにはならない | 本番では `production` を指定する。開発用は `development`、テスト用は `test`。比較は大文字・小文字を区別する。 |
| `CHERRYPICK_CONFIG_YML` | 通常は `.config/default.yml`。`NODE_ENV=test` のときは `.config/test.yml` | 読み込むYAMLファイルのパス。相対パスはリポジトリの `.config` 基準で解決され、絶対パスも指定できる。非空の値を指定すると、テスト時もこのパスが優先される。空文字列は未設定と同じ。 |

例えば `CHERRYPICK_CONFIG_YML=production.yml` は `.config/production.yml` を読み込みます。`CHERRYPICK_CONFIG_YML=.config/production.yml` では `.config/.config/production.yml` になるため注意してください。この変数はマイグレーションと [アセットのビルド処理](https://github.com/bettaku/engawa/blob/develop/scripts/build-assets.mjs) でも使われます。同じ設定を使う各コマンドに渡してください。

### NODE_ENVによる動作の違い

`pnpm start` 自体は `NODE_ENV=production` を設定しません。リポジトリのDockerfileでは設定されていますが、直接起動する場合は明示してください。

- `production`: APIのレート制限と、HTTPリクエスト処理のプライベートIP接続制限が有効になる。通常はデバッグログを抑制し、一時ファイルのクリーンアップを行う。
- `development`: 本番用の上記制限は無効になり、ファイル配信に開発用のCORSヘッダーを付ける。
- `test`: 設定ファイルの既定値を変更し、クラスタリングとログ出力を抑制する。DB初期化に `synchronize: true` と `dropSchema: true` を渡し、DBキャッシュを無効にする。また、TOTP検証・登録制限などにテスト用の分岐がある。
- 未設定・その他の値: `production` と等しくないため、本番用のレート制限などは有効にならない。`development` や `test` と等しい場合だけの処理も適用されない。

:::danger[本番データにtestモードを使用しない]
`NODE_ENV=test` は接続先DBのスキーマを削除する設定を有効にし、認証などの動作も変更します。必ず隔離したテスト用DBを使用してください。`CHERRYPICK_CONFIG_YML` を指定している場合、`test.yml` に自動的に切り替わるわけではありません。
:::

実装: [postgres.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/postgres.ts)、[RateLimiterService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/server/api/RateLimiterService.ts)、[HttpRequestService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/core/HttpRequestService.ts)、[FileServerService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/server/FileServerService.ts)、[create-temp.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/misc/create-temp.ts)

## YAML設定のフォールバック

| 変数 | 対応するYAML項目 | YAMLと環境変数の両方が未設定の場合 | 用途 |
| --- | --- | --- | --- |
| `CHERRYPICK_URL` | `url` | 空文字列になり、URLの解析でエラー | サーバーの公開URL。例: `https://social.example.com`。 |
| `PORT` | `port` | `NaN`（有効な既定ポートなし） | バックエンドの待受ポート。10進数の `parseInt` で解釈されるため、`3000` のような整数を指定する。UNIXソケット使用時はYAMLの `socket` が使われる。 |
| `DATABASE_DB` | `db.db` | 空文字列 | PostgreSQLのデータベース名。 |
| `DATABASE_USER` | `db.user` | 空文字列 | PostgreSQLのユーザー名。 |
| `DATABASE_PASSWORD` | `db.pass` | 空文字列 | PostgreSQLのパスワード。 |

`db` オブジェクト自体は必要です。`DATABASE_HOST`、`DATABASE_PORT`、`DATABASE_URL` をこの設定読み込み処理が解釈することはありません。接続先はYAMLの `db.host` と `db.port` で指定します。レプリカの `dbSlaves` にも、上記のフォールバックは適用されません。

実装: [config.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/config.ts)、[ServerService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/server/ServerService.ts)

## 起動・ログ用のCP_*フラグ

以下のフラグは、**空でない文字列なら有効**です。`1`、`true` だけでなく、`0` や `false` でも有効になります。無効にする場合は変数を未設定にするか、空文字列にしてください。通常の既定値はすべて無効です。

| 変数 | 有効時の動作 |
| --- | --- |
| `CP_ONLY_QUEUE` | ジョブキュー処理を起動し、Webサーバーを起動しない。 |
| `CP_ONLY_SERVER` | Webサーバーを起動し、ジョブキューの処理プロセスを起動しない。キュー処理を別プロセスで起動する構成向け。 |
| `CP_DISABLE_CLUSTERING` | ワーカープロセスをforkせず、メインプロセスで処理する。役割を限定しなければWebサーバーとジョブキューの両方を起動する。 |
| `CP_VERBOSE` | `production` でもバックエンドの `Logger.debug()` を出力する。 |
| `CP_WITH_LOG_TIME` | バックエンドのLoggerが出力するログに時刻を付ける。 |
| `CP_QUIET` | バックエンドのLoggerによる出力、起動ロゴなどを抑制する。直接の `console` 出力や依存ライブラリの全出力を止めるものではない。 |
| `CP_NO_DAEMONS` | `envOption.noDaemons` に値が設定されるが、現在はこの値を参照して動作を切り替える処理がない。デーモン停止には使えない。 |

`CP_ONLY_SERVER` と `CP_ONLY_QUEUE` は併用しないでください。両方が有効な場合、起動処理では `onlyServer` の分岐が優先されますが、起動完了ログは `onlyQueue` の値でも判定されるため、実際の動作と表示が一致しません。

通常はメインプロセスがWebサーバーを、ワーカーがジョブキューを担当します。クラスタリングが有効な場合のワーカー数はYAMLの `clusterLimit` で指定します。

`NODE_ENV=test` では、`disableClustering`・`quiet`・`noDaemons` が強制的に `true` になります。対応する環境変数を空にしても解除できません。ただし、`noDaemons` の値が使われていない点は同じです。

実装: [env.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/env.ts)、[master.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/boot/master.ts)、[worker.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/boot/worker.ts)、[common.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/boot/common.ts)、[logger.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/logger.ts)

## マイグレーション

| 変数 | 有効になる値 | 未設定時・その他の値 | 用途 |
| --- | --- | --- | --- |
| `CHERRYPICK_MIGRATION_CREATE_INDEX_CONCURRENTLY` | `1` | 無効 | 対応するマイグレーションで `CREATE INDEX CONCURRENTLY` を使う。TypeORMのマイグレーショントランザクション設定も `all` から `each` に変わる。 |

現在対応しているのは `1745378064470-composite-note-index.js` です。このマイグレーション自体は有効時にトランザクション外で実行されます。すべてのマイグレーションのインデックス作成が自動的に並行実行へ変わる設定ではありません。通常のサーバー起動ではなく、必要なマイグレーションコマンドに渡します。

```sh
NODE_ENV=production CHERRYPICK_MIGRATION_CREATE_INDEX_CONCURRENTLY=1 pnpm migrate
```

実装: [migration-config.js](https://github.com/bettaku/engawa/blob/develop/packages/backend/migration/js/migration-config.js)、[ormconfig.js](https://github.com/bettaku/engawa/blob/develop/packages/backend/ormconfig.js)、[対応マイグレーション](https://github.com/bettaku/engawa/blob/develop/packages/backend/migration/1745378064470-composite-note-index.js)

## 開発用のフロントエンド接続

| 変数 | 未設定時 | 用途 |
| --- | --- | --- |
| `VITE_PORT` | `5173` | `/vite` のプロキシ先となるVite開発サーバーのポート。 |
| `EMBED_VITE_PORT` | `5174` | `/embed_vite` のプロキシ先となる埋め込み用Vite開発サーバーのポート。 |

この分岐は `NODE_ENV` ではなく、埋め込みフロントエンドのビルド済みmanifestの有無（`frontendEmbedManifestExists`）で決まります。manifestが存在する場合は静的ファイルを配信し、存在しない場合にこれらのポートへプロキシします。接続先のホストとスキームには公開URLのものを使います。バックエンド側での参照は接続先の指定であり、Viteサーバーを起動する処理ではありません。

実装: [ClientServerService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/server/web/ClientServerService.ts)

## テスト・ローカル検証用

これらは通常の本番運用では設定しません。`CP_*` と異なり、有効になる文字列が個別に決まっています。

| 変数 | 有効になる値 | 未設定時 | 用途・適用条件 |
| --- | --- | --- | --- |
| `CHERRYPICK_WEBFINGER_USE_HTTP` | 大文字・小文字を区別しない `true` | アカウント形式の問い合わせでHTTPSを使用 | `user@host` 形式から生成するWebFinger問い合わせをHTTPにする。URL形式の問い合わせは元のプロトコルを使用する。`NODE_ENV` による限定はない。 |
| `FORCE_FOLLOW_REMOTE_USER_FOR_TESTING` | `true`（小文字のみ） | 通常のフォロー処理 | ローカルからリモートへのフォローという理由でフォローリクエストを保留する条件を外す。鍵アカウントなど、他の保留条件は残る。`NODE_ENV` による限定はない。 |
| `MISSKEY_TEST_CHECK_DUPLICATED_TOTP` | `1` | `test` では `validateOtp()` が検証せず成功を返す | `NODE_ENV=test` でもTOTPの値・再利用の検証を実行する。テスト以外ではこの変数にかかわらず検証する。 |
| `CHERRYPICK_TEST_CHECK_IP_RANGE` | `1` | `test` ではOAuthの該当IP範囲チェックを省略 | `NODE_ENV=test` でもOAuthクライアントメタデータ取得時のIP範囲チェックを実行する。テスト以外ではこの変数にかかわらずチェックする。HTTPリクエスト処理全体を本番相当にするフラグではない。 |

実装: [WebfingerService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/core/WebfingerService.ts)、[UserFollowingService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/core/UserFollowingService.ts)、[UserAuthService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/core/UserAuthService.ts)、[OAuth2ProviderService.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/server/oauth/OAuth2ProviderService.ts)
