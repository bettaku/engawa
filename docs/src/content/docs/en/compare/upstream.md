---
title: Differences from Misskey and CherryPick
description: Where engawa differs from CherryPick and Misskey, the projects it is forked from.
---

engawa is a fork of CherryPick, and CherryPick is a fork of Misskey. This page answers two questions: how far you can treat engawa as if it were Misskey, and whether articles written for CherryPick apply to engawa as they are.

## How to read this page

The comparison is based on the following versions.

| | Version |
| --- | --- |
| engawa | `4.17.0-engawa20260408` |
| CherryPick | `4.17.0` |
| Misskey | `2025.10.2` |

Only features that users can see being **added, removed or changed** are listed. Internal refactoring, dependency updates and performance improvements are left out; see the [CHANGELOG](https://github.com/bettaku/engawa/blob/develop/CHANGELOG_engawa.md) for those.

Each item names the API endpoint or file used to check it, so that you can verify for yourself whether the description has gone out of date.

:::caution[engawa appears as CherryPick on the fediverse]
engawa reports its software name as `cherrypick` in nodeinfo, so other servers recognise an engawa server as a CherryPick server. This is intentional, for compatibility.
:::

## Differences from Misskey that come from CherryPick

The following features were added to Misskey by CherryPick, and engawa inherits them. **They are not engawa's own features.**

| Feature | Checked with |
| --- | --- |
| Editing notes after posting | `notes/update`, `NoteUpdateService.ts` |
| Argon2id for password hashing | `packages/backend/src/misc/password.ts` |
| Dice and search widgets | `packages/frontend/src/widgets/` |

For the full set of differences between CherryPick and Misskey, see the [CherryPick documentation](https://github.com/kokonect-link/cherrypick). Only the ones that are easy to mistake for engawa's own changes are listed here.

## Added features

These are in engawa but not in CherryPick `4.17.0`.

### Posting

- **"Private" visibility** — a visibility that only you can see. `private` is added to `visibility` (`packages/backend/src/models/json-schema/note.ts`).
- **Maximum note length** — see "Changed features" below.

### Federation

- **Federating `isIndexable`** — supports the property proposed by kmyblue that states, per user, whether they may be added to search indexes (`MiUser.isIndexable`).
- **Search permission** — lets you choose, per note, whether it may be added to search indexes (`searchableBy`).
- **Authorized Fetch** — a setting that verifies the sender's signature before accepting an Activity (`Meta.enableAuthorizedFetch`, `Meta.enableBotProtectionForAuthorizedFetch`).

### For administrators

- **Marking users as sensitive** — a whole user can be treated as sensitive (`admin/set-user-sensitive`, `admin/unset-user-sensitive`).
- **Status page URL** — you can link a status page such as Betterstack or Uptime Robot on `/about` (`Meta.statusUrl`).
- **Custom `robots.txt`** — its contents can be set from the control panel (`Meta.robotsTxt`).
- **Rebuilding the search index** — a full rebuild and a re-index of the difference can be run from the control panel (`admin/index/full`, `admin/index/reindex`).

## Removed features

These are in both CherryPick `4.17.0` and Misskey `2025.10.2` but not available in engawa. They cannot be reached from the UI, and the matching API endpoints do not exist.

| Feature | What was removed |
| --- | --- |
| Channels | every `channels/*` endpoint, `channel.vue`, `channels.vue`, `channel-editor.vue`, and the channel column in deck |
| Reversi | every `reversi/*` endpoint, `pages/reversi/` |
| Bubble game (Drop & Fusion) | every `bubble-game/*` endpoint, `drop-and-fusion.vue` |

:::note[Traces remain in the database and locales]
The Reversi migrations (`*-reversi*.js` in `packages/backend/migration/`) and the `_reversi:` block in the locales are still there. The feature cannot be used, but the tables and translation strings exist.
:::

## Changed features

These exist on both sides but behave differently or have different limits.

| Item | engawa | CherryPick `4.17.0` | Misskey `2025.10.2` |
| --- | --- | --- | --- |
| Maximum note length | 5120 | 3000 | 3000 |

This is defined as `MAX_NOTE_TEXT_LENGTH` in `packages/backend/src/const.ts`. The database-side limit (`DB_MAX_NOTE_TEXT_LENGTH`) is 8192 in all three.

:::note[Some features are shared with yojo-art]
Search permission, federating `isIndexable`, the status page link and the maximum note length also exist in a similar form in [yojo-art](https://github.com/yojo-art/cherrypick), another fork built on CherryPick. See [Comparison with other forks](/engawa/en/compare/forks/) for details.
:::

## Known incompatibilities

Points where engawa does not mesh with other implementations in federation, the API or the database.

- **"Private" visibility is not conveyed to other implementations.** It is a concept specific to engawa, so other servers may not handle such notes as intended. It is meant for use that stays within your engawa server.
- **The software name in nodeinfo is `cherrypick`.** engawa cannot be identified as engawa.
- **Because channels are removed, notes that arrive with a channel attached are handled differently from Misskey and CherryPick.**

## About this page

If anything here disagrees with the implementation, please let us know in an [issue](https://github.com/bettaku/engawa/issues). That is why each item notes what was used to check it.
