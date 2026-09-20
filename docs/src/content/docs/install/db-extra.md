---
title: db.extra で指定できる設定
description: 設定ファイルの db.extra に書ける項目と、その値がどこに渡るか
lastUpdated: 2026-09-20
---

[Issue #310](https://github.com/bettaku/engawa/issues/310) に対応し、YAML設定ファイルの `db.extra` に記述できる項目をまとめています。`statement_timeout` のようにMisskeyでも説明されていない項目を含みます。

## 値の渡り先

`db.extra` の内容は加工されず、そのままTypeORMのPostgreSQLドライバーの `extra` に渡り、最終的に [node-postgres](https://node-postgres.com/) の `new pg.Pool(...)` のオプションになります。つまり **`db.extra` に書けるのは pg (`pg.Pool` / `pg.Client`) のオプション** です。TypeORM独自のデータソースオプション（`poolSize`、`synchronize` など）は書けません。

実装: [config.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/config.ts) → [postgres.ts](https://github.com/bettaku/engawa/blob/develop/packages/backend/src/postgres.ts) → TypeORMの `PostgresDriver.createPool()` → `pg.Pool`

サーバー本体が使うデータソースには、以下の既定値が入っています。

```ts
extra: {
  statement_timeout: 1000 * 10,
  ...config.db.extra,
},
```

`db.extra` の値は後から展開されるため、既定の `statement_timeout` も上書きできます。

:::caution
マイグレーション用のデータソース（[ormconfig.js](https://github.com/bettaku/engawa/blob/develop/packages/backend/ormconfig.js)）は `extra: config.db.extra` をそのまま渡しており、`statement_timeout` の既定値10秒は入りません。`db.extra` に `statement_timeout` を書くと、長時間かかるマイグレーションにもその値が適用されます。マイグレーション中のタイムアウトを避けたい場合は、一時的に値を外すか大きくしてください。
:::

型定義上は `{ [x: string]: string }` ですが、YAMLでパースされた値がそのまま渡るため、実際には数値・真偽値・マップも指定できます。数値や真偽値が必要な項目に文字列を書くと期待どおりに動かないことがあるので、YAMLの型のまま書いてください。

レプリカを使う構成（`dbReplications: true` と `dbSlaves`）では、`db.extra` はマスター・各レプリカすべてのプールに同じ内容が適用されます。レプリカごとに別の値を指定することはできません。

## 接続プールの設定

`pg.Pool` が解釈する項目です。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `max` | `10` | 1プロセスあたりのプール内の最大接続数。engawaは `poolSize` を設定していないため、pgの既定値がそのまま使われる。クラスタリング時はワーカー数分だけ接続数が増えるため、PostgreSQL側の `max_connections` に注意する。 |
| `min` | `0` | アイドルタイムアウトで切断せずに残す接続数の下限。起動時にこの数だけ接続を張るわけではない。 |
| `idleTimeoutMillis` | `10000` | アイドル接続を閉じるまでの時間（ミリ秒）。`0` で無効（閉じない）。 |
| `connectionTimeoutMillis` | 未設定（無制限） | 接続の取得を待つ上限（ミリ秒）。TypeORMのデータソースオプション `connectTimeoutMS` と同じ場所に入るが、engawaは設定していないため、ここで指定できる。 |
| `maxUses` | `Infinity` | 1つの接続を再利用する回数の上限。超えるとプールから破棄される。コネクションプーラー（PgBouncerなど）を挟む構成で偏りを減らしたいときに使う。 |
| `maxLifetimeSeconds` | `0`（無効） | 接続の最大寿命（秒）。超えた接続は破棄される。 |
| `allowExitOnIdle` | `false` | `true` にすると、アイドル接続だけが残った状態でプロセスが終了できるようになる。常駐サーバーでは通常 `false` のままにする。 |
| `keepAlive` | `false` | TCPキープアライブの有効化。NATやロードバランサーを経由して接続が黙って切られる環境で有効。 |
| `keepAliveInitialDelayMillis` | `0` | キープアライブ開始までの遅延（ミリ秒）。`keepAlive: true` と併用する。 |

`log`、`verify`、`onConnect`、`Client`、`Promise`、`types` のような関数・クラスを渡すオプションは、YAMLでは値を表現できないため使えません。

## PostgreSQLサーバーに渡すパラメータ

接続時のスタートアップパケットで送られ、そのセッション全体に適用されます。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `statement_timeout` | engawaが `10000` を設定 | 1つのクエリが実行できる時間の上限（ミリ秒）。超えるとサーバー側でクエリが中断される。重いAPIやチャート集計でタイムアウトが出る場合はここを伸ばす。 |
| `lock_timeout` | 未設定 | ロック取得を待つ上限（ミリ秒）。 |
| `idle_in_transaction_session_timeout` | 未設定 | トランザクションを開いたままアイドルでいられる上限（ミリ秒）。放置されたトランザクションによるテーブル肥大化対策になる。 |
| `options` | 未設定 | libpqの `options` 文字列。任意のサーバーパラメーターを渡せる（例: `-c search_path=public -c timezone=UTC`）。 |
| `application_name` | TypeORMのデータソースオプション由来（engawaでは未設定） | `pg_stat_activity.application_name` に表示される名前。 |
| `fallback_application_name` | 未設定 | `application_name` が指定されていないときに使われる名前。 |
| `client_encoding` | 未設定 | クライアント側のエンコーディング。engawaのDBはUTF-8前提のため、通常は変更しない。 |
| `replication` | 未設定 | レプリケーション接続用。アプリケーションからは指定しない。 |

`statement_timeout`、`lock_timeout`、`idle_in_transaction_session_timeout` はミリ秒の数値で指定します。pgは値が偽と評価される場合（数値の `0` など）にそのパラメーターを送らないため、**`statement_timeout: 0` と書くとタイムアウトが「無効」になるのではなく、パラメーター自体が送られずサーバー側の設定が使われます**。サーバー側が既定の `0`（無制限）ならば結果的に無制限になりますが、明示したい場合は文字列で `statement_timeout: '0'` と書くと `0` が送られます。

設定が効いているかはSQLで確認できます。

```sql
SHOW statement_timeout;
SELECT application_name, state, query FROM pg_stat_activity WHERE datname = current_database();
```

## クライアント側の挙動

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `query_timeout` | 未設定 | クエリの応答を待つ上限（ミリ秒）。`statement_timeout` と違い、クライアント側で打ち切る。サーバー側のクエリは走り続ける可能性があるため、通常は `statement_timeout` を使う。 |
| `binary` | `false` | バイナリ転送モード。対応しない型があるため、変更は推奨しない。 |
| `ssl` | `false` | TLS接続の設定。下記参照。 |

## SSL/TLS

`ssl: true` でTLSを有効にできます。マップを渡した場合、その内容はNode.jsの `tls.connect()` のオプションとして扱われます。

```yaml
db:
  host: db.example.com
  port: 5432
  db: engawa
  user: engawa
  pass: example
  extra:
    ssl: true
```

証明書を検証する場合は、**ファイルパスではなくPEMの内容そのもの**を渡す必要があります。YAMLのブロックスカラーを使います。

```yaml
db:
  extra:
    ssl:
      rejectUnauthorized: true
      ca: |
        -----BEGIN CERTIFICATE-----
        ...
        -----END CERTIFICATE-----
```

`rejectUnauthorized: false` は証明書の検証を無効にします。自己署名証明書を使うマネージドDBの案内で見かけますが、中間者攻撃を防げなくなるため、可能であれば `ca` を指定してください。

## 接続情報を上書きしてしまう項目

TypeORMは `host`、`user`、`password`、`database`、`port`、`ssl`、`connectionString`、`application_name`、`max`、`connectionTimeoutMillis` を組み立てたうえで、その後に `extra` をマージします。したがって `db.extra` に `host` や `user` を書くと、`db.host` や `db.user` の設定より優先されます。意図しない接続先になるため、接続情報は `db.extra` ではなく `db` 直下に書いてください。

## 設定例

```yaml
db:
  host: localhost
  port: 5432
  db: engawa
  user: engawa
  pass: example

  extra:
    # 重い集計に合わせてクエリのタイムアウトを30秒に延ばす
    statement_timeout: 30000
    # 放置されたトランザクションを1分で切る
    idle_in_transaction_session_timeout: 60000
    # 接続数を絞る（max_connections に余裕がない場合）
    max: 8
    # 経路上でアイドル接続が切られる環境向け
    keepAlive: true
    keepAliveInitialDelayMillis: 10000
```

設定を変更したらプロセスを再起動してください。既存の接続には反映されません。
