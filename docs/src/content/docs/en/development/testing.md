---
title: Testing
description: Running the frontend, SDK and backend tests, and the federation E2E tests
lastUpdated: 2026-10-24
sidebar:
  order: 3
---

Before opening a pull request, make sure `pnpm test` and `pnpm lint` pass. This page explains how to run each kind of test on its own.

## Frontend and SDK

These run without a database or other services.

```bash
pnpm --filter frontend test
pnpm --filter cherrypick-js test
```

## Backend

There are three kinds of backend tests.

| Kind | Location |
|---|---|
| Unit tests | `packages/backend/test/unit` |
| Single-server E2E tests | `packages/backend/test/e2e` |
| Multi-server (federation) E2E tests | `packages/backend/test-federation` |

### Unit tests and single-server E2E tests

Copy the test configuration file.

```bash
cp .github/cherrypick/test.yml .config/
```

Start PostgreSQL and Redis for testing.

```bash
docker compose -f packages/backend/test/compose.yml up
```

Alternatively, prepare an empty database whose data can be erased and edit `.config/test.yml`.

Run the tests.

```bash
pnpm --filter backend test      # unit tests
pnpm --filter backend test:e2e  # single-server E2E tests
```

To run a specific test, pass a path relative to `packages/backend`.

```bash
pnpm --filter backend test test/unit/activitypub.ts
pnpm --filter backend test:e2e test/e2e/nodeinfo.ts
```

You can also filter by test name with `-t`. To re-run on file changes, use `pnpm --filter backend vitest-watch`.

### Multi-server (federation) E2E tests

See [`packages/backend/test-federation/README.md`](https://github.com/bettaku/engawa/blob/develop/packages/backend/test-federation/README.md).

## Frontend E2E tests

These use [Playwright](https://playwright.dev/) to start a real server and drive it from a browser. Like the backend tests, they need the test database and Redis (`.config/test.yml`).

```bash
pnpm build
pnpm --filter frontend exec playwright install chromium
pnpm start-server-and-test start:test http://localhost:61812 "pnpm --filter frontend test:e2e"
```

`start:test` starts the server with the settings in `.config/test.yml`. If a server is already running, you can point to it with the environment variable `CHERRYPICK_URL` and run only `pnpm --filter frontend test:e2e`.

## CI

Tests run automatically on GitHub Actions. The configuration is in [`.github/workflows`](https://github.com/bettaku/engawa/tree/develop/.github/workflows).
