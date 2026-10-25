---
title: Installing with Docker
description: Setting up engawa with Docker Compose and the published container image
lastUpdated: 2026-10-25
sidebar:
  order: 4
---

This page sets up engawa with Docker Compose. The engawa container image is published on GitHub Container Registry (`ghcr.io/bettaku/engawa`), so you don't need to build the source on your server. The image supports `linux/amd64` and `linux/arm64`.

To set up without Docker, see [Installing with systemd (Ubuntu / Debian)](/engawa/en/install/systemd-ubuntu/) or [Installing with systemd (RHEL family)](/engawa/en/install/systemd-rhel/).

:::note[What you end up with]
- Three containers managed by Docker Compose: engawa, PostgreSQL and Valkey
- A working directory `~/engawa` holding the configuration and the data (uploaded files, the database and Valkey)
- HTTPS served by nginx (or Caddy) on the server
:::

## Before you start

### What you need

| Item | Guideline |
|---|---|
| Server | 2 GB of memory or more is recommended. Nothing is built on the server, so it needs less than the systemd setup |
| Domain | e.g. `example.com`. Set up an A record (AAAA for IPv6) pointing to the server beforehand |
| Mail server | Optional, but needed if you want to send sign-up confirmation emails |
| Object storage | Optional. You can configure it later in the control panel |

:::caution[The domain cannot be changed later]
Once the server has started and begun talking to other servers, the domain set in `url` cannot be changed. You cannot start on a test domain and move to the production one later, so set the production domain from the start.
:::

### Overview

1. Install Docker
2. Create the working directory
3. Choose the image version
4. Write `compose.yml`
5. Write the configuration files
6. Start it
7. Put a reverse proxy (nginx) in front and serve HTTPS

Run the commands below as a regular user who can use `sudo`.

## 1. Install Docker

Install Docker Engine and Docker Compose (v2). The steps differ by distribution, so follow Docker's official documentation.

- [Install Docker Engine](https://docs.docker.com/engine/install/)

Check that it is installed.

```bash
docker --version
docker compose version
```

You are good if `docker compose version` shows a version starting with `Docker Compose version v2.`.

:::note[Using docker without sudo]
The commands below also work as `sudo docker ...`. If you don't want to type `sudo` every time, run `sudo usermod -aG docker $USER` and log in again. Note that users in the `docker` group effectively have root privileges.
:::

## 2. Create the working directory

Create a directory for the configuration and the data.

```bash
mkdir -p ~/engawa/.config ~/engawa/files ~/engawa/db ~/engawa/redis
cd ~/engawa
```

The engawa container runs as UID `991`. Change the owner of `files` so that uploaded files can be saved.

```bash
sudo chown 991:991 files
```

## 3. Choose the image version

The image has the following tags.

| Tag | Points to |
|---|---|
| A full version such as `1.0.0` | Pinned to that version. **Recommended for production** |
| `1.0`, `1` | The latest stable release in that series. Moves automatically when a new version is released |
| `latest` | The latest stable release |
| `develop` | The latest development build. Do not use it in production |

You can see the published versions in the [GitHub releases](https://github.com/bettaku/engawa/releases). Pinning a full version means the version never changes unexpectedly, and you can read the release notes before updating.

:::tip[Verifying where the image came from]
Release images carry an attestation showing they were built by GitHub Actions. With the [GitHub CLI](https://cli.github.com/) installed, you can check it with the following command.

```bash
gh attestation verify oci://ghcr.io/bettaku/engawa:1.0.0 -R bettaku/engawa
```

If it shows `Verification succeeded!`, the image was built by the CI of the bettaku/engawa repository.
:::

## 4. Write compose.yml

Create `~/engawa/compose.yml`.

```bash
nano compose.yml
```

Paste the following, and change the tag in `image:` to the version you chose in step 3.

```yaml
services:
  web:
    image: ghcr.io/bettaku/engawa:1.0.0
    restart: always
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      # Only reachable from the server itself (the reverse proxy)
      - "127.0.0.1:3000:3000"
    networks:
      - internal_network
      - external_network
    volumes:
      - ./files:/cherrypick/files
      - ./.config:/cherrypick/.config:ro

  redis:
    image: valkey/valkey:9.0-alpine
    restart: always
    networks:
      - internal_network
    volumes:
      - ./redis:/data
    healthcheck:
      test: "valkey-cli ping"
      interval: 5s
      retries: 20

  db:
    image: postgres:18-alpine
    restart: always
    networks:
      - internal_network
    env_file:
      - .config/docker.env
    volumes:
      - ./db:/var/lib/postgresql
    healthcheck:
      test: "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"
      interval: 5s
      retries: 20

networks:
  internal_network:
    internal: true
  external_network:
```

`internal_network` cannot reach the outside, and PostgreSQL and Valkey are connected only to it. engawa is also connected to `external_network` so it can talk to other servers.

Valkey is a Redis-compatible database. In engawa's config file you point the `redis:` section at it as you would for Redis, so the service is also named `redis`.

If you change `ports` to `"3000:3000"`, the port becomes reachable directly from outside, bypassing the reverse proxy. Keep the `127.0.0.1:` prefix.

## 5. Write the configuration files

### Choose the database password

Write the settings the PostgreSQL container uses on its first start to `.config/docker.env`. Use a random string for the password.

```bash
openssl rand -hex 24
```

Use the printed string as the password.

```bash
nano .config/docker.env
```

```ini
POSTGRES_USER=engawa
POSTGRES_PASSWORD=the-password-you-generated
POSTGRES_DB=engawa
```

This file contains the password, so make it readable only by you.

```bash
chmod 600 .config/docker.env
```

:::caution[POSTGRES_* is used only the first time]
`POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are used only when the container starts for the first time with an empty `db` directory. Editing this file afterwards does not change the database password.
:::

### Write the engawa configuration file

```bash
nano .config/default.yml
```

At a minimum, write the following and adjust it to your environment.

```yaml
# The public URL. The trailing slash is required
url: https://example.com/

# The port engawa listens on inside the container. Match the ports in compose.yml
port: 3000

db:
  host: db        # the service name in compose.yml
  port: 5432
  db: engawa      # POSTGRES_DB in docker.env
  user: engawa    # POSTGRES_USER in docker.env
  pass: the-password-you-generated  # POSTGRES_PASSWORD in docker.env

redis:
  host: redis     # the service name in compose.yml
  port: 6379

# Trust the reverse proxy on the server.
# Connections from the proxy reach the container from the Docker network gateway (172.x.x.x),
# so specify that range. Without this, every client IP is recorded as the gateway's IP
trustProxy:
  - '172.16.0.0/12'

# The password you enter when creating the admin account.
# It prevents someone else from creating the admin account between startup and your setup
setupPassword: another-random-string

# Do not change this after the server has been created
id: 'aidx'
```

Use another string generated with `openssl rand -hex 24` for `setupPassword`.

:::note[Checking the Docker network range]
By default Docker assigns networks from `172.17.0.0/16` to `172.31.0.0/16`, so `172.16.0.0/12` is usually enough. If your Docker configuration uses other ranges, check the actual range with the following command after starting, and put it in `trustProxy`.

```bash
docker network inspect engawa_external_network --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```
:::

`default.yml` contains the database password, but the user inside the container (UID `991`) must be able to read it. If you don't want other users to see it, run `chmod 640 .config/default.yml` and `sudo chgrp 991 .config/default.yml` so that only you and the container can read it.

All other options are documented with comments in the repository's [`.config/example.yml`](https://github.com/bettaku/engawa/blob/develop/.config/example.yml); it is worth reading through once. For how the configuration file relates to environment variables, see [Backend environment variables](/engawa/en/install/environment-variables/). For fine-tuning the database connection, see [Options for db.extra](/engawa/en/install/db-extra/).

## 6. Start it

Pull the images and start them.

```bash
docker compose pull
docker compose up -d
```

Every time the engawa container starts, it runs the database migrations automatically before starting the server. The first start takes from tens of seconds to a few minutes. Watch the log and wait.

```bash
docker compose logs -f web
```

It has started when a line like the following appears. Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop following the log (the container keeps running).

```
DONE *	[core boot]	Now listening on port 3000 on https://example.com
```

Check that it responds from the server.

```bash
curl -fsS http://127.0.0.1:3000/healthz && echo OK
```

If it prints `OK`, engawa is running.

## 7. Put a reverse proxy in front and serve HTTPS

Put a reverse proxy in front of engawa and serve it over HTTPS. From here on, the steps are the same as the systemd setup. engawa listens on `127.0.0.1:3000`, so the sample configuration works as is.

The sample configuration files are in `contrib/` in the repository. Since you haven't fetched the source, download the ones for your version (replace `1.0.0` with the version you chose in step 3).

```bash
# For nginx
curl -fsSLO https://raw.githubusercontent.com/bettaku/engawa/1.0.0/contrib/nginx.sample.conf
# For Caddy
curl -fsSLO https://raw.githubusercontent.com/bettaku/engawa/1.0.0/contrib/Caddyfile
```

Then follow the reverse proxy part of the systemd guide. Read `/home/engawa/engawa/contrib/...` in those steps as the files you just downloaded to `~/engawa/...`.

- nginx: [11. Put a reverse proxy in front and serve HTTPS](/engawa/en/install/systemd-ubuntu/#11-put-a-reverse-proxy-in-front-and-serve-https)
- Caddy: [Alternative to step 11: serving HTTPS with Caddy](/engawa/en/install/systemd-ubuntu/#alternative-to-step-11-serving-https-with-caddy)

Open `https://example.com` in a browser. You are done when the initial setup screen appears. Enter the `setupPassword` from `default.yml` and create the admin account. The first account you create becomes the administrator.

## Updating

When a new version is released, read the release notes, then change the tag in `image:` in `compose.yml` to the new version.

```bash
cd ~/engawa
nano compose.yml
```

Pull the image and recreate the container. Migrations run automatically on startup.

```bash
docker compose pull
docker compose up -d
```

:::caution
Back up the database before updating. Migrations are hard to undo.

```bash
(
  umask 077
  d=$(mktemp -d ~/engawa-backup-$(date +%Y%m%d-%H%M%S)-XXXXXX) || exit 1
  if docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$d/engawa.sql.partial" \
     && mv "$d/engawa.sql.partial" "$d/engawa.sql"; then
    echo "$d/engawa.sql"
  else
    rm -rf -- "$d"; exit 1
  fi
)
```

Run it in `~/engawa`. The backup contains the entire database. The command creates a directory readable only by you each time it runs, saves the dump there, and prints its path on success. If no path is printed, it failed, and the working directory is removed automatically.
:::

If the release notes describe extra steps, follow them first.

### Migrating from the old setup (PostgreSQL 15 and Redis 7)

Setups based on the `compose_example.yml` from before engawa 1.0.0 use PostgreSQL 15 and Redis 7. The `compose.yml` in this guide uses PostgreSQL 18 and Valkey 9.0, and you cannot migrate just by changing the images.

- PostgreSQL cannot use an old data directory across a major version. Back up the database and restore it into a freshly started PostgreSQL 18
- The PostgreSQL 18 image stores its data in a different place, so the mount point also changes from `/var/lib/postgresql/data` to `/var/lib/postgresql`. Starting it on the old `db` directory silently creates an empty database instead of failing
- Valkey 9.0 cannot read data saved by Redis 7 as is and fails to start. Convert it once before starting

Run the following in `~/engawa`.

1. Stop engawa.

   ```bash
   docker compose stop web
   ```

2. Back up the database with the command in "Updating" above. Note the path it prints.

3. Stop all containers and move the old database aside. Redis saves its data to the `redis` directory when it stops.

   ```bash
   docker compose down
   mv db db-pg15
   ```

4. Replace `redis` and `db` in `compose.yml` with the following (the same as in "4. Write compose.yml").

   ```yaml
     redis:
       image: valkey/valkey:9.0-alpine
       restart: always
       networks:
         - internal_network
       volumes:
         - ./redis:/data
       healthcheck:
         test: "valkey-cli ping"
         interval: 5s
         retries: 20

     db:
       image: postgres:18-alpine
       restart: always
       networks:
         - internal_network
       env_file:
         - .config/docker.env
       volumes:
         - ./db:/var/lib/postgresql
       healthcheck:
         test: "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"
         interval: 5s
         retries: 20
   ```

5. Convert the Redis data into a format Valkey can read.

   ```bash
   docker run --rm -v "$PWD/redis:/data" valkey/valkey:9.0-alpine sh -c 'valkey-server --rdb-version-check relaxed --daemonize yes && until valkey-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done && valkey-cli save && valkey-cli shutdown nosave'
   ```

   If it prints `OK`, the conversion succeeded. Besides caches, Redis holds jobs such as pending deliveries, so converting it is recommended over deleting it.

6. Start PostgreSQL 18 and restore the backup. Replace `~/engawa-backup-XXXX/engawa.sql` with the path you noted in step 2.

   ```bash
   docker compose up -d --wait db
   docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ~/engawa-backup-XXXX/engawa.sql
   ```

   The new database and user are created from `POSTGRES_*` in `docker.env`. If you changed `docker.env` after the first start, make it match the `db:` values in `default.yml` first.

7. Start engawa.

   ```bash
   docker compose up -d
   ```

Once everything works, you can delete the `db-pg15` directory.

### Building the image from source

Instead of the published image, you can build it yourself. The build uses a lot of memory, so 4 GB or more is recommended.

```bash
git clone --recursive https://github.com/bettaku/engawa.git ~/engawa-src
```

Replace the `image:` line in `compose.yml` with `build:` as follows.

```yaml
  web:
    build: ../engawa-src
```

```bash
docker compose build
docker compose up -d
```

To update, run `git pull` and `git submodule update --init` in `~/engawa-src`, then build again.

## When something goes wrong

| Symptom | What to check |
|---|---|
| The `web` container exits right away or keeps restarting | Check the error with `docker compose logs web`. Syntax errors in the configuration file are common |
| Files cannot be saved with `EACCES: permission denied` | Check that `files` is owned by `991:991` (step 2) |
| The configuration file cannot be read | Check that UID `991` can read `.config/default.yml` (step 5) |
| Cannot connect to the database | Check that `db.user`, `db.pass` and `db.db` in `default.yml` match `docker.env`. Changing `docker.env` later does not affect an existing database |
| 502 Bad Gateway | Check that `web` is `healthy` in `docker compose ps`, and that the port in `ports` in `compose.yml` matches nginx's `proxy_pass` |
| Every client IP is the same | `trustProxy` in `default.yml` is missing or does not match the Docker network range (step 5) |
| The image cannot be pulled | Check that the tag in `image:` exists on the [package page](https://github.com/bettaku/engawa/pkgs/container/engawa) |
| The timeline doesn't update automatically | Check that the nginx WebSocket settings (the `Upgrade` and `Connection` headers) are present |

After editing the configuration file, restart with `docker compose restart web`. A running process does not pick up the changes.
