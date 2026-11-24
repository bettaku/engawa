# DBスキーマの正本

pre-rust-tech-debt.md の P2-8（DBスキーマの正本とSQLの暗黙変換）。混在期間のDDLはTypeORMのmigrationだけで管理する（[ADR-0003](../adr/0003-postgresql-access.md)）。この文書は、migrationをすべて適用したDBのスキーマをリポジトリに置き、変更を検査する方法をまとめる。

- スナップショット: [packages/backend/schema/schema.sql](../../packages/backend/schema/schema.sql)
- スクリプト: [packages/backend/scripts/schema-snapshot.mjs](../../packages/backend/scripts/schema-snapshot.mjs)
- CI: `test-backend.yml`の「Migration tests」ジョブ。migrationを適用し、`check-migrations`の後でスナップショットとの差分を検査する。

## スナップショット

空のDBにmigrationを順にすべて適用し、`pg_dump --schema-only --no-owner --no-privileges --no-tablespaces`の出力を正規化したもの。Rust側のSQL検証（ADR-0003の検査用DB）も、このスナップショットと同じ手順で作ったDBで行う。

- 正規化で除くもの: コメント行（ダンプの日時や版を含む）、`SET`・`set_config`、`\restrict`・`\unrestrict`（実行ごとに乱数のキーが入る）、連続する空行、行末の空白。
- `pg_dump`はPostgreSQL 15のものを使う（CIのDBと同じ版）。出力は版によって変わるので、スクリプトは他の版の`pg_dump`では実行しない。

## migrationを追加・変更したとき

スナップショットを作り直して、migrationと同じPRでコミットする。

1. テスト用のDBを起動する: `docker compose -f packages/backend/test/compose.yml up -d`
2. 空のDBを作り、そのDBを指す設定ファイルを用意する（例: `.config/test.yml`の`db.db`だけを変えた`.config/schema-snapshot.yml`）

   ```sh
   docker compose -f packages/backend/test/compose.yml exec dbtest psql -U postgres -c 'CREATE DATABASE "schema-snapshot"'
   ```

3. バックエンドをビルドし、migrationを適用する: `CHERRYPICK_CONFIG_YML=schema-snapshot.yml pnpm --filter backend migrate`
4. スナップショットを書き出す。ホストにPostgreSQL 15の`pg_dump`がなければ、DBのコンテナの中で実行する。

   ```sh
   CHERRYPICK_CONFIG_YML=schema-snapshot.yml PG_DUMP_DOCKER_CONTAINER=$(docker compose -f packages/backend/test/compose.yml ps -q dbtest) pnpm --filter backend schema:snapshot
   ```

差分の検査だけを行うときは`schema:snapshot`の代わりに`check:schema`を実行する。差分があると、unified diffを表示して失敗する。

## `check-migrations`では検出できないもの

`check-migrations`（`scripts/check_migrations_clean.js`）は、エンティティの定義とDBを比べて、TypeORMが生成するSQLが残っていないかを確かめる。次のものはエンティティの定義に現れないので検出できない。スナップショットとの比較では、これらの変更も差分になる。

- `synchronize: false`の索引（GIN索引、式の索引など）
- 索引の列の向き（ASC／DESC）
- enumの値の順序
- エンティティのないテーブル・型

## テスト用のDB（`synchronize`）との違い

テストは`synchronize`で作ったDBで動いていて、migrationを適用したDBとは違う。2026-11-20時点での主な違いは次のとおり。テストはこの違いを前提にしたままにする（SQLの性能や索引に依存する挙動は、テストでは確かめられない）。

| 種類 | migrationを適用したDB | `synchronize`で作ったDB |
| --- | --- | --- |
| 索引の向き | `note ("userId", id DESC)` | `note ("userId", id)` |
| `synchronize: false`の索引 | あり（`note`の`fileIds`・`mentions`・`tags`・`visibleUserIds`のGIN索引、`note_draft`・`emoji`・`system_webhook`のGIN索引、`user_profile`の誕生日の式の索引など） | なし |
| enumの値の順序 | `antenna_src_enum`は`…, 'users_blacklist', 'group'` | `…, 'group', 'users_blacklist'` |
| エンティティのないテーブル | 14個（`messaging_message`、`note_unread`、`note_watching`、`reversi_game`、`reversi_matching`、`user_group_invite`、`__chart__hashtag`・`__chart__network`・`__chart__test*`などの旧チャート）と、それらのenum型・索引 | なし |

エンティティのないテーブルは、機能の削除のときにmigrationで消していないもの。既存のサーバーにも残っている。削除は本書の範囲外とする（pre-rust-tech-debt.md §5: 列・テーブルの削除は伴わない）。

## SQLの暗黙変換

TypeORMやドライバーの暗黙の変換に頼っていた箇所を、明示的な形に直した。Rust側でも同じ形で扱う。

- `note.searchableBy`（enum列）: リモートのノートの取り込みで、値を配列（`['public']`）で渡していた。TypeORMがenum列の値を文字列に変換する（`'' + value`）ので動いていたが、値を1つの文字列で渡すようにした。`NoteCreateService`のオプションの型もenumの値1つにした。
- 値を文字列としてSQLに埋め込んでいた箇所を、パラメータにした。いずれも値は内部のIDや検証済みの値で、注入できる経路はなかった。
  - `PollService`・`notes/polls/vote`: 投票数の加算（`votes[$1]`、`"noteId" = $2`）
  - `HashtagService`: ハッシュタグを使ったユーザーの配列への追加・削除
  - `ChatService`: チャットのリアクションの追加・削除
  - `users/following`: 誕生日での絞り込み
  - `i/update`: 確認済みのリンクの追加
