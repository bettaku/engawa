---
title: Options for db.extra
description: What you can put in db.extra, and where those values end up
lastUpdated: 2026-09-20
sidebar:
  order: 4
---

This page lists the options you can write under `db.extra` in `default.yml`.

## What db.extra is

`db.extra` is where you fine-tune the connection to PostgreSQL. engawa does not interpret what you write there; it hands the whole thing to the database driver as-is.

The value travels like this:

```
db.extra → TypeORM's extra → new pg.Pool(...)
```

So what you can write in `db.extra` are the pool and client options of [node-postgres](https://node-postgres.com/). TypeORM's own data source options (`poolSize`, `synchronize`, and so on) are ignored here.

To use it, add `extra` under `db` and list the keys:

```yaml
db:
  host: localhost
  port: 5432
  db: engawa
  user: engawa
  pass: example

  extra:
    statement_timeout: 30000
```

The type declaration says it is a map of strings, but the values are passed along exactly as YAML parsed them, so numbers, booleans and maps all work. In fact, writing a numeric option as a string may not behave the way you expect.

Restart the process after changing a value. Connections that are already open are not affected.

## Changing the query timeout

engawa sets `statement_timeout` to 10 seconds by default. Any single query that runs longer than that is cancelled by PostgreSQL.

A value in `db.extra` takes precedence over that default, so you can simply override it. Raise it if heavy API calls or chart aggregation are hitting the timeout.

```yaml
db:
  extra:
    statement_timeout: 30000
```

Two related options are `lock_timeout`, which caps how long a query waits for a lock, and `idle_in_transaction_session_timeout`, which closes connections that sit idle inside an open transaction. Both take milliseconds and apply to the whole session.

You can check the effective value with SQL:

```sql
SHOW statement_timeout;
```

:::caution
The connection used for migrations does not get the 10 second default — but it does get whatever you write in `db.extra`. A short value there can cancel a long-running migration. Remove or raise the value before migrating.
:::

:::note
Writing the number `0` does not disable the timeout. The driver skips any option whose value is falsy, so `statement_timeout: 0` means "use the server's setting". To disable it explicitly, write it as a string: `statement_timeout: '0'`.
:::

## Tuning connections and the pool

engawa does not set a pool size, so node-postgres' default of 10 connections per process applies. With clustering enabled that number is multiplied by the number of workers, so check that the total still fits within `max_connections` on the PostgreSQL side. Set `max` if you need fewer connections.

`keepAlive` helps when a NAT or load balancer silently drops idle connections. If you go through a connection pooler such as PgBouncer, `maxUses` and `maxLifetimeSeconds` let you recycle connections periodically.

| Key | Default | Description |
| --- | --- | --- |
| `max` | `10` | Maximum number of connections per process |
| `min` | `0` | Number of connections kept even when idle. Connections are not opened up front |
| `idleTimeoutMillis` | `10000` | How long an idle connection is kept, in milliseconds. `0` keeps it open |
| `connectionTimeoutMillis` | unlimited | How long to wait for a connection from the pool, in milliseconds |
| `maxUses` | unlimited | How many times a connection is reused before it is discarded |
| `maxLifetimeSeconds` | `0` (disabled) | Lifetime of a connection in seconds, after which it is discarded |
| `allowExitOnIdle` | `false` | Lets the process exit while only idle connections remain. Leave this alone for a long-running server |
| `keepAlive` | `false` | Enables TCP keepalive |
| `keepAliveInitialDelayMillis` | `0` | Delay before keepalive starts, in milliseconds |

Options that take a function or a class — `log`, `verify`, `onConnect`, `Client`, `types` — cannot be used, because YAML cannot express those values.

## Connecting over TLS

Set `ssl: true` to enable TLS.

```yaml
db:
  extra:
    ssl: true
```

If you write a map instead, its contents are passed straight to Node.js' `tls.connect()`. When verifying a certificate, `ca` must contain the PEM itself, not a path to a file. Use a YAML block scalar:

```yaml
db:
  extra:
    ssl:
      rejectUnauthorized: true
      ca: |
        -----BEGIN CERTIFICATE-----
        ...
        -----END CERTIFICATE-----
```

Managed database providers sometimes tell you to set `rejectUnauthorized: false`. That disables certificate verification and leaves you open to a man-in-the-middle attack, so supply `ca` instead where you can.

## Other options

These are rarely needed, but they are available:

| Key | Description |
| --- | --- |
| `options` | The libpq `options` string, for passing arbitrary server parameters (e.g. `-c timezone=UTC`) |
| `application_name` | The name shown in `pg_stat_activity.application_name`, useful for telling instances apart when several share a database |
| `fallback_application_name` | The name used when `application_name` is absent |
| `query_timeout` | How long to wait for a response, in milliseconds. This only gives up on the client side; the query keeps running on the server. Prefer `statement_timeout` |
| `client_encoding` | Client-side encoding. engawa assumes UTF-8, so leave it alone |
| `binary` | Binary transfer mode. Some types are unsupported, so leave it alone |
| `replication` | For replication connections. Do not set this from the application |

## Things to watch out for

### Options that override the connection target

TypeORM assembles `host`, `user`, `password`, `database`, `port`, `ssl`, `application_name`, `max`, `connectionTimeoutMillis` and others first, and merges `db.extra` on top. Because `db.extra` comes last, writing `host` or `user` there overrides `db.host` and `db.user`.

That leads to connecting somewhere you did not intend, so keep connection details directly under `db`, not in `db.extra`.

### Replicas get the same settings

When you use replicas with `dbReplications: true` and `dbSlaves`, the contents of `db.extra` are applied identically to the master and to every replica. There is no way to give a replica its own values.

## Example

```yaml
db:
  host: localhost
  port: 5432
  db: engawa
  user: engawa
  pass: example

  extra:
    # Raise the query timeout to 30 seconds for heavy aggregation
    statement_timeout: 30000
    # Cut off transactions left idle for a minute
    idle_in_transaction_session_timeout: 60000
    # Use fewer connections because max_connections is tight
    max: 8
    # For environments where idle connections are dropped in transit
    keepAlive: true
    keepAliveInitialDelayMillis: 10000
```
