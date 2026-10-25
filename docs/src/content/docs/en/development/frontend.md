---
title: Frontend notes
description: Things to watch out for with Vue, the router (nirax), icons, Storybook and CSS
lastUpdated: 2026-10-24
sidebar:
  order: 5
---

Things to keep in mind when writing frontend code (`packages/frontend`).

## Vue

- Write components with the Vue 3 Composition API (`<script lang="ts" setup>`). Don't use the Options API. Refactoring old components that still use the Options API to the Composition API is welcome.
- Prefix component names with `Mk` (e.g. `MkNote`, `MkAvatar`).

### Don't give a component its own `margin`

A component that sets its own `margin` causes problems. Let the code that uses the component set the `margin`.

### Wrap connections in `markRaw`

When you put a cherrypick-js connection in the `data` of an Options API component, always wrap it in `markRaw`. Making it reactive unnecessarily breaks processing inside cherrypick-js and hurts performance. This does not apply to the Composition API, where reactivity is opt-in.

## Icons (Tabler Icons)

Unused icons are removed in production builds.

**When switching icons dynamically, don't build only part of the name, as in `ti-${someVal}`.** The build can no longer detect which icons are used. Always write the full class name, such as `ti-xxx`.

## Router (nirax)

nirax is engawa's (Misskey's) own frontend router. It is not vue-router, but it is heavily influenced by it, so learning vue-router first helps.

### Route definitions

Routes are defined as an array of objects of the following shape.

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

:::caution[Routes are evaluated in the order they are defined]
For example, if `/foo/bar` is defined after `/foo/:id`, it never matches. Define specific routes before routes with generic path parameters.
:::

### Multiple routers

The biggest difference from vue-router is that nirax allows several routers to exist at the same time. This makes it possible, for example, to route inside an in-app window independently of the browser.

## Storybook

[Storybook](https://storybook.js.org/) is used for UI development.

### Starting it

```bash
pnpm --filter cherrypick-js build
pnpm --filter frontend storybook-dev
```

### Writing stories

When you create a new component (e.g. `MyComponent.vue`), `.storybook/generate.js` generates a story file (`MyComponent.stories.ts`) automatically.

To override the default story, create `MyComponent.stories.impl.ts`.

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

To opt out of the automatic generation, put the following in `MyComponent.stories.impl.ts`.

```ts
import MyComponent from './MyComponent.vue';
void MyComponent;
```

You can override the component meta with `MyComponent.stories.meta.ts`.

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

API requests can be mocked with msw. Define the handlers in `MyComponent.stories.msw.ts`.

```ts
import { HttpResponse, http } from 'msw';
export const handlers = [
	http.post('/api/notes/timeline', ({ request }) => {
		return HttpResponse.json([]);
	}),
];
```

:::caution
After adding, editing or removing these files, run `.storybook/generate.js` again.
:::

## CSS recipes

How to adjust a theme color (CSS variable) slightly.

### Lighten

```css
color: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
```

### Darken

```css
color: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
```

### Add transparency

```css
color: color(from var(--MI_THEME-accent) srgb r g b / 0.5);
```

For the CSS variables available in themes, see [Theme properties](/engawa/en/development/theme-properties/).
