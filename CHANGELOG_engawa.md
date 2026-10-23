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

### NOTE
- これまでのCHANGELOG_engawaは2025年2月以降更新されていなかったことと、リブランディングを計画しているためarchivedになりました。
- **サポートされるNode.jsの最小バージョンが24.15.0になりました**
	- Node.js 22.xのサポートは終了しました
	- 推奨環境はNode.js v24 LTSの最新版です
	- 追加サポートとしてNode.js v26でも動作します

### General
- enhance: 管理画面におけるアイコンデコレーションをページネーションで取得するように
- chore: yojo-art 由来の実績（名前を「幼女」にする、「おはようようじょー！」と投稿する）を削除 ( [#339](https://github.com/bettaku/engawa/issues/339) )
	- これらはすでに獲得できなくなっていました。獲得済みの記録が残っていても表示されなくなります

### Client
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
- fix(frontend): 英語・韓国語で一部の表示が抜けていたのを修正
	- 検索可能範囲、インデックス許可、MFC のボーダー、セキュアモードなどの訳を追加しました
	- どこからも使われていないロケールのキーを削除しました
	- `cherrypick-js` のテスト基盤を vitest 4 に更新（vitest 3 系の任意ファイル読み取り脆弱性）
	- `vue` 3.5.44（`@vue/server-renderer`）、`sanitize-html` 2.18.1、`vite` 8.2.4、Storybook 9.1.21、`start-server-and-test` 2.1.5（`axios` / `joi` / `follow-redirects`）などを更新

### Server
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

