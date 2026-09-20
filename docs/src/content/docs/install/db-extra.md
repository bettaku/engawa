---
title: db.extra で指定できる設定
description: 設定ファイルの db.extra に書ける項目と、指定した値がどこに渡るか
lastUpdated: 2026-09-20
---

`default.yml`の `db.extra` に書ける項目をまとめています。

## db.extra とは

`db.extra` は、PostgreSQLへの接続を細かく調整するための項目です。書いた内容はengawaが解釈せず、データベースドライバーにそのまま渡されます。

渡り先は次のとおりです。

```
db.extra → TypeORM の extra → new pg.Pool(...)
```

つまり `db.extra` に書けるのは、[node-postgres](https://node-postgres.com/) のプール・クライアントのオプションです。TypeORM側のオプション（`poolSize`、`synchronize` など）は書いても無視されます。

書き方は、`db` の下に `extra` を作り、そこにキーを並べるだけです。

```yaml
db:
  host: localhost
  port: 5432
  db: engawa
  user: engawa
  pass: example

  extra:
    statement_timeout: 30000
```

型定義は文字列のマップになっていますが、YAMLでパースされた値がそのまま渡るので、数値・真偽値・マップをそのまま書いて問題ありません。むしろ数値が必要な項目を文字列で書くと、意図した動作にならないことがあります。

値を変えたらプロセスを再起動してください。すでに張られている接続には反映されません。

## クエリのタイムアウトを変える

engawaは既定で `statement_timeout` に10秒を設定しています。1つのクエリが10秒を超えると、PostgreSQL側で中断されます。

`db.extra` に書いた値はこの既定値より優先されるため、そのまま上書きできます。重いAPIやチャート集計でタイムアウトが出る場合は、値を伸ばしてください。

```yaml
db:
  extra:
    statement_timeout: 30000
```

関連する項目として、ロック待ちの上限を決める `lock_timeout`、トランザクションを開いたまま放置された接続を切る `idle_in_transaction_session_timeout` があります。いずれもミリ秒で指定し、そのセッション全体に適用されます。

設定が効いているかはSQLで確認できます。

```sql
SHOW statement_timeout;
```

:::caution
マイグレーション用の接続には、10秒という既定値は入りません。ただし `db.extra` に書いた `statement_timeout` は適用されます。短い値を設定していると、時間のかかるマイグレーションが中断される可能性があります。マイグレーションの前に、一時的に値を外すか大きくしてください。
:::

:::note
数値の `0` を書いてもタイムアウトは無効になりません。ドライバーは値が偽と評価される項目をPostgreSQLに送らないため、`statement_timeout: 0` はサーバー側の設定を使うという意味になります。明示的に無制限にしたい場合は、文字列で `statement_timeout: '0'` と書いてください。
:::

## 接続数やプールの挙動を変える

engawaはプールのサイズを指定していないため、node-postgresの既定値である1プロセスあたり最大10接続が使われます。クラスタリングを有効にしている場合はワーカー数だけ倍になるので、PostgreSQL側の `max_connections` に収まっているか確認してください。接続数を絞りたい場合は `max` を指定します。

NATやロードバランサーを挟む構成で接続が黙って切られる場合は、`keepAlive` が有効です。PgBouncerなどのコネクションプーラーを経由する構成では、`maxUses` や `maxLifetimeSeconds` で接続を定期的に作り直せます。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `max` | `10` | 1プロセスあたりの最大接続数 |
| `min` | `0` | アイドルでも閉じずに残す接続数。起動時にこの数だけ接続するわけではない |
| `idleTimeoutMillis` | `10000` | アイドル接続を閉じるまでの時間（ミリ秒）。`0` で閉じなくなる |
| `connectionTimeoutMillis` | 無制限 | プールから接続を取得するまで待つ上限（ミリ秒） |
| `maxUses` | 無制限 | 1接続を使い回す回数の上限。超えると破棄される |
| `maxLifetimeSeconds` | `0`（無効） | 接続の寿命（秒）。超えると破棄される |
| `allowExitOnIdle` | `false` | アイドル接続だけが残った状態でプロセスの終了を許す。常駐サーバーでは変更しない |
| `keepAlive` | `false` | TCPキープアライブを有効にする |
| `keepAliveInitialDelayMillis` | `0` | キープアライブを開始するまでの待ち時間（ミリ秒） |

`log`、`verify`、`onConnect`、`Client`、`types` のように関数やクラスを渡すオプションは、YAMLでは値を書けないため使えません。

## TLSで接続する

TLSを有効にするには `ssl: true` を指定します。

```yaml
db:
  extra:
    ssl: true
```

マップを書いた場合、その内容はNode.jsの `tls.connect()` にそのまま渡ります。証明書を検証する場合、`ca` にはファイルパスではなくPEMの内容そのものを書く必要があります。YAMLのブロックスカラーを使ってください。

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

マネージドDBの案内では `rejectUnauthorized: false` を指示されることがありますが、これは証明書の検証を無効にする設定です。中間者攻撃を防げなくなるため、可能なら `ca` を指定してください。

## その他の項目

あまり使いませんが、次の項目も指定できます。

| キー | 内容 |
| --- | --- |
| `options` | libpqの `options` 文字列。任意のサーバーパラメーターを渡せる（例: `-c timezone=UTC`） |
| `application_name` | `pg_stat_activity.application_name` に表示される名前。複数のインスタンスで同じDBを使う場合の識別に便利 |
| `fallback_application_name` | `application_name` がないときに使われる名前 |
| `query_timeout` | クエリの応答を待つ上限（ミリ秒）。クライアント側で打ち切るだけで、サーバー側のクエリは走り続ける。通常は `statement_timeout` を使う |
| `client_encoding` | クライアント側のエンコーディング。engawaはUTF-8前提のため変更しない |
| `binary` | バイナリ転送モード。対応しない型があるため変更しない |
| `replication` | レプリケーション接続用。アプリケーションからは指定しない |

## 注意点

### 接続先を上書きしてしまう項目

TypeORMは `host`、`user`、`password`、`database`、`port`、`ssl`、`application_name`、`max`、`connectionTimeoutMillis` などを組み立てたあとに、`db.extra` をマージします。後から来る `db.extra` が優先されるため、ここに `host` や `user` を書くと `db.host` や `db.user` より強くなります。

意図しない接続先になるので、接続情報は `db.extra` ではなく `db` の直下に書いてください。

### レプリカにも同じ設定が適用される

`dbReplications: true` と `dbSlaves` でレプリカを使っている場合、`db.extra` はマスターと各レプリカのすべてに同じ内容が適用されます。レプリカごとに別の値を指定することはできません。

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
    # max_connections に余裕がないため接続数を絞る
    max: 8
    # 経路上でアイドル接続が切られる環境向け
    keepAlive: true
    keepAliveInitialDelayMillis: 10000
```
