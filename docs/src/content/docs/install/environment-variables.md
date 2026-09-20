---
title: バックエンドの環境変数
description: バックエンドが参照する環境変数の用途、既定値、設定ファイルとの優先順位
lastUpdated: 2026-09-20
---

バックエンドが直接参照する環境変数をまとめています。依存ライブラリやNode.js自体が解釈する変数、テストランナーやフロントエンドのビルド専用の変数は含みません。

変数名には、派生元の `CHERRYPICK`、`CP`、`MISSKEY` が残っています。

## 設定方法

環境変数はバックエンドのプロセスに渡します。ビルド済みの環境で、リポジトリのルートから起動する例です。

```sh
NODE_ENV=production CP_WITH_LOG_TIME=1 pnpm start
```

systemdやコンテナから起動する場合も同じで、そのプロセスの環境変数として設定します。バックエンドには `.env` ファイルを自動で読み込む処理はありません。値を変えたらプロセスを再起動してください。

環境変数だけで設定を完結させることはできません。YAML設定ファイルは必ず読み込まれ、DBのホストやポート、Redisなどは引き続きファイルに書きます。[設定例](https://github.com/bettaku/engawa/blob/develop/.config/example.yml) も参照してください。

## 実行環境と設定ファイル

| 変数 | 未設定時 | 用途 |
| --- | --- | --- |
| `NODE_ENV` | 本番モードにはならない | 本番は `production`、開発は `development`、テストは `test` |
| `CHERRYPICK_CONFIG_YML` | `.config/default.yml`（`NODE_ENV=test` のときは `.config/test.yml`） | 読み込むYAMLファイルのパス |

`NODE_ENV` の比較は大文字・小文字を区別します。`Production` では本番モードになりません。

### 設定ファイルのパス

`CHERRYPICK_CONFIG_YML` の相対パスは、リポジトリの `.config` を基準に解決されます。絶対パスも指定できます。

- `CHERRYPICK_CONFIG_YML=production.yml` → `.config/production.yml`
- `CHERRYPICK_CONFIG_YML=.config/production.yml` → `.config/.config/production.yml`

後者は間違いやすいので注意してください。空文字列は未設定と同じ扱いです。非空の値を指定した場合は、`NODE_ENV=test` でもそのパスが優先されます。

この変数はマイグレーションやアセットのビルドでも使われます。同じ設定を使うコマンドすべてに渡してください。

### NODE_ENVによる動作の違い

`pnpm start` 自体は `NODE_ENV=production` を設定しません。リポジトリのDockerfileでは設定されていますが、直接起動する場合は明示してください。

- **`production`**: APIのレート制限と、HTTPリクエスト処理のプライベートIP接続制限が有効になります。デバッグログを抑制し、一時ファイルのクリーンアップを行います。
- **`development`**: 上記の制限は無効になり、ファイル配信に開発用のCORSヘッダーが付きます。
- **`test`**: 設定ファイルの既定値が変わり、クラスタリングとログ出力が抑制されます。DBの初期化に `synchronize: true` と `dropSchema: true` が渡り、DBキャッシュも無効になります。TOTP検証や登録制限にもテスト用の分岐があります。
- **未設定・その他の値**: `production` ではないため本番用の制限は有効にならず、`development` や `test` 専用の処理も適用されません。

:::danger[本番データにtestモードを使用しない]
`NODE_ENV=test` は、接続先DBのスキーマを削除する設定を有効にします。認証などの動作も変わります。必ず隔離したテスト用DBを使ってください。`CHERRYPICK_CONFIG_YML` を指定している場合、`test.yml` に自動で切り替わることはありません。
:::

## YAML設定のフォールバック

一部の項目は、YAMLに書かなくても環境変数で指定できます。採用される順序は次のとおりです。

**YAMLの値 → 環境変数 → コード上の既定値**

環境変数を使うには、対応するYAMLの項目を省略するか `null` にしてください。YAML側に空文字列 `''` や `0` が書かれている場合も、そちらが優先されます。なお、これはYAML内の `${DATABASE_PASSWORD}` のような文字列を展開する仕組みではありません。

| 変数 | 対応するYAML項目 | 両方とも未設定の場合 | 用途 |
| --- | --- | --- | --- |
| `CHERRYPICK_URL` | `url` | 空文字列になり、URLの解析でエラー | サーバーの公開URL。例: `https://social.example.com` |
| `PORT` | `port` | `NaN`（有効な既定ポートなし） | バックエンドの待受ポート |
| `DATABASE_DB` | `db.db` | 空文字列 | PostgreSQLのデータベース名 |
| `DATABASE_USER` | `db.user` | 空文字列 | PostgreSQLのユーザー名 |
| `DATABASE_PASSWORD` | `db.pass` | 空文字列 | PostgreSQLのパスワード |

`PORT` は10進数の `parseInt` で解釈されるため、`3000` のような整数を指定してください。UNIXソケットを使う場合は、YAMLの `socket` が使われます。

DBについては、`db` オブジェクト自体がYAMLに必要です。`DATABASE_HOST`、`DATABASE_PORT`、`DATABASE_URL` はこの設定読み込み処理では解釈されません。接続先はYAMLの `db.host` と `db.port` で指定してください。レプリカの `dbSlaves` にも、このフォールバックは適用されません。

## 起動・ログ用のCP_*フラグ

プロセスの役割やログ出力を切り替えるフラグです。既定はすべて無効です。

| 変数 | 有効時の動作 |
| --- | --- |
| `CP_ONLY_QUEUE` | ジョブキューの処理だけを起動し、Webサーバーを起動しない |
| `CP_ONLY_SERVER` | Webサーバーだけを起動し、ジョブキューの処理プロセスを起動しない |
| `CP_DISABLE_CLUSTERING` | ワーカープロセスをforkせず、メインプロセスで処理する |
| `CP_VERBOSE` | `production` でもバックエンドの `Logger.debug()` を出力する |
| `CP_WITH_LOG_TIME` | バックエンドのLoggerが出力するログに時刻を付ける |
| `CP_QUIET` | Loggerの出力や起動ロゴを抑制する |
| `CP_NO_DAEMONS` | 値は保持されるが、現在は参照されていない（後述） |

:::caution[0やfalseでも有効になります]
これらのフラグは、**空でない文字列であれば有効**と判定されます。`1` や `true` だけでなく、`0` や `false` でも有効になります。無効にするには、変数を未設定にするか空文字列にしてください。
:::

通常はメインプロセスがWebサーバーを、ワーカーがジョブキューを担当します。`CP_DISABLE_CLUSTERING` を有効にした場合、役割を限定しなければWebサーバーとジョブキューの両方をメインプロセスで起動します。クラスタリング時のワーカー数は、YAMLの `clusterLimit` で指定します。

`CP_ONLY_SERVER` と `CP_ONLY_QUEUE` は併用しないでください。両方を有効にすると、Webサーバーのみが起動する一方で、起動完了のログにはキュー専用として表示されます。実際の動作とログが食い違うため、どちらか一方だけを指定してください。

`CP_NO_DAEMONS` は現在どこからも参照されていません。有効にしてもデーモンは停止しません。

`NODE_ENV=test` では、`CP_DISABLE_CLUSTERING`・`CP_QUIET`・`CP_NO_DAEMONS` に相当する設定が強制的に有効になります。対応する環境変数を空にしても解除できません。

## マイグレーション

| 変数 | 有効になる値 | 用途 |
| --- | --- | --- |
| `CHERRYPICK_MIGRATION_CREATE_INDEX_CONCURRENTLY` | `1` | 対応するマイグレーションで `CREATE INDEX CONCURRENTLY` を使う |

この変数はサーバーの起動時ではなく、マイグレーションのコマンドに渡します。

```sh
NODE_ENV=production CHERRYPICK_MIGRATION_CREATE_INDEX_CONCURRENTLY=1 pnpm migrate
```

有効にすると、TypeORMのマイグレーショントランザクションの設定も `all` から `each` に変わります。

対応しているのは `1745378064470-composite-note-index` だけで、このマイグレーションは有効時にトランザクション外で実行されます。すべてのマイグレーションのインデックス作成が並行実行に変わるわけではありません。

## 開発用のフロントエンド接続

| 変数 | 未設定時 | 用途 |
| --- | --- | --- |
| `VITE_PORT` | `5173` | `/vite` のプロキシ先となるVite開発サーバーのポート |
| `EMBED_VITE_PORT` | `5174` | `/embed_vite` のプロキシ先となる埋め込み用Vite開発サーバーのポート |

プロキシするかどうかは `NODE_ENV` では決まりません。埋め込みフロントエンドのビルド済みmanifestがあるかどうかで切り替わります。manifestがあれば静的ファイルを配信し、なければこれらのポートへプロキシします。プロキシ先のホストとスキームには、公開URLのものが使われます。

これらはあくまで接続先の指定です。バックエンドがViteサーバーを起動するわけではありません。

## テスト・ローカル検証用

通常の本番運用では設定しません。`CP_*` フラグと違い、有効になる文字列が変数ごとに決まっています。

| 変数 | 有効になる値 | 未設定時 | 用途 |
| --- | --- | --- | --- |
| `CHERRYPICK_WEBFINGER_USE_HTTP` | `true`（大文字・小文字を区別しない） | HTTPSを使用 | `user@host` 形式から生成するWebFinger問い合わせをHTTPにする |
| `FORCE_FOLLOW_REMOTE_USER_FOR_TESTING` | `true`（小文字のみ） | 通常のフォロー処理 | ローカルからリモートへのフォローを保留にする条件を外す |
| `MISSKEY_TEST_CHECK_DUPLICATED_TOTP` | `1` | `test` では検証せず成功を返す | `NODE_ENV=test` でもTOTPの値・再利用を検証する |
| `CHERRYPICK_TEST_CHECK_IP_RANGE` | `1` | `test` ではチェックを省略 | `NODE_ENV=test` でもOAuthクライアントメタデータ取得時のIP範囲チェックを行う |

補足です。

- `CHERRYPICK_WEBFINGER_USE_HTTP`: URL形式の問い合わせは元のプロトコルを使います。`NODE_ENV` による限定はありません。
- `FORCE_FOLLOW_REMOTE_USER_FOR_TESTING`: 鍵アカウントなど、他の保留条件は残ります。`NODE_ENV` による限定はありません。
- `MISSKEY_TEST_CHECK_DUPLICATED_TOTP` と `CHERRYPICK_TEST_CHECK_IP_RANGE`: どちらも `NODE_ENV=test` のときだけ意味があります。テスト以外では、変数にかかわらず検証・チェックが行われます。後者は、HTTPリクエスト処理全体を本番相当にするフラグではありません。

