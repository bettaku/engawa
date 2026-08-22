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

### Server
- fix(backend): chat
	- チャットの連合機能に関する不具合の修正
- fix(backend): Hacker's Pubなどのh2タグ内にハッシュタグから始まるidを持っているHTMLが来た場合、無視するように

### Misc
- enhance(ci): Issueラベルの自動管理化
- chore(docs): Improve Issue Template
- refactor(backend): テスト基盤をJestからVitestに移行

