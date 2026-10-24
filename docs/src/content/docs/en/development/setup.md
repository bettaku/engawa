---
title: Setting up a development environment
description: The software needed to develop engawa, starting the development server, and common commands
lastUpdated: 2026-10-24
sidebar:
  order: 2
---

This page walks through setting up a development environment for engawa and starting the development server. To run engawa as a server, see [Install](/engawa/en/install/).

## Requirements

| Software | Notes |
|---|---|
| Node.js | The version is in `.node-version` in the repository (24.x) |
| pnpm | With `corepack enable`, the version in `packageManager` of `package.json` is used |
| PostgreSQL | 15 or later |
| Redis | 7.x |
| FFmpeg | Used for video thumbnails and similar |
| Git | The repository has a submodule (`fluent-emojis`), so clone with `--recursive` |

:::caution[On Windows]
Clone inside WSL. Cloning with Git for Windows breaks files because of the difference in line endings.
:::

## Get the source

```bash
git clone --recursive https://github.com/bettaku/engawa.git
cd engawa
pnpm install --frozen-lockfile
```

If you have already cloned without the submodule, run `git submodule update --init`.

## Prepare PostgreSQL and Redis

Use one of the following.

### With Docker Compose

A configuration that starts only PostgreSQL and Redis in containers is included.

```bash
docker compose -f compose.local-db.yml up -d
```

The database user and password come from `.config/docker.env` (copy it from `.config/docker_example.env`).

### Installed on your system

You can also install PostgreSQL and Redis on your system with a package manager.

### With a Dev Container

Open the repository directory with the Dev Containers extension of VS Code. The following commands run automatically inside the container, including the database setup.

```bash
git submodule update --init
pnpm install --frozen-lockfile
cp .devcontainer/devcontainer.yml .config/default.yml
pnpm build
pnpm migrate
```

## Write the configuration file

```bash
cp .config/example.yml .config/default.yml
```

Adjust `url`, `db` and `redis` in `.config/default.yml` to your environment. For development, something like `url: http://localhost:3000/` is enough.

You can change the path of the configuration file with the environment variable `CHERRYPICK_CONFIG_YML` (e.g. `2nd.yml`). For other environment variables, see [Backend environment variables](/engawa/en/install/environment-variables/).

## Build and initialize the database

```bash
pnpm build
pnpm migrate
```

## Start the development server

```bash
pnpm dev
```

- The backend sources are watched; changes are built automatically and the server restarts.
- The Service Worker is watched by esbuild.
- Vite HMR is available for the frontend. The behavior may differ from a production build.
- Vite runs behind the backend (the backend proxies `/vite` and `/embed_vite` to Vite, except for the WebSocket used by HMR).
- Open `http://localhost:3000` (`3000` is `port` in `.config/default.yml`).

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | Starts all packages in watch mode |
| `pnpm build` | Production build |
| `pnpm migrate` | Runs the database migrations |
| `pnpm lint` | Type check and ESLint |
| `pnpm test` | Tests for all packages (see [Testing](/engawa/en/development/testing/)) |
| `pnpm build-cherrypick-js-with-types` | Regenerates the SDK (cherrypick-js) types from the backend API |
| `pnpm --filter frontend storybook-dev` | Starts Storybook (see [Frontend notes](/engawa/en/development/frontend/#storybook)) |

## Common pitfalls

### `pnpm-lock.yaml` has conflicts

Run `pnpm` with no arguments to regenerate it.

### The frontend types are stale after an API change

After changing the backend API (endpoints or schemas), regenerate the SDK types with `pnpm build-cherrypick-js-with-types`. CI also checks that the generated types are up to date.

### Type errors after changing a locale

After editing locale files, regenerate the type definitions (`locales/index.d.ts`) with `pnpm build-assets`. This happens automatically while `pnpm dev` is running.
