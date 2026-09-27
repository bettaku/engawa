---
title: テーマのプロパティ
description: テーマのjson5ファイルに書ける各プロパティが、UIのどこを指しているかの対応表
lastUpdated: 2026-09-20
---

テーマファイルの `props` に書いたプロパティが、画面のどこに反映されるのかをまとめています。

テーマを自作するときや、「この色を変えたいけれどどのプロパティか分からない」というときに参照してください。

## テーマファイルの構造

テーマはJSON5で書きます。ベーステーマは [`packages/frontend-shared/themes/_light.json5`](https://github.com/bettaku/engawa/blob/develop/packages/frontend-shared/themes/_light.json5) と `_dark.json5` にあり、同梱テーマはこれを継承しています。

```json5
{
	id: 'my-theme',          // 一意なID（UUIDなど）
	name: 'My Theme',        // 表示名
	author: 'you',
	desc: '説明（省略可）',
	base: 'light',           // 'light' か 'dark'。継承元のベーステーマ
	props: {
		accent: '#6ba5e3',
		bg: '#fff',
		// ...
	},
	codeHighlighter: {       // 省略可。コードブロックの配色
		base: 'catppuccin-latte',
	},
}
```

`base` を指定すると、ベーステーマの `props` に自分の `props` を上書きマージしたものが使われます。つまり、変えたいプロパティだけ書けば済みます。

## props がCSSに届くまで

`props` の各キーは、コンパイルされたあと `--MI_THEME-<キー名>` というCSSカスタムプロパティとして `<html>` 要素に設定されます。

```
props.accent → --MI_THEME-accent → var(--MI_THEME-accent)
```

処理は [`packages/frontend/src/theme.ts`](https://github.com/bettaku/engawa/blob/develop/packages/frontend/src/theme.ts) の `compile()` と `applyThemeInternal()` が行っています。

そのため、あるプロパティが実際にどこで使われているかは、フロントエンドのソースを `--MI_THEME-<キー名>` で検索すれば確認できます。ブラウザの開発者ツールで要素を選び、算出スタイルから `--MI_THEME-` を辿るのも早いです。

## 値の書き方

プロパティの値には、色そのもの以外に参照や関数も書けます。

| 書き方 | 意味 | 例 |
|---|---|---|
| CSSの色 | そのままの色 | `'#6ba5e3'`、`'rgba(0, 0, 0, 0.1)'` |
| `@キー名` | 他のプロパティを参照する | `'@accent'` |
| `$キー名` | 定数を参照する | `'$myColor'` |
| `:関数<引数<値` | 値に関数を適用する | `':darken<3<@fg'` |
| `"` で始まる文字列 | 色ではなく生のCSS値として扱う | `'" solid 1px var(--MI_THEME-divider)'` |

使える関数は `darken`、`lighten`、`alpha`、`hue`、`saturate` の5つです。`alpha` の引数は0〜1、それ以外は量（パーセント／度）を取ります。

`$` で始まるキーは定数で、CSS変数としては出力されません。共通の色をまとめておくのに使います。

## プロパティ一覧

### 基本の色

| プロパティ | 指しているもの |
|---|---|
| `accent` | アクセントカラー。ボタン、リンク的な強調、選択中の項目など全体で使われる |
| `accentedBg` | アクセント色の薄い背景。ナビゲーションの選択中の項目、ラジオボタンの選択状態などの下地 |
| `bg` | ページ全体の背景色 |
| `fg` | 基本の文字色 |
| `fgHighlighted` | 強調された文字色。ホバー時の見出しやタブのラベルなど |
| `fgOnAccent` | アクセント色の上に乗る文字・アイコンの色 |
| `fgOnWhite` | 白背景の上に乗る文字色。フォローボタンで使われる |
| `focus` | キーボードフォーカス時のアウトライン（`:focus-visible`）の色 |
| `divider` | 区切り線・枠線の色。リスト、カード、テーブルなど非常に広範囲で使われる |
| `indicator` | 未読件数バッジ（`._indicateCounter`）の背景色 |
| `love` | ハート（いいね）アイコンの色 |

### パネル・ウィンドウ・モーダル

| プロパティ | 指しているもの |
|---|---|
| `panel` | パネルの背景色。ノート、カード、ウィジェットなど画面上の大半の「箱」の下地 |
| `panelHighlight` | パネル上のホバー・アクティブ状態の背景色 |
| `panelHeaderBg` | パネルのヘッダー部分の背景色（`MkContainer`、デッキのカラムヘッダー） |
| `panelHeaderFg` | 同ヘッダーの文字色 |
| `panelBorder` | パネルの枠線。色ではなくCSSの `border` ショートハンドをそのまま書く（`'" solid 1px ...'`） |
| `windowHeader` | ウィンドウ／モーダルウィンドウのヘッダー背景色 |
| `popup` | ポップアップ（`._popup`）の背景色。メニュー、ツールチップ、補完候補など |
| `shadow` | 影（`._shadow`）の色 |
| `modalBg` | モーダルを開いたときの背後のオーバーレイ色 |
| `modalBgX2` | 画像ビューアー（PhotoSwipe）の背景色。`modalBg` より濃い |

### ナビゲーション・ヘッダー

| プロパティ | 指しているもの |
|---|---|
| `navBg` | サイドバー／ナビゲーションバーの背景色 |
| `navFg` | ナビゲーションの文字・アイコンの色 |
| `navActive` | ナビゲーションで現在開いている項目の色 |
| `navIndicator` | ナビゲーション項目に付く未読インジケーターの色 |
| `pageHeaderBg` | ページヘッダーの背景色 |
| `pageHeaderFg` | ページヘッダーの文字色 |
| `deckBg` | デッキUIの、カラムの外側の背景色 |

### ノート・本文の装飾

| プロパティ | 指しているもの |
|---|---|
| `link` | 本文中のリンク（`._link`）の色 |
| `hashtag` | 本文中のハッシュタグの色 |
| `mention` | 本文中のメンションの色 |
| `mentionMe` | 自分宛てのメンションの色 |
| `renote` | リノートであることを示すヘッダー（「〜がリノート」）の色 |
| `renoteHover` | 同ヘッダーのリンクにホバーしたときの色 |
| `nameHover` | ノートのユーザー名にホバーしたときの色 |
| `badge` | ユーザーに付く管理者・鍵アカウントなどのバッジアイコンの色 |

### ボタン・フォーム

| プロパティ | 指しているもの |
|---|---|
| `buttonBg` | 通常のボタンの背景色 |
| `buttonHoverBg` | ボタンにホバーしたときの背景色 |
| `buttonGradateA` | グラデーションボタン（`._buttonGradate`）の左端の色 |
| `buttonGradateB` | 同グラデーションの右端の色 |
| `switchOffBg` | スイッチがオフのときのトラックの色 |
| `switchOffFg` | スイッチがオフのときのつまみの色 |
| `switchOnBg` | スイッチがオンのときのトラックの色 |
| `switchOnFg` | スイッチがオンのときのつまみの色 |
| `inputBorder` | チェックボックス・ラジオボタンの枠線の色 |
| `inputBorderHover` | 入力欄・チェックボックスなどにホバーしたときの枠線の色 |
| `folderHeaderBg` | 折りたたみ（`MkFolder`）のヘッダー背景色 |
| `folderHeaderHoverBg` | 同ヘッダーにホバーしたときの背景色 |

### 状態・通知

| プロパティ | 指しているもの |
|---|---|
| `success` | 成功を示す色 |
| `error` | エラーを示す色 |
| `warn` | 警告を示す色。文字数超過の表示などにも使われる |
| `infoBg` | 情報バナー（`MkInfo`、`MkTip`）の背景色 |
| `infoFg` | 情報バナーの文字色 |
| `infoWarnBg` | 警告バナー（リモート注意書き、非推奨警告など）の背景色 |
| `infoWarnFg` | 警告バナーの文字色 |

### その他

| プロパティ | 指しているもの |
|---|---|
| `scrollbarHandle` | スクロールバーのつまみの色 |
| `scrollbarHandleHover` | スクロールバーのつまみにホバーしたときの色 |
| `codeString` | オブジェクトビューアーでの文字列値の色 |
| `codeNumber` | オブジェクトビューアーでの数値の色 |
| `codeBoolean` | オブジェクトビューアーでの真偽値の色 |
| `htmlThemeColor` | `<meta name="theme-color">` に設定される色。モバイルブラウザのアドレスバーなどの色に影響する |

コードブロックそのものの配色は `props` ではなく、テーマ直下の `codeHighlighter` で指定します。値には [Shiki](https://shiki.style/themes) のテーマ名を使います。

## 現在どこからも参照されていないプロパティ

ベーステーマには定義されているものの、2026年9月時点でCSSから参照されていないプロパティがあります。指定しても見た目は変わりませんが、互換性のためベーステーマには残っています。

- `header`
- `dateLabelFg`
- `switchBg`
- `patron`
- `messageBg`
- `chatReadBg`
- `cherry`
- `pick`
- `pickLighten`

自作テーマでこれらを省略しても問題ありませんが、既存テーマから削除する必要もありません。

## 補足

- 新しいプロパティを追加するときは、`_light.json5` と `_dark.json5` の両方に追加してください。`themeProps`（テーマエディターが扱うプロパティ一覧）は `_light.json5` から生成されるため、片方だけに追加するとダークテーマで値が欠けます。
- `X` で始まるキーは `themeProps` から除外され、テーマエディターに表示されません。
- テーマを変更すると `themeChanging` / `themeChanged` イベントがクライアント全体に通知されます。JSで色を計算しているコンポーネントは、これを購読して再計算しています。
