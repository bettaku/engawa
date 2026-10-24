---
title: フロントエンドの注意点
description: Vue・ルーター（nirax）・アイコン・Storybook・CSSで気をつけること
lastUpdated: 2026-10-24
sidebar:
  order: 5
---

フロントエンド（`packages/frontend`）のコードを書くときに気をつけることをまとめています。

## Vue

- Vue 3 の Composition API（`<script lang="ts" setup>`）で書きます。Options API は使いません。古い実装で Options API のものが残っていれば、Composition API に書き直すリファクタリングも歓迎します。
- コンポーネントの名前には `Mk` を付けます（例: `MkNote`、`MkAvatar`）。

### コンポーネント自身に `margin` を持たせない

コンポーネントが自分で `margin` を設定すると、問題の元になります。`margin` は、そのコンポーネントを使う側で設定してください。

### コネクションは `markRaw` で包む

Options API の `data` に cherrypick-js のコネクションを入れるときは、必ず `markRaw` で包んでください。不必要にリアクティブになると、cherrypick-js の中の処理で不具合が起き、パフォーマンスも悪くなります。Composition API では、リアクティブにするのは手動なので、この限りではありません。

## アイコン（Tabler Icons）

本番ビルドのときに、使われていないアイコンは削除されます。

**アイコンを動的に切り替えるときに、`ti-${someVal}` のようにアイコン名の一部だけを組み立てないでください。** 使われているアイコンを検出できなくなります。必ず `ti-xxx` のような完全なクラス名を書いてください。

## ルーター（nirax）

nirax は、engawa（Misskey）独自のフロントエンド用ルーターです。vue-router ではありません。vue-router の影響を大きく受けているので、まず vue-router について知っておくと分かりやすいです。

### ルートの定義

ルートの定義は、次の形のオブジェクトの配列です。

```ts
{
	name?: string;
	path: string;
	component: Component;
	query?: Record<string, string>;
	loginRequired?: boolean;
	hash?: string;
	children?: RouteDef[];
}
```

:::caution[ルートは定義した順に評価されます]
たとえば `/foo/:id` の次に `/foo/bar` を定義すると、`/foo/bar` には一致しなくなります。汎用的なパスパラメーターを持つルートより、具体的なルートを先に定義してください。
:::

### 複数のルーター

vue-router との一番の違いは、nirax では複数のルーターが同時に存在できることです。これにより、アプリ内のウィンドウで、ブラウザとは別にルーティングすることなどができます。

## Storybook

UIの開発には [Storybook](https://storybook.js.org/) を使います。

### 起動する

```bash
pnpm --filter cherrypick-js build
pnpm --filter frontend storybook-dev
```

### ストーリーを書く

新しいコンポーネント（例: `MyComponent.vue`）を作ると、`.storybook/generate.js` がストーリーファイル（`MyComponent.stories.ts`）を自動で生成します。

既定のストーリーを上書きしたいときは、`MyComponent.stories.impl.ts` を作ります。

```ts
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { StoryObj } from '@storybook/vue3';
import MyComponent from './MyComponent.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MyComponent,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
			},
			template: '<MyComponent v-bind="props" />',
		};
	},
	args: {
		foo: 'bar',
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MyComponent>;
```

自動生成を止めたいときは、`MyComponent.stories.impl.ts` に次の内容を書きます。

```ts
import MyComponent from './MyComponent.vue';
void MyComponent;
```

コンポーネントのメタ情報は、`MyComponent.stories.meta.ts` で上書きできます。

```ts
export const argTypes = {
	scale: {
		control: {
			type: 'range',
			min: 1,
			max: 4,
		},
	},
};
```

APIのリクエストは、msw でモックにできます。`MyComponent.stories.msw.ts` にハンドラーを書きます。

```ts
import { HttpResponse, http } from 'msw';
export const handlers = [
	http.post('/api/notes/timeline', ({ request }) => {
		return HttpResponse.json([]);
	}),
];
```

:::caution
これらのファイルを追加・編集・削除したら、`.storybook/generate.js` を実行し直してください。
:::

## CSSのレシピ

テーマの色（CSS変数）を少し変えて使いたいときの書き方です。

### 明るくする

```css
color: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
```

### 暗くする

```css
color: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
```

### 透明度を付ける

```css
color: color(from var(--MI_THEME-accent) srgb r g b / 0.5);
```

テーマで使えるCSS変数の一覧は [テーマのプロパティ](/engawa/development/theme-properties/) を参照してください。
