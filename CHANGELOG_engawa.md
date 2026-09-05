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

### Client
- enhance(frontend): enable to display more timezone on clock widgets
- fix(frontend): チャンネルに関する消し忘れを修正
- fix(frontend): ドライブからファイルを添付した際に投稿フォームに何も表示されない問題
- enhance(frontend): サイコロウィジェットで複数個振ったときに個々の出目を表示するように
	- あわせて一度に振れるサイコロの数を999個までに制限しました

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

### Misc
- chore: パッケージマネージャーを pnpm v11 に更新
	- `.npmrc` の設定と build 許可リスト（`allowBuilds`）を `pnpm-workspace.yaml` に移行
- enhance(ci): Issueラベルの自動管理化
- chore(docs): Improve Issue Template
- refactor(backend): テスト基盤をJestからVitestに移行
- refactor(frontend): サイコロのロジックを自前実装にし、`@dice-roller/rpg-dice-roller` への依存を削除

