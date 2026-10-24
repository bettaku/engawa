---
title: Developer documentation
description: Technical information about developing engawa, and rules common to the whole codebase
lastUpdated: 2026-10-24
sidebar:
  order: 1
---

This section collects technical information about developing engawa. For how to take part in the project, such as opening issues, sending pull requests and releasing, see [CONTRIBUTING.md](https://github.com/bettaku/engawa/blob/develop/CONTRIBUTING.md).

## Pages

- [Setting up a development environment](/engawa/en/development/setup/): required software, starting the development server, and common commands.
- [Testing](/engawa/en/development/testing/): running the frontend, SDK and backend tests, and the federation E2E tests.
- [Backend notes](/engawa/en/development/backend/): things to watch out for with NestJS, TypeORM, SQL and migrations.
- [Frontend notes](/engawa/en/development/frontend/): things to watch out for with Vue, the router (nirax), icons, Storybook and CSS.
- [Theme properties](/engawa/en/development/theme-properties/): where each property of a theme file appears in the UI.

## Repository layout

The repository is a pnpm monorepo. The main packages are:

| Package | Role |
|---|---|
| `packages/backend` | API server (NestJS, Fastify, TypeORM, PostgreSQL, Redis, BullMQ) |
| `packages/frontend` | Web client (Vue 3, Vite) |
| `packages/frontend-shared` | Components and utilities shared between frontend packages |
| `packages/frontend-embed` | Embeddable notes and timelines |
| `packages/sw` | Service Worker |
| `packages/cherrypick-js` | TypeScript SDK (types are generated from the backend) |
| `packages/icons-subsetter` | Keeps only the Tabler Icons that are used, at build time |
| `locales` | Locale files (`ja-JP.yml` is the source) |
| `docs` | This documentation site (Starlight) |

## Rules common to the whole codebase

### Language and formatting

- Write TypeScript in strict mode.
- Use [Biome](https://biomejs.dev/) for formatting (Prettier is not used). Run `pnpm format:write` in a package to format it.
- Avoid default exports (`export default`).
- Avoid non-null assertions (`!`).

### Don't name files `index`

Directory imports are not supported in ESM. Even without a directory import, some libraries treat a file named `index` as a directory import and fail.

### Prefix engawa (Misskey) domain concepts with `Mi`

Like the TypeORM entities (`MiUser`, `MiNote`, `MiDriveFile` and so on), prefix domain-specific concepts that come from Misskey with `Mi`. Just as Google calls its service Google Maps rather than Maps, this distinguishes them from similar concepts in other domains and avoids name collisions. You may omit `Mi` only for short-lived local variables when the context makes it obvious and there is no risk of collision.

### Be careful when importing JSON

When you `import` a JSON file in TypeScript, `tsc` copies that JSON file to the output directory. This can overwrite files unintentionally, so read JSON files that must not be overwritten with `fs.readFileSync` or similar instead of `import`.

### Don't use the word `follow` in HTML class names

Ad blockers block such elements by mistake.

### Commit messages

Use the form `type(scope): summary`, where `type` is one of `fix`, `refactor`, `feat`, `enhance`, `perf` and `chore`. Pull request titles use the same form.
