---
title: Comparison with other forks
description: Which features engawa, CherryPick, Misskey, Sharkey and yojo-art have.
---

This page compares engawa with other Misskey-family forks by whether they have a given feature. It does not try to be exhaustive.

:::caution[This table was written by engawa]
It is not a neutral comparison. The features were picked with engawa as the reference point, so strengths of the other implementations may be missing.
:::

## Legend

| Symbol | Meaning |
| --- | --- |
| ○ | Has it |
| ◌ | Partially |
| × | Does not have it |
| ? | Not checked, or cannot be determined from public information |

**No symbol expresses which is better.** The table only shows whether a feature is there or not. Which is better depends on what you need, so the table does not judge.

"×" and "?" are kept apart. Nothing is marked as missing unless it was actually checked.

## What was checked

| Implementation | Repository | Checked | Date |
| --- | --- | --- | --- |
| engawa | [bettaku/engawa](https://github.com/bettaku/engawa) | `4.17.0-engawa20260408` (current tree) | 2026-09-20 |
| CherryPick | [kokonect-link/cherrypick](https://github.com/kokonect-link/cherrypick) | `4.17.0` | 2026-09-20 |
| Misskey | [misskey-dev/misskey](https://github.com/misskey-dev/misskey) | `2025.10.2` | 2026-09-20 |
| Sharkey | [TransFem-org/Sharkey](https://activitypub.software/TransFem-org/Sharkey) | `develop` `9be347ef06` (2026-09-20) | 2026-09-20 |
| yojo-art | [yojo-art/cherrypick](https://github.com/yojo-art/cherrypick) | `1.11.1` (2026-09-15) | 2026-09-20 |

Every entry was judged by reading each repository's source code directly. For Sharkey, a specific commit on the `develop` branch was used rather than a release tag.

yojo-art `1.11.1` has a `basedCherrypickVersion` of `4.17.0`, so it is built on the same CherryPick as engawa.

## Comparison table

| Feature | engawa | CherryPick | Misskey | Sharkey | yojo-art |
| --- | :---: | :---: | :---: | :---: | :---: |
| Editing notes | ○ | ○ | × | ○ | ○ |
| Viewing edit history | × | × | × | ○ | × |
| "Private" visibility | ○ | × | × | × | × |
| Search permission | ○ | × | × | × | ○ |
| Federating `isIndexable` | ○ | × | × | × | ○ |
| Authorized Fetch | ○ | × | × | ○ | × |
| Advanced search (OpenSearch) | × | × | × | × | ○ |
| Channels | × | ○ | ○ | ○ | ○ |
| Reversi | × | ○ | ○ | ○ | ○ |
| Bubble game | × | ○ | ○ | ○ | ○ |
| Status page link | ○ | × | × | × | ○ |
| Setting `robots.txt` | ○ | × | × | ○ | × |

The maximum note length cannot be shown with a symbol, so it is listed separately.

| | engawa | CherryPick | Misskey | Sharkey | yojo-art |
| --- | :---: | :---: | :---: | :---: | :---: |
| Maximum note length | 5120 | 3000 | 3000 | Configurable | 5120 |

In Sharkey it is a setting (`config.maxNoteLength`) rather than a constant, so it varies from server to server.

## Criteria

Each feature has a definition of what earns a "○".

- **Editing notes** — you can change the text of a note you have already posted while it keeps the same note ID, without deleting and reposting it. Editing a draft before posting does not count. engawa, CherryPick and yojo-art implement it as `notes/update`; Sharkey as `notes/edit` and `NoteEditService.edit()`. Misskey `2025.10.2` does not have it; its "delete and edit" changes the note ID, so it is marked "×".
- **Viewing edit history** — you can view earlier versions of an edited note. Judged by Sharkey's `notes/versions`.
- **"Private" visibility** — when posting, you can choose a visibility that only you can see. Judged by whether `visibility` can be `private`.
- **Search permission** — you can choose, per note, whether it may be added to search indexes. Judged by the presence of `searchableBy`.
- **Federating `isIndexable`** — the property stating, per user, whether they are searchable can be federated. Judged by the presence of `MiUser.isIndexable`.
- **Authorized Fetch** — the server can verify the signature of an ActivityPub request before responding. engawa implements it with `Meta.enableAuthorizedFetch`, Sharkey with `checkAuthorizedFetch()` in `ActivityPubServerService`. **How to enable it differs between implementations.**
- **Advanced search (OpenSearch)** — you can search notes with conditions using OpenSearch. Judged by the presence of `notes/advanced-search` and `AdvancedSearchService`.
- **Channels** — you can create a channel and post notes to it. Judged by the presence of `channels/create`.
- **Reversi** — you can play Reversi on the server. Judged by the presence of `reversi/match`.
- **Bubble game** — you can play Drop & Fusion. Judged by the presence of `bubble-game/ranking`.
- **Status page link** — you can link an external status page on `/about`. Judged by the presence of `Meta.statusUrl`.
- **Setting `robots.txt`** — you can set the contents of `robots.txt` from the control panel. Judged by the presence of `Meta.robotsTxt`.

## What this table cannot tell you

**The table cannot show who implemented something first.** Looking at the rows side by side, you cannot tell whether engawa added a feature or simply inherited it from the project it forked.

For example, "Editing notes" is "○" for engawa and "×" for Misskey, but it is not an engawa feature. engawa just inherits what CherryPick implemented.

For what engawa itself added and removed, see [Differences from Misskey and CherryPick](/engawa/en/compare/upstream/).

## About yojo-art

Like engawa, yojo-art is a fork built on CherryPick `4.17.0`; it is not upstream of engawa. As the table shows, the two have similar features.

- **Shared** — search permission, federating `isIndexable`, the status page link, and a maximum note length of 5120.
- **Only in yojo-art** — advanced search (OpenSearch). engawa merged it once but has since removed it.
- **Only in engawa** — "private" visibility, Authorized Fetch, and setting `robots.txt`.

Changes have been merged in both directions in the past. The `CHANGELOG_yojo.md` bundled in the repository is yojo-art's history, and a feature listed there is not necessarily in engawa.
