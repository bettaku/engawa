---
title: Theme properties
description: A map from each property you can write in a theme's json5 file to the part of the UI it controls
lastUpdated: 2026-09-20
---

This page describes where each property under `props` in a theme file shows up on screen.

Reach for it when you are building your own theme, or when you want to change a particular color but don't know which property owns it.

## How a theme file is structured

Themes are written in JSON5. The base themes live in [`packages/frontend-shared/themes/_light.json5`](https://github.com/bettaku/engawa/blob/develop/packages/frontend-shared/themes/_light.json5) and `_dark.json5`, and the bundled themes inherit from them.

```json5
{
	id: 'my-theme',          // A unique ID (a UUID, for example)
	name: 'My Theme',        // The display name
	author: 'you',
	desc: 'A description (optional)',
	base: 'light',           // 'light' or 'dark'. The base theme to inherit from
	props: {
		accent: '#6ba5e3',
		bg: '#fff',
		// ...
	},
	codeHighlighter: {       // Optional. Colors for code blocks
		base: 'catppuccin-latte',
	},
}
```

When you set `base`, your `props` are merged over the base theme's `props`. In other words, you only need to write the properties you actually want to change.

## How props reach CSS

Each key under `props` is compiled into a CSS custom property named `--MI_THEME-<key>` and set on the `<html>` element.

```
props.accent → --MI_THEME-accent → var(--MI_THEME-accent)
```

The work is done by `compile()` and `applyThemeInternal()` in [`packages/frontend/src/theme.ts`](https://github.com/bettaku/engawa/blob/develop/packages/frontend/src/theme.ts).

So if you want to know where a property is actually used, search the frontend source for `--MI_THEME-<key>`. Picking an element in your browser's devtools and following `--MI_THEME-` through its computed styles is often quicker.

## Writing values

A property's value can be more than a literal color — references and functions work too.

| Syntax | Meaning | Example |
|---|---|---|
| A CSS color | The color itself | `'#6ba5e3'`, `'rgba(0, 0, 0, 0.1)'` |
| `@key` | Refer to another property | `'@accent'` |
| `$key` | Refer to a constant | `'$myColor'` |
| `:func<arg<value` | Apply a function to a value | `':darken<3<@fg'` |
| A string starting with `"` | Treat it as a raw CSS value rather than a color | `'" solid 1px var(--MI_THEME-divider)'` |

There are five functions available: `darken`, `lighten`, `alpha`, `hue` and `saturate`. `alpha` takes an argument between 0 and 1; the others take an amount (a percentage or an angle).

Keys starting with `$` are constants and are not emitted as CSS variables. They are handy for collecting shared colors in one place.

## Property reference

### Core colors

| Property | What it controls |
|---|---|
| `accent` | The accent color. Used throughout for buttons, link-like emphasis, the selected item, and so on |
| `accentedBg` | A pale accent background. The backdrop for the selected navigation item, a checked radio button, and similar states |
| `bg` | The background color of the whole page |
| `fg` | The default text color |
| `fgHighlighted` | Emphasized text. Headings on hover, tab labels, and the like |
| `fgOnAccent` | Text and icons that sit on top of the accent color |
| `fgOnWhite` | Text that sits on a white background. Used by the follow button |
| `focus` | The outline color for keyboard focus (`:focus-visible`) |
| `divider` | Dividers and borders. Used very widely — lists, cards, tables |
| `indicator` | The background of the unread-count badge (`._indicateCounter`) |
| `love` | The color of the heart (favorite) icon |

### Panels, windows and modals

| Property | What it controls |
|---|---|
| `panel` | The panel background. The backdrop for most of the "boxes" on screen: notes, cards, widgets |
| `panelHighlight` | The background for hover and active states on a panel |
| `panelHeaderBg` | The background of a panel's header (`MkContainer`, deck column headers) |
| `panelHeaderFg` | The text color of that header |
| `panelBorder` | A panel's border. Not a color — write a CSS `border` shorthand directly (`'" solid 1px ...'`) |
| `windowHeader` | The header background of windows and modal windows |
| `popup` | The background of popups (`._popup`): menus, tooltips, autocomplete suggestions |
| `shadow` | The color of shadows (`._shadow`) |
| `modalBg` | The overlay behind an open modal |
| `modalBgX2` | The background of the image viewer (PhotoSwipe). Darker than `modalBg` |

### Navigation and headers

| Property | What it controls |
|---|---|
| `navBg` | The background of the sidebar and navigation bar |
| `navFg` | Text and icons in the navigation |
| `navActive` | The currently open item in the navigation |
| `navIndicator` | The unread indicator attached to a navigation item |
| `pageHeaderBg` | The page header background |
| `pageHeaderFg` | The page header text color |
| `deckBg` | In the deck UI, the background outside the columns |

### Notes and inline decoration

| Property | What it controls |
|---|---|
| `link` | Links in body text (`._link`) |
| `hashtag` | Hashtags in body text |
| `mention` | Mentions in body text |
| `mentionMe` | Mentions addressed to you |
| `renote` | The header marking a post as a renote ("X renoted") |
| `renoteHover` | That header's link on hover |
| `nameHover` | A note's username on hover |
| `badge` | Badge icons on a user, such as admin or locked account |

### Buttons and forms

| Property | What it controls |
|---|---|
| `buttonBg` | The background of an ordinary button |
| `buttonHoverBg` | A button's background on hover |
| `buttonGradateA` | The left end of a gradient button (`._buttonGradate`) |
| `buttonGradateB` | The right end of that gradient |
| `switchOffBg` | The track of a switch when it is off |
| `switchOffFg` | The knob of a switch when it is off |
| `switchOnBg` | The track of a switch when it is on |
| `switchOnFg` | The knob of a switch when it is on |
| `inputBorder` | The border of checkboxes and radio buttons |
| `inputBorderHover` | The border of inputs, checkboxes and the like on hover |
| `folderHeaderBg` | The header background of a collapsible section (`MkFolder`) |
| `folderHeaderHoverBg` | That header's background on hover |

### States and notices

| Property | What it controls |
|---|---|
| `success` | Indicates success |
| `error` | Indicates an error |
| `warn` | Indicates a warning. Also used for things like the over-limit character count |
| `infoBg` | The background of an info banner (`MkInfo`, `MkTip`) |
| `infoFg` | The text color of an info banner |
| `infoWarnBg` | The background of a warning banner (remote-content notices, deprecation warnings, and so on) |
| `infoWarnFg` | The text color of a warning banner |

### Everything else

| Property | What it controls |
|---|---|
| `scrollbarHandle` | The scrollbar thumb |
| `scrollbarHandleHover` | The scrollbar thumb on hover |
| `codeString` | String values in the object viewer |
| `codeNumber` | Numeric values in the object viewer |
| `codeBoolean` | Boolean values in the object viewer |
| `htmlThemeColor` | The color set on `<meta name="theme-color">`. Affects things like the address bar in mobile browsers |

The colors of code blocks themselves are not set through `props` but through `codeHighlighter` at the top level of the theme. Its value is the name of a [Shiki](https://shiki.style/themes) theme.

## Properties nothing currently references

Some properties are defined in the base themes but, as of September 2026, are not referenced from any CSS. Setting them changes nothing visually; they remain in the base themes for compatibility.

- `header`
- `dateLabelFg`
- `switchBg`
- `patron`
- `messageBg`
- `chatReadBg`
- `cherry`
- `pick`
- `pickLighten`

You can safely leave them out of your own theme, and there is no need to strip them from an existing one.

## Notes

- When you add a new property, add it to both `_light.json5` and `_dark.json5`. `themeProps` — the property list the theme editor works from — is generated from `_light.json5`, so adding it to only one file leaves the value missing in dark themes.
- Keys starting with `X` are excluded from `themeProps` and do not appear in the theme editor.
- Changing the theme fires `themeChanging` and `themeChanged` events across the client. Components that compute colors in JS subscribe to these and recalculate.
