<!--
## x.x.x (unreleased)

### General
- 

### Client
- 

### Server
- 

### Misc
- 
-->

## x.x.x (unreleased)

### General
- 

### Client
- 

### Server
- Fix: リモートユーザーへのフォロー・解除や申請取消を繰り返すと、Activity IDの重複により解除が反映されない問題を修正 (#327)

### Misc
- 

## 1.0.0

### NOTE
- これまでのCHANGELOG_engawaは2025年2月以降更新されていなかったことと、リブランディングを計画しているためarchivedになりました。
- **サポートされるNode.jsの最小バージョンが24.15.0になりました**
	- Node.js 22.xのサポートは終了しました
	- 推奨環境はNode.js v24 LTSの最新版です
	- 追加サポートとしてNode.js v26でも動作します
- **バージョン番号を独自の SemVer（1.0.0〜）に変更しました**
	- これまでの `4.17.0-engawa20260408` のような表記（CherryPick のバージョン + 日付）はやめ、engawa 独自の `1.0.0` から始めます。土台にしている CherryPick のバージョン（4.17.0）は `basedCherryPickVersion` として残し、起動ログと「Engawaについて」に表示します
	- 管理画面のアップデート確認は、engawa（bettaku/engawa）のリリースを見るようになりました。CherryPick のリリースをスキップした設定は、マイグレーションでリセットされます
	- 旧表記のバージョンから更新したときに、他のソフトウェアからの移行として扱われ、キャッシュ削除の案内が出ていたのを、通常の更新として扱うようにしました
- **ソフトウェアの名前を CherryPick から Engawa に変更しました**
	- nodeinfo のソフトウェア名が `cherrypick` から `engawa` に、User-Agent が `Engawa/<バージョン>` に変わります。他のサーバーからは Engawa として認識されます
	- リポジトリURLとフィードバックURLの既定値を `https://github.com/bettaku/engawa` に変更しました。既定値のまま使っているサーバーは、マイグレーションで新しいURLに移ります（管理者が設定した値は変わりません）
	- アバターデコレーションの連合は、相手が `engawa` の場合も行われます

### General
- enhance: 管理画面におけるアイコンデコレーションをページネーションで取得するように
- chore: yojo-art 由来の実績（名前を「幼女」にする、「おはようようじょー！」と投稿する）を削除 ( [#339](https://github.com/bettaku/engawa/issues/339) )
	- これらはすでに獲得できなくなっていました。獲得済みの記録は、マイグレーションで削除されます

### Client
- fix(frontend): リリース用ビルドで依存先のCSSが読み込まれず、絵文字のサイズやアカウント名の配置が崩れる問題を修正
- enhance(frontend): enable to display more timezone on clock widgets
- enhance(frontend): 投稿フォームの添付ファイルとアップローダーで、代替テキスト（ALT）が設定されているかどうかを表示するように ( [#301](https://github.com/bettaku/engawa/issues/301) )
- enhance(frontend): セレクトメニュー（EnumForm）で選択肢の検索・カテゴリ分けができるように
	- ウィジェット追加画面のウィジェット選択がカテゴリ別に表示され、検索できるようになりました
	- 時計ウィジェットのタイムゾーン選択が地域別に表示され、検索できるようになりました
- fix(frontend): チャンネルに関する消し忘れを修正
- fix(frontend): ドライブからファイルを添付した際に投稿フォームに何も表示されない問題
- enhance(frontend): サイコロウィジェットで複数個振ったときに個々の出目を表示するように
	- あわせて一度に振れるサイコロの数を999個までに制限しました
- fix(frontend): 脆弱性が報告されていた依存パッケージを更新・排除
	- `sanitize-html` 2.17.7（`javascript:` URI の検証不備）、`uuid` 14、`happy-dom` / `minimatch` / `vite` / `rollup` / `vitest` / Storybook 9.1.20 などの開発用依存を更新
	- `@tabler/icons-webfont` が同梱する未使用の `sharp` 0.33 系を override で排除、`@misskey-dev/summaly` の更新で `private-ip` への依存を排除
- fix(frontend): 「Shift + Enterキーを押して送信」の設定が設定画面から消えていたのを修正
	- オンにしているときに、Ctrl（Cmd）+ Enterキーでも送信できるようにする設定を追加しました
	- 以前この設定をオンにしていた場合は、そのまま引き継がれます。簡易投稿フォームでも使えるようになりました
- fix(frontend): 英語・韓国語で一部の表示が抜けていたのを修正
	- 検索可能範囲、インデックス許可、MFC のボーダー、セキュアモードなどの訳を追加しました
	- どこからも使われていないロケールのキーを削除しました
	- `cherrypick-js` のテスト基盤を vitest 4 に更新（vitest 3 系の任意ファイル読み取り脆弱性）
	- `vue` 3.5.44（`@vue/server-renderer`）、`sanitize-html` 2.18.1、`vite` 8.2.4、Storybook 9.1.21、`start-server-and-test` 2.1.5（`axios` / `joi` / `follow-redirects`）などを更新

### Server
- fix(docker): pnpm 11 への更新後、コンテナイメージが起動直後に `pnpm install` を走らせようとして起動できなかった問題を修正
- enhance(docker): `compose_example.yml` の PostgreSQL を 15 から 18 に、Redis 7 を Valkey 9.0 に更新
	- PostgreSQL 18 のイメージに合わせて、ボリュームのマウント先を `/var/lib/postgresql/data` から `/var/lib/postgresql` に変更しました（データは `./db/18/docker` に置かれます）
	- Valkey は Redis 互換で、サービス名は `redis` のままなので、`default.yml` の `redis:` の設定は変更不要です
	- **既存の環境では、イメージを書き換えるだけでは移行できません**。古い `db` ディレクトリのまま起動すると、エラーにならずに空のデータベースが作られます。また、Redis 7 が保存したデータが残っていると Valkey が起動しません。次の手順で移行してください
		1. `docker compose stop web` で engawa を止め、`docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > engawa.sql` でバックアップを取る
		2. `docker compose down` で止め（Redis はデータを保存してから止まります）、`mv db db-pg15` で古いデータベースを退避する
		3. `compose.yml` の `redis` と `db` を新しい `compose_example.yml` と同じ内容に書き換える
		4. `docker run --rm -v "$PWD/redis:/data" valkey/valkey:9.0-alpine sh -c 'valkey-server --rdb-version-check relaxed --daemonize yes && until valkey-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done && valkey-cli save && valkey-cli shutdown nosave'` で Redis のデータを Valkey 用に変換する
		5. `docker compose up -d --wait db` で PostgreSQL 18 を起動し、`docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < engawa.sql` でリストアする
		6. `docker compose up -d` で起動し、問題がなければ `db-pg15` を削除する
- fix(backend): chat
	- チャットの連合機能に関する不具合の修正
- fix(backend): Hacker's Pubなどのh2タグ内にハッシュタグから始まるidを持っているHTMLが来た場合、無視するように
- fix(backend): 深刻な脆弱性が報告されていた依存パッケージを更新・置き換え
	- `@fastify/express`（認証バイパス）、`@fastify/http-proxy`（ヘッダー除去）、`@fastify/static`（パストラバーサル）、`fastify`（バリデーションバイパス）、`nodemailer`（任意ファイル読み取り/SSRF）、`sharp`（libvips）、`systeminformation`（コマンドインジェクション）、`ws`/`nanoid`/`tmp`/`happy-dom` ほか
	- `@aws-sdk/client-s3` の更新で `fast-xml-parser` の critical な脆弱性を解消
	- `deep-email-validator` の更新で脆弱な `axios@0.24` への依存を排除、`@misskey-dev/summaly` の更新で修正版のない `private-ip` への依存を排除
	- `ip-cidr`（脆弱な `ip-address@9` に依存）を削除し、既存依存の `ipaddr.js` でIPハッシュを計算するように置き換え（ハッシュ値は従来と互換）
	- `@simplewebauthn/server` を v13 に更新（`@simplewebauthn/types` は同梱化されたため削除）
	- `jsonld` を v9 に更新（`normalize` の既定アルゴリズムは RDFC-1.0 になりましたが URDNA2015 と同一の出力です）
	- `js-yaml` 4.3.2（マージキーによる CPU 消費 DoS）、`postcss` 8.5.26（sourceMappingURL 経由の任意ファイル読み取り）
	- `nodemailer` を v10 に更新（Node.js 20 以上が必須になった以外の破壊的変更なし）
	- `@nestjs/*` 11.2.7（`multer`）、`body-parser` 1.20.8（`qs`）、`fastify` 5.12.7、`probe-image-size` 7.4.0、`sharp` 0.35.5、`@swc/cli` 0.7.10（`piscina` / `@xhmikosr/decompress`）を更新
	- 間接依存の `proxy-addr`、`undici`、`@fastify/busboy`、`fast-uri`、`@grpc/grpc-js`、`brace-expansion` などを修正版に更新

### Misc
- chore: パッケージマネージャーを pnpm v11 に更新
	- `.npmrc` の設定と build 許可リスト（`allowBuilds`）を `pnpm-workspace.yaml` に移行
- chore(dev): 開発用の `compose.local-db.yml` と devcontainer で、PostgreSQL 18 と Valkey 9.0 を使うように
	- 既存のデータベースは引き継がれません。必要なら `pg_dump` でバックアップを取ってから更新してください
	- 既存の Redis 7 のデータ（`./redis` や devcontainer の `redis-data` ボリューム）が残っていると Valkey が起動しないため、削除してください
- enhance(ci): Issueラベルの自動管理化
- chore(docs): Improve Issue Template
- refactor(backend): テスト基盤をJestからVitestに移行
- refactor(frontend): サイコロのロジックを自前実装にし、`@dice-roller/rpg-dice-roller` への依存を削除
- enhance(ci): リリース管理を GitHub Actions のワークフローから GitHub App（engawa Release Manager）に移行
	- `/release start` などのコメントでプレリリース・リリースPR・タグ・GitHub Release を作成します
- enhance(ci): コンテナイメージの公開先を Docker Hub から GitHub Container Registry（`ghcr.io/bettaku/engawa`）に変更
	- リリースごとにサブモジュール込みのソースtarballと `SHA256SUMS` を GitHub Release に添付します
	- イメージとtarballには来歴証明（attestation）が付き、`gh attestation verify` で検証できます
	- npm への cherrypick-js の自動公開はひとまず止めました

