# RUST-03 HTTP契約・SDK型・絵文字のfixture

作成日: 2026-11-27

状態: 記録済み。絵文字の2つのエンドポイント（`emojis`・`emoji`）について、要求27件と応答を保存し、既存のバックエンドE2Eで比較する。[responses.json](../../../packages/backend/test/fixtures/contract/emojis/responses.json)は、Node.js版のテストサーバーで`CONTRACT_UPDATE=1`により記録した（2026-11-28）。記録後、比較モードで29件が通ることを確かめた。

関連: [Rust移行計画](../../RUST_BACKEND_MIGRATION_PLAN.md) §4.1・§7（最初の実装単位）・§8.1・§8.2・§12（RUST-03）、[RUST-01 棚卸し](../inventory/README.md)

## 1. この資料の位置づけ

移行計画のRUST-03は、成果物として「正常・異常・省略・認証ありなしの比較資産、契約差分CI案」を求めている。

| 成果物 | 置き場所 | 状態 |
| --- | --- | --- |
| 絵文字のfixture（DBの行） | [seed.json](../../../packages/backend/test/fixtures/contract/emojis/seed.json) | 済み |
| 要求の一覧 | [cases.json](../../../packages/backend/test/fixtures/contract/emojis/cases.json) | 済み（27件） |
| 保存した応答 | [responses.json](../../../packages/backend/test/fixtures/contract/emojis/responses.json) | 済み（Node.js版で記録） |
| 要求の送り方・api.jsonとの照合 | [test/misc/contract.ts](../../../packages/backend/test/misc/contract.ts) | 済み |
| Node.js版での比較 | [test/e2e/contract-emojis.ts](../../../packages/backend/test/e2e/contract-emojis.ts) | 済み。既存のE2Eの中で動く |
| 契約差分のCI | [test-backend.yml](../../../.github/workflows/test-backend.yml)のE2E（段階1）、本書§5（段階2以降の案） | 段階1のみ |

APIの型の契約（`api.json`）は、P2-6で[コミット済みのapi.json](../../../packages/backend/api.json)とエンドポイントの定義の一致を[validate-api-json.yml](../../../.github/workflows/validate-api-json.yml)で、SDKの生成コードとの一致を[check-cherrypick-js-autogen.yml](../../../.github/workflows/check-cherrypick-js-autogen.yml)で検査している。この資料では、それに**実際の応答がapi.jsonの型に合うこと**を加え、型と振る舞いの両方を同じ要求で固定する。

## 2. 対象と要求

最初の実装単位（移行計画§7）の`GET /api/emojis`と、同じ変換を使う`/api/emoji`を対象にした。

### 2.1 fixture

[seed.json](../../../packages/backend/test/fixtures/contract/emojis/seed.json)の8行を`emoji`テーブルに直接入れる。管理APIで作るとIDとURLが実行のたびに変わるため、IDとURLを固定した行にした。Rust版のDBにも同じ行を入れられる（列名はDBと同じ）。

| 行 | 確かめること |
| --- | --- |
| `blobcat`（ローカル）と`blobcat`（リモート） | 一覧にリモートを含めない。名前で引くとローカルを返す |
| `blobfox`（`publicUrl`が空） | `url`が`originalUrl`に戻る（`\|\|`なので空文字も戻る） |
| `warning`（`isSensitive`・`localOnly`がtrue、非ASCIIの別名） | 一覧では真のときだけ出し、詳細では常に出す |
| `vip`（ロール指定あり） | 一覧ではロールの指定があるときだけ出す。存在しないロールIDもそのまま返す |
| `misc_one`（カテゴリなし） | `category: null`は最後に並ぶ（PostgreSQLの`ASC`は`NULLS LAST`） |
| `zebra`（`animals`） | 並びは名前だけでなくカテゴリが先。行の挿入順・IDの順とも違う |
| `remoteonly`（リモートのみ） | 名前で引くと見つからない |

名前とカテゴリは、照合順序（`C`と`en_US.UTF-8`）で並びが変わらない小文字の英字にした（[§6](#6-未確定と次の作業)）。

### 2.2 要求

[cases.json](../../../packages/backend/test/fixtures/contract/emojis/cases.json)の27件。分類ごとの内訳は次のとおり。

| 分類 | 要求 |
| --- | --- |
| 正常 | 一覧のGET・POST、名前で引く（ローカル優先、真偽値・ロール・URLの戻り） |
| 省略 | 一覧の`localOnly`・`isSensitive`・`roleIdsThatCanBeUsedThisEmojiAsReaction`の省略、詳細では省略しない、`category`・`license`・`host`の`null`、未定義のクエリを無視、本文なしのPOST |
| 異常 | 見つからない（ない名前・リモートのみ・空文字）、`name`の省略・`null`、空のJSON・壊れたJSON・`text/plain`・未対応のContent-Type、ないエンドポイント |
| 認証なし | ヘッダーなし、`bearer`（小文字）の付いたヘッダー |
| 認証あり | Authorizationヘッダー、クエリ・本文の`i`、権限なしのアプリのtoken、凍結したユーザーのtoken |
| 認証の失敗 | 存在しないtoken（401）、文字列でない`i`（400） |

### 2.3 保存した応答から読める契約

Rust版で取り違えやすいものを挙げる。

- **キャッシュ**: `Cache-Control: public, max-age=3600`は、GETで、成功し、tokenがないときだけ。POST、tokenあり（無効でない限り）、エラーは`private, max-age=0, must-revalidate`。
- **`bearer`（小文字）**: RFC 6750に合わせて大文字小文字を区別し、tokenと見なさない。そのため匿名として扱い、公開キャッシュを許す。入口（移行計画§7）で「認証情報のない要求」を判定するときは、Authorizationヘッダーの有無で判定し、この挙動に依存しない。
- **無効なtoken**: 認証の要らないエンドポイントでも401と`WWW-Authenticate: ... error="invalid_token"`。匿名として扱わない。
- **凍結**: `requireCredential`のないエンドポイントは、凍結したユーザーのtokenでも200。
- **`WWW-Authenticate`**: `kind: client`の`ApiError`（`NO_SUCH_EMOJI`・`INVALID_PARAM`）には`error="invalid_request"`を付ける。本文の解析の失敗（`INVALID_REQUEST`・415）と、文字列でない`i`には付けない。
- **本文**: `text/plain`は文字列として読まれ、引数がオブジェクトでないとして`INVALID_PARAM`（`info.param`は`#/type`）。本文のないPOSTも同じ。空のJSONは`INVALID_REQUEST`。
- **エラーの`info`**: 引数の検査はAjvの最初のエラーの`schemaPath`と`message`をそのまま返す（`#/required`、`must have required property 'name'`など）。Rust版はAjvと同じ文言を作る必要がある。
- **副作用**: アプリ（MiAuth）のtokenで呼ぶと、参照のエンドポイントでも`access_token.lastUsedAt`を更新する（応答を待たない）。テストの最後の項目で確かめる。

## 3. 比較の規則

- 応答のステータス、記録対象のヘッダー、本文を、保存した値と`deepStrictEqual`で比べる。
- 記録するヘッダーは`content-type`・`cache-control`・`www-authenticate`・`retry-after`・`access-control-allow-origin`。`Date`・`Content-Length`・`Connection`・`Keep-Alive`など実行のたびに変わるもの・本文から決まるものは記録しない。記録対象のヘッダーがないことも契約に含む（余計に付いても違反）。
- 正規化はしない。IDとURLはfixtureで固定し、tokenは応答に出ない。配列の順序、`null`とプロパティの省略の違いはそのまま比べる。オブジェクトのキーの順序は比べない（JSONの意味に含まれないため）。
- 保存した応答のうち、要求の一覧にないものが残っていれば失敗する。

### 3.1 api.json（SDKの型）との照合

応答ごとに、[contract.ts](../../../packages/backend/test/misc/contract.ts)の`checkAgainstApiJson`で次を確かめる。`apiJson: false`の要求（ないエンドポイント）は除く。

1. 要求のパスとメソッドがapi.jsonにある。
2. 応答のステータスが、その操作の`responses`に宣言されている。
3. 本文がスキーマに合う。`$ref`・`type`・`enum`・`required`・`items`・`anyOf`/`oneOf`/`allOf`を見る。**スキーマにないプロパティも違反にする**（api.jsonは`additionalProperties`を書かないが、SDKの型に出ない値を返していないかを見る）。`format`は見ない（§6）。
4. エラーの`code`が、そのステータスの`examples`にあり、`id`が一致する。

api.jsonはSDK（`cherrypick-js`の`autogen`）の生成元で、両者の一致は既存のCIが見ている。したがって、この照合に通ればSDKの型とも合う。

## 4. 実行と更新

バックエンドのE2Eの準備（[テストのドキュメント](https://bettaku.github.io/engawa/development/testing/)）をしたうえで:

```sh
pnpm --filter backend build && pnpm --filter backend build:test
# 比較する
pnpm --filter backend vitest:e2e test/e2e/contract-emojis.ts
# 保存した応答を書き直す（差分をレビューで確かめる）
CONTRACT_UPDATE=1 pnpm --filter backend vitest:e2e test/e2e/contract-emojis.ts
```

`CONTRACT_UPDATE=1`でも、api.jsonとの照合は行う。更新モードは比較をしないので、`CI`が設定された環境では起動時に失敗する。`CONTRACT_OUTPUT_DIR`を指定すると、比較の結果にかかわらず実際の応答をそこに書く。

要求を足すときは、cases.jsonに追加して`CONTRACT_UPDATE=1`で記録し、増えた応答が意図どおりかを確かめる。応答が変わるPRでは、responses.jsonの差分が契約の変更点になる。

## 5. 契約差分のCI案

### 段階1: Node.js版の応答の固定（このPRで導入）

- [test-backend.yml](../../../.github/workflows/test-backend.yml)のE2Eで、ほかのE2Eと一緒に`contract-emojis.ts`が動く。保存した応答と違う、またはapi.jsonと合わなければ失敗する。
- 同じジョブで`CONTRACT_OUTPUT_DIR`を指定し、実際の応答を成果物`contract-actual`に上げる（`.node-version`の行だけ）。手元で再実行せずに差分を見られる。
- 起動条件は既存の`packages/backend/**`のままでよい（fixture・照合コードも含まれる）。

### 段階2: 実装に依存しない実行口（RUST-04）

E2Eの起動とfixtureの投入を分ける。案は次のとおり。

- `CONTRACT_BASE_URL`を指定したら、テストサーバーを起動せず、そのURLへ要求を送る。
- seed.jsonの投入とtokenの用意を、DBへの直接の書き込みにする（ユーザー・token・凍結もSQLで作る）。今はsignupと管理APIで作っているため、Rust版だけでは準備できない。
- 比較・照合（[contract.ts](../../../packages/backend/test/misc/contract.ts)）はすでに実装に依存しない。

### 段階3: Node.jsとRustの両方で比較（RUST-06）

`packages/backend-rs`ができたら、専用のworkflowを置く。同じseedを別々のDBに入れ、同じ要求の応答を、どちらも保存した応答と比べる（Node.jsとRustを直接比べるのではなく、保存した契約を正とする）。

```yaml
# .github/workflows/test-contract.yml（案）
on:
  pull_request:
    paths:
      - packages/backend/**
      - packages/backend-rs/**
      - .github/workflows/test-contract.yml
jobs:
  contract:
    strategy:
      fail-fast: false
      matrix:
        target: [node, rust]
    services: { postgres: postgres:15, redis: redis:7 }   # test-backend.yml と同じ
    steps:
      - # ビルド（node: pnpm build、rust: cargo build --release）
      - # migrate 後に seed を投入し、target のサーバーを起動
      - run: pnpm --filter backend contract   # CONTRACT_BASE_URL と CONTRACT_OUTPUT_DIR を指定
      - uses: actions/upload-artifact   # contract-actual-${{ matrix.target }}
```

- 必須チェックにするのは`node`から。`rust`は担当を移すエンドポイントの分だけ必須にし、対象のエンドポイントの一覧をworkflowの入力に持たせる。
- 照合を最初にcontract.tsに分けておいたのは、この段階でNode.jsのテストサーバーなしに動かすため。

### 段階4: api.jsonの意味的な差分

既存の[get-api-diff.yml](../../../.github/workflows/get-api-diff.yml)と[report-api-diff.yml](../../../.github/workflows/report-api-diff.yml)は、api.jsonの行の差分をPRにコメントする。移行計画§4.1の1.（意味的な差分をCIの成果物として保存）に向けて、次を足す。

- base・headのapi.jsonから、破壊的な変更（必須プロパティの追加・削除、型の変更、`null`の許可の変更、宣言したステータス・エラーコードの削除）を一覧にした成果物を作る。OpenAPIの差分ツール（oasdiffなど）を候補にし、採否は別に決める。
- Rustへ担当を移したエンドポイントで破壊的な変更があれば失敗させる。それ以外は注意の表示にとどめる。

## 6. 未確定と次の作業

- **responses.jsonの確認**: Node.js版のテストサーバーで記録し、比較モードで一致を確かめた。Rust版での一致は、RUST-04・RUST-06で確かめる。
- **照合順序**: 名前の並びはDBの照合順序で変わる（`ORDER BY category, name`）。本番のDBと、テストの`postgres:15`イメージの照合順序を確かめ、大文字・記号を含む名前の要求を足す。Rust版はSQLの`ORDER BY`に並びを任せ、アプリ側で並べ直さない前提。
- **api.jsonの`format`**: `EmojiSimple`・`EmojiDetailed`の`aliases`の要素に`format: id`が付いているが、別名はIDではない（fixtureの`注意`はIDの形式に合わない）。SDKの型（TypeScript）には影響しないので、照合では`format`を見ない。定義を直すかは別に決める。
- **エラーの例はcodeごとに1つ**: `INVALID_PARAM`には2つのid（`3d81ceae-…`と、GETでの変換の`0b5f1631-…`）があるが、api.jsonの`examples`には1つしか載らない。GETの変換の失敗を要求に加えると照合が失敗するので、そのときは照合の規則か`examples`の出し方を直す。
- **まだ含めていないもの**: OAuthのアプリのtoken（`hash`を小文字で引く経路）、flash token、レート制限（`emojis`には制限がない）、413、CORSのpreflight（`OPTIONS`）、`HEAD`、IP履歴の書き込み（`enableIpLogging`）、multipart。
- **段階2〜4**: §5の案のとおり、RUST-04・RUST-06で実装する。
