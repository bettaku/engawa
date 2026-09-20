---
title: Backend environment variables
description: What the backend reads from the environment, the defaults, and how it relates to the config file
lastUpdated: 2026-09-20
---

This page lists the environment variables the backend reads directly. Variables interpreted by dependencies or by Node.js itself, and those used only by the test runner or the frontend build, are out of scope.

The names still carry the `CHERRYPICK`, `CP` and `MISSKEY` prefixes inherited from upstream.

## How to set them

Pass the variables to the backend process. Here is an example of starting a built instance from the repository root:

```sh
NODE_ENV=production CP_WITH_LOG_TIME=1 pnpm start
```

The same applies under systemd or in a container: set them as environment variables of the process you start. The backend does not load a `.env` file. Restart the process after changing a value.

You cannot configure everything through the environment. The YAML config file is always loaded, and the database host and port, Redis and so on still live there. See the [example config](https://github.com/bettaku/engawa/blob/develop/.config/example.yml) as well.

## Runtime and config file

| Variable | When unset | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Production mode is not enabled | `production` in production, `development` for development, `test` for tests |
| `CHERRYPICK_CONFIG_YML` | `.config/default.yml` (`.config/test.yml` when `NODE_ENV=test`) | Path of the YAML file to load |

`NODE_ENV` is compared case-sensitively. `Production` does not enable production mode.

### The config file path

A relative `CHERRYPICK_CONFIG_YML` is resolved against the repository's `.config` directory. Absolute paths work too.

- `CHERRYPICK_CONFIG_YML=production.yml` → `.config/production.yml`
- `CHERRYPICK_CONFIG_YML=.config/production.yml` → `.config/.config/production.yml`

The second one is an easy mistake to make. An empty string counts as unset. If you set a non-empty value, it takes precedence even when `NODE_ENV=test`.

This variable is also used by the migrations and by the asset build. Pass it to every command that should use the same config.

### What NODE_ENV changes

`pnpm start` does not set `NODE_ENV=production` for you. The repository's Dockerfile does, but when you start the process directly you have to set it yourself.

- **`production`**: Enables API rate limiting and the private-IP restriction on outgoing HTTP requests. Debug logs are suppressed and temporary files are cleaned up.
- **`development`**: Those restrictions are disabled, and file delivery gets development CORS headers.
- **`test`**: Changes the defaults of the config file and suppresses clustering and log output. The database is initialised with `synchronize: true` and `dropSchema: true`, and the database cache is disabled. TOTP verification and signup restrictions also have test-specific branches.
- **Unset or any other value**: Not equal to `production`, so the production restrictions stay off; the `development` and `test` specific behaviour does not apply either.

:::danger[Never use test mode against production data]
`NODE_ENV=test` enables a setting that drops the schema of the database it connects to, and it changes behaviour such as authentication. Always point it at an isolated test database. Setting `CHERRYPICK_CONFIG_YML` does not automatically switch to `test.yml`.
:::

## Falling back to the environment

A few settings can come from the environment instead of the YAML file. They are resolved in this order:

**YAML value → environment variable → default in the code**

To use the environment variable, omit the corresponding YAML key or set it to `null`. If the YAML has an empty string `''` or `0`, that value wins. Note that this is not a mechanism for expanding strings like `${DATABASE_PASSWORD}` inside the YAML.

| Variable | YAML key | When both are unset | Purpose |
| --- | --- | --- | --- |
| `CHERRYPICK_URL` | `url` | Becomes an empty string and fails URL parsing | The public URL of the server, e.g. `https://social.example.com` |
| `PORT` | `port` | `NaN` (there is no usable default port) | The port the backend listens on |
| `DATABASE_DB` | `db.db` | Empty string | PostgreSQL database name |
| `DATABASE_USER` | `db.user` | Empty string | PostgreSQL user name |
| `DATABASE_PASSWORD` | `db.pass` | Empty string | PostgreSQL password |

`PORT` is read with a base-10 `parseInt`, so give it an integer such as `3000`. When you use a UNIX socket, the YAML `socket` key is used instead.

For the database, the `db` object itself still has to exist in the YAML. `DATABASE_HOST`, `DATABASE_PORT` and `DATABASE_URL` are not interpreted by this config loader; set the target with `db.host` and `db.port` in the YAML. The fallback does not apply to `dbSlaves` either.

## CP_* flags for boot and logging

These flags switch the role of the process and the log output. All of them are off by default.

| Variable | What it does when enabled |
| --- | --- |
| `CP_ONLY_QUEUE` | Runs only the job queue, without the web server |
| `CP_ONLY_SERVER` | Runs only the web server, without the job queue processes |
| `CP_DISABLE_CLUSTERING` | Does not fork workers; everything runs in the main process |
| `CP_VERBOSE` | Emits the backend's `Logger.debug()` output even under `production` |
| `CP_WITH_LOG_TIME` | Adds timestamps to the backend logger's output |
| `CP_QUIET` | Suppresses logger output and the boot logo |
| `CP_NO_DAEMONS` | The value is stored but currently never read (see below) |

:::caution[0 and false also enable them]
These flags are considered enabled for **any non-empty string**. Not just `1` or `true`, but `0` and `false` as well. To disable one, unset the variable or set it to an empty string.
:::

Normally the main process runs the web server and the workers run the job queue. With `CP_DISABLE_CLUSTERING`, the main process runs both unless you also restrict its role. The number of workers under clustering comes from `clusterLimit` in the YAML.

Do not combine `CP_ONLY_SERVER` and `CP_ONLY_QUEUE`. With both enabled, only the web server starts, yet the "boot finished" log announces a queue-only process. What runs and what is printed disagree, so set only one of them.

`CP_NO_DAEMONS` is currently never read. Enabling it does not stop the daemons.

Under `NODE_ENV=test`, the equivalents of `CP_DISABLE_CLUSTERING`, `CP_QUIET` and `CP_NO_DAEMONS` are forced on, and emptying the matching variables does not turn them off.

## Migrations

| Variable | Enabling value | Purpose |
| --- | --- | --- |
| `CHERRYPICK_MIGRATION_CREATE_INDEX_CONCURRENTLY` | `1` | Uses `CREATE INDEX CONCURRENTLY` in the migration that supports it |

Pass this to the migration command, not when starting the server.

```sh
NODE_ENV=production CHERRYPICK_MIGRATION_CREATE_INDEX_CONCURRENTLY=1 pnpm migrate
```

Enabling it also changes TypeORM's migration transaction mode from `all` to `each`.

Only `1745378064470-composite-note-index` supports it, and that migration runs outside a transaction when it is enabled. Index creation in other migrations is not turned concurrent.

## Frontend dev servers

| Variable | When unset | Purpose |
| --- | --- | --- |
| `VITE_PORT` | `5173` | Port of the Vite dev server that `/vite` proxies to |
| `EMBED_VITE_PORT` | `5174` | Port of the embed Vite dev server that `/embed_vite` proxies to |

Whether the backend proxies at all is not decided by `NODE_ENV`. It depends on whether the built manifest of the embed frontend exists. With the manifest present the backend serves static files; without it, it proxies to these ports. The host and scheme of the proxy target come from the public URL.

These variables only say where to connect. The backend does not start a Vite server itself.

## Testing and local verification

You would not set these in normal production use. Unlike the `CP_*` flags, each one has its own enabling value.

| Variable | Enabling value | When unset | Purpose |
| --- | --- | --- | --- |
| `CHERRYPICK_WEBFINGER_USE_HTTP` | `true` (case-insensitive) | HTTPS is used | Makes WebFinger lookups built from `user@host` use HTTP |
| `FORCE_FOLLOW_REMOTE_USER_FOR_TESTING` | `true` (lowercase only) | Normal follow handling | Removes the condition that holds a follow request back for being local-to-remote |
| `MISSKEY_TEST_CHECK_DUPLICATED_TOTP` | `1` | Under `test`, verification is skipped and succeeds | Verifies TOTP values and reuse even under `NODE_ENV=test` |
| `CHERRYPICK_TEST_CHECK_IP_RANGE` | `1` | Under `test`, the check is skipped | Runs the IP range check when fetching OAuth client metadata even under `NODE_ENV=test` |

A few details:

- `CHERRYPICK_WEBFINGER_USE_HTTP`: URL-form lookups keep their original protocol. This is not limited to any `NODE_ENV`.
- `FORCE_FOLLOW_REMOTE_USER_FOR_TESTING`: Other reasons to hold a request, such as a locked account, still apply. This is not limited to any `NODE_ENV`.
- `MISSKEY_TEST_CHECK_DUPLICATED_TOTP` and `CHERRYPICK_TEST_CHECK_IP_RANGE`: Both only matter under `NODE_ENV=test`. Outside tests, the verification and the check always run regardless of these variables. The latter does not make HTTP request handling production-like in general.

