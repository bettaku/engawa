# CLAUDE.md — CherryPick

CherryPickはActivityPubプロトコルを実装したフェデレーション型SNSプラットフォームで、Misskeyのフォークです。pnpmモノレポ構成で、現在バージョン4.17.0（Misskey 2025.10.2ベース）。

## モノレポ構成

| パッケージ | 役割 |
|---|---|
| `packages/backend` | NestJS 11 + Fastify 5 APIサーバー、TypeORM 0.3、PostgreSQL 15、Redis 7、BullMQ 5 |
| `packages/frontend` | Vue 3.5 + Vite 7 SPA。カスタムルーター `nirax` を使用（vue-routerではない） |
| `packages/cherrypick-js` | TypeScript SDK。バックエンドから型を自動生成 |
| `packages/frontend-shared` | フロントエンドパッケージ間で共有するVueコンポーネント・ユーティリティ |
| `packages/frontend-embed` | 埋め込み用ノート/タイムラインウィジェット |
| `packages/sw` | Service Worker（esbuildでバンドル） |
| `packages/icons-subsetter` | ビルド時にTabler Iconsを必要なものだけに削減 |
| `packages/shared` | Vue以外の共有ユーティリティ（型定義、定数） |

## 主要コマンド

```sh
pnpm dev              # 全パッケージの開発サーバー起動（watchモード）
pnpm build            # 本番ビルド一式
pnpm start            # 本番サーバー起動（要: build + migrate 実行済み）
pnpm migrate          # TypeORMマイグレーション実行
pnpm lint             # 全リンター実行（typecheck + ESLint）
pnpm biome-lint       # typecheck + Biome lint
pnpm test             # 全パッケージのテスト
pnpm jest             # バックエンドユニットテストのみ
pnpm typecheck        # TypeScript型チェック（emit なし）
```

特定パッケージへの実行:

```sh
pnpm --filter backend test:e2e
pnpm --filter frontend test
pnpm --filter cherrypick-js test
pnpm --filter frontend storybook-dev
```

## コーディング規約

### 全般

- TypeScript strict mode。モジュール解決は `nodenext`、パスエイリアス `@/*` → `./src/*`
- ファイル名に `index` は使わない（ESM互換性の問題）
- フォーマットはBiomeで行う。Prettierは使用しない
- デフォルトエクスポートは避ける（Biome警告: `noDefaultExport`）
- 非nullアサーション `!` は避ける（Biome警告: `noNonNullAssertion`）

### バックエンド

- TypeORMエンティティクラスは `Mi` プレフィックス: `MiUser`、`MiNote`、`MiDriveFile`
- INSERT操作には `save()` ではなく `insert()` を使う（`save` は内部でSELECTが走る）
- クエリビルダーのプレースホルダー名はクエリ内で一意にする（ループ内では `:type0`, `:type1` など）
- TypeORM find条件では `Not(null)` でなく `IsNull()` を使う
- `IN` クエリに渡す配列が空になりうる場合は事前に長さチェックを入れる（`IN ()` はSQL不正）
- SQLの配列インデックスは1始まり
- NestJS循環依存: まず `forwardRef()` を試し、解決しない場合は `OnModuleInit` + `ModuleRef.get()`
- ActivityPub拡張プロパティは `_misskey_` プレフィックス必須、`type.ts` でオプショナル宣言し `contexts.ts` に登録する

### フロントエンド

- Vue 3 Composition API + `<script lang="ts" setup>` のみ（Options APIは使わない）
- フロントエンドコンポーネントは `Mk` プレフィックス: `MkNote`、`MkAvatar`
- コンポーネント自身は `margin` を定義しない（呼び出し元の責務）
- ルーターは `nirax`（vue-routerではない）。汎用パスパラメーターより具体的なルートを先に定義する
- Tabler Iconのクラス名を動的に組み立てない（例: `` `ti-${value}` ``）。ツリーシェイキングが壊れる

## テスト環境セットアップ

### フロントエンド / SDK（インフラ不要）

```sh
pnpm --filter frontend test
pnpm --filter cherrypick-js test
```

### バックエンド

1. テスト設定ファイルをコピー: `cp .github/cherrypick/test.yml .config/`
2. テスト用DB起動: `docker compose -f packages/backend/test/compose.yml up`
3. テスト実行: `pnpm --filter backend test` または `pnpm --filter backend test:e2e`

### フェデレーションE2E

`packages/backend/test-federation/README.md` を参照。

## コミットメッセージ形式

```
type(scope): 概要
```

type一覧: `fix`、`refactor`、`feat`、`enhance`、`perf`、`chore`

## PRワークフロー

- PRのターゲットブランチは `develop`（`master` ではない）
- 非自明な機能追加・バグ修正はIssueで設計を議論してから実装する
- UI変更にはスクリーンショットをPRに添付する
- PRを出す前に `pnpm test` と `pnpm lint` を通す
- ユーザー向けの変更は `CHANGELOG_engawa.md` に追記する

## よくあるハマりポイント

- **pnpm-lock.yaml競合**: `pnpm`（引数なし）を実行して再生成する
- **Storybookストーリー**: `.stories.*.ts` ファイルの追加・編集・削除後は `.storybook/generate.js` を再実行する
- **cherrypick-js型定義**: バックエンドAPI変更後は `pnpm build-cherrypick-js-with-types` を実行する
- **設定ファイルパス**: `CHERRYPICK_CONFIG_YML` 環境変数でデフォルト設定ファイルパスを上書きできる
- **Windows**: WSLでcloneすること。Git for Windowsだと改行コードの問題でファイルが壊れる
