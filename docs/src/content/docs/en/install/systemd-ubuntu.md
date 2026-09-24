---
title: Installing with systemd (Ubuntu / Debian)
description: Setting up engawa as a systemd service on Ubuntu and Debian-based servers
lastUpdated: 2026-09-20
sidebar:
  order: 2
---

This page walks through building engawa from scratch on Ubuntu 24.04 LTS. Debian 12 uses the same package names, so the steps apply there almost unchanged.

If you want to use Docker, follow the Docker guide instead. For RHEL-family systems (AlmaLinux, Rocky Linux, RHEL), see [Installing with systemd (RHEL family)](/engawa/en/install/systemd-rhel/).

:::note[What you end up with]
- engawa itself, in `/home/engawa/engawa`
- PostgreSQL and Redis on the same server
- A systemd service named `engawa.service`
- nginx (or Caddy) serving it over HTTPS
:::

## Before you start

### What you need

| Item | Guideline |
|---|---|
| Server | 4GB of RAM or more recommended. The build step is memory-hungry |
| Domain | e.g. `example.com`. Point an A record (or AAAA for IPv6) at the server first |
| Mail server | Not required, but you need one to send registration confirmation mails |
| Object storage | Not required. You can configure it later from the admin panel |

:::caution[The domain cannot be changed later]
Once the server has started and talked to other servers, the domain in `url` is fixed. You cannot start on a test domain and move to the real one later, so set the production domain from the beginning.
:::

### The plan

1. Install the required software (Node.js, PostgreSQL, Redis)
2. Create a dedicated user and a database
3. Fetch the source and build it
4. Write the configuration file
5. Register it as a systemd service
6. Put a reverse proxy (nginx) in front and serve HTTPS

Run the commands below as a regular user with `sudo` access.

## 1. Install the basics

Bring the system up to date and install the build tools.

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y build-essential python3 curl git ca-certificates gnupg ffmpeg
```

`build-essential` and `python3` are needed to compile some of engawa's dependencies. Without them, `pnpm install` fails later on.

`ffmpeg` is needed to handle video files. engawa shells out to the `ffmpeg` and `ffprobe` commands directly, so they have to be present on the system. Confirm they are:

```bash
ffprobe -version
```

:::note[What happens without ffmpeg]
engawa still starts, but anything involving video degrades:

- Video thumbnails are not generated
- engawa cannot tell whether an audio file (m4a, webm and so on) contains a video track, and assumes it does

If you really cannot install it on the server, you can point `videoThumbnailGenerator` in the configuration file at an external thumbnail service instead.
:::

## 2. Install Node.js

engawa needs Node.js 24 or newer. The version in Ubuntu's own repository is too old, so add the NodeSource repository.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

Check it:

```bash
node -v
```

A version starting with `v24.` means you are good.

Next, enable pnpm. engawa uses pnpm, not npm or yarn.

```bash
sudo corepack enable
```

```bash
pnpm -v
```

:::note
If you get `corepack: command not found`, install pnpm directly with `sudo npm install -g pnpm@11`.
:::

## 3. Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

PostgreSQL 15 or newer is required; Ubuntu 24.04 gives you 16. Check with:

```bash
psql --version
```

## 4. Install Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

Verify it is running:

```bash
redis-cli ping
```

It should answer `PONG`.

## 5. Create a user for engawa

Running engawa as root is best avoided, so create a dedicated user.

```bash
sudo adduser --disabled-password --disabled-login engawa
```

From here on, anything touching engawa itself is done as this user. Switch to it with:

```bash
sudo -iu engawa
```

Type `exit` to return to your own user. **Each step below says which user to run it as.**

## 6. Create the database

Go back to your own user (the one with `sudo`) and run:

```bash
sudo -u postgres psql
```

At the `postgres=#` prompt, run these three lines. Replace `example-pass` with a password of your own and keep it — you will put it in the configuration file.

```sql
CREATE ROLE engawa WITH LOGIN PASSWORD 'example-pass';
CREATE DATABASE engawa OWNER engawa;
\q
```

`\q` leaves the prompt.

## 7. Fetch the source and build

From here on, work as the **engawa user**.

```bash
sudo -iu engawa
```

Clone the repository:

```bash
git clone --branch develop https://github.com/bettaku/engawa.git engawa
cd engawa
```

:::tip[Saving disk space]
Adding `--depth 1` skips the history and cuts both download size and disk usage. It does make switching to another version more awkward later, so if in doubt, leave it out.
:::

Install the dependencies. This takes a few minutes.

```bash
pnpm install --frozen-lockfile
```

## 8. Write the configuration file

Copy the sample and edit it, still as the engawa user.

```bash
cp .config/example.yml .config/default.yml
nano .config/default.yml
```

At a minimum, adjust these:

```yaml
# The public URL. The trailing slash is required
url: https://example.com/

# The port engawa listens on. nginx forwards to it
port: 3000

db:
  host: localhost
  port: 5432
  db: engawa
  user: engawa
  pass: example-pass  # the password from step 6

redis:
  host: localhost
  port: 6379

# Trust the reverse proxy you set up in step 11.
# Without this, every request is recorded as coming from the proxy's IP
trustProxy:
  - '127.0.0.1/32'
  - '::1/128'

# Do not change this after the server has been created
id: 'aidx'
```

In `nano`, save with <kbd>Ctrl</kbd>+<kbd>O</kbd> → <kbd>Enter</kbd> and quit with <kbd>Ctrl</kbd>+<kbd>X</kbd>.

Every other option is documented with comments in the sample file, so it is worth reading through once. For how the file relates to environment variables, see [Backend environment variables](/engawa/en/install/environment-variables/); for fine-tuning the database connection, see [Options for db.extra](/engawa/en/install/db-extra/).

## 9. Build and initialize the database

Still as the engawa user, from the repository root:

```bash
NODE_ENV=production pnpm build
```

:::caution[If the build is killed part way through]
On a server with around 2GB of RAM, the frontend build can be killed for running out of memory. Add swap if that happens:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

To keep it after a reboot, add `/swapfile none swap sw 0 0` to `/etc/fstab`.
:::

Once the build finishes, create the tables:

```bash
pnpm migrate
```

Then start it by hand once to check everything works:

```bash
pnpm start
```

A line like `Now listening on port 3000` means it worked. Stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd> and move on.

If it errors out, re-check the database password and the Redis settings.

## 10. Register it as a systemd service

Type `exit` to leave the engawa user and return to your own.

Create the service file:

```bash
sudo nano /etc/systemd/system/engawa.service
```

Paste this in and save:

```ini
[Unit]
Description=engawa daemon
After=network-online.target postgresql.service redis-server.service

[Service]
Type=simple
User=engawa
Group=engawa
UMask=0027
WorkingDirectory=/home/engawa/engawa
ExecStart=/usr/bin/node /home/engawa/engawa/packages/backend/built/boot/entry.js
Environment="NODE_ENV=production"
TimeoutSec=60
StandardOutput=journal
StandardError=journal
SyslogIdentifier=engawa
Restart=always

[Install]
WantedBy=multi-user.target
```

:::note[About ExecStart]
Node.js is invoked directly rather than through `pnpm start` because systemd's minimal `PATH` often cannot find pnpm. `pnpm start` only checks the database connection and then runs the same file, so behaviour is the same.
:::

Load and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now engawa
```

Check the status:

```bash
sudo systemctl status engawa
```

`active (running)` is what you want. To follow the logs:

```bash
sudo journalctl -u engawa -f
```

Leave with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

## 11. Put a reverse proxy in front and serve HTTPS

engawa is running on `localhost:3000`, which nothing outside the server can reach. Put nginx in front of it to handle HTTPS and certificates.

The repository ships production-ready proxy configuration in `contrib/`, and that is what this guide uses. It is worth reading [`contrib/README.md`](https://github.com/bettaku/engawa/blob/develop/contrib/README.md) once as well.

:::note[No Certbot here]
In this setup, nginx's own ACME module (`ngx_http_acme_module`) obtains and renews the certificate. There is no Certbot, no cron job and no challenge webroot to set up.

If you would rather use Caddy than nginx, skip this step and go to [Alternative to step 11: serving HTTPS with Caddy](#alternative-to-step-11-serving-https-with-caddy) instead. You only need one of the two.
:::

### Install nginx and the ACME module

The ACME module needs nginx 1.29.0 or newer, which Ubuntu's own repository does not carry. Add the official nginx repository.

```bash
sudo apt install -y curl gnupg2 ca-certificates lsb-release ubuntu-keyring
```

```bash
curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor | sudo tee /usr/share/keyrings/nginx-archive-keyring.gpg > /dev/null
```

```bash
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] http://nginx.org/packages/mainline/ubuntu $(lsb_release -cs) nginx" | sudo tee /etc/apt/sources.list.d/nginx.list
```

```bash
sudo apt update
sudo apt install -y nginx nginx-module-acme
```

:::note[On Debian]
Use `debian-archive-keyring` instead of `ubuntu-keyring`, and `debian` instead of `ubuntu` in the repository URL.
:::

Check the version:

```bash
nginx -v
```

`nginx/1.29.0` or newer is what you need.

### Load the ACME module

Open the main configuration file:

```bash
sudo nano /etc/nginx/nginx.conf
```

Near the top, **outside** the `http {` block, add this one line:

```nginx
load_module modules/ngx_http_acme_module.so;
```

:::caution
Some packages already load it from a file under `/etc/nginx/modules-enabled/`. In that case, do not add the line here — loading it twice fails to start with `module ... is already loaded`.
:::

### Add the site configuration

Copy `contrib/nginx.sample.conf` from the repository into nginx's `conf.d`:

```bash
sudo cp /home/engawa/engawa/contrib/nginx.sample.conf /etc/nginx/conf.d/engawa.conf
```

Replace the domain and the contact address with your own:

```bash
sudo sed -i 's/engawa\.example\.com/example.com/g; s/admin@example\.com/you@example.com/g' /etc/nginx/conf.d/engawa.conf
```

Open the file and confirm the substitution landed:

```bash
sudo nano /etc/nginx/conf.d/engawa.conf
```

While you are there, check that these match your environment:

| Setting | Default | What it is |
|---|---|---|
| `resolver` | `1.1.1.1 1.0.0.1` | The DNS servers the ACME module uses. Point it at your own resolver if you have one |
| `ssl_trusted_certificate` | `/etc/ssl/certs/ca-certificates.crt` | The CA bundle path on Ubuntu and Debian. Leave it as is |
| `client_max_body_size` | `256m` | The upload limit. Keep it in line with engawa's `maxFileSize` |

The official nginx package ships a default site that also listens on port 80. Remove it so it does not compete:

```bash
sudo rm -f /etc/nginx/conf.d/default.conf
```

### Create the ACME state directory

The certificate and the account key are stored here, and the nginx worker user has to be able to read and write it. With the official package that user is `nginx`.

```bash
sudo install -d -m 700 -o nginx -g nginx /var/lib/nginx/acme-engawa
```

:::caution
This directory holds private keys. Keep the `700` permissions, and carry its contents over if you move the server. Delete it and you have to get the certificate issued again.
:::

### Open the firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Port 80 is not just for the redirect to HTTPS — the HTTP-01 challenge uses it for the initial issuance and every renewal. Leave it open.

:::caution[Do not open port 3000]
engawa listens on `0.0.0.0`, so opening port 3000 would let people reach it directly, bypassing HTTPS. Keep it closed at the firewall.
:::

### Start it

Check the syntax, then start nginx:

```bash
sudo nginx -t
sudo systemctl enable --now nginx
```

Only start once you see `syntax is ok` and `test is successful`. If nginx is already running, use `sudo systemctl reload nginx`.

The first issuance takes a few tens of seconds, and HTTPS does not work until it completes. Watch the progress and any errors in the nginx log:

```bash
sudo tail -f /var/log/nginx/error.log
```

### Verify

```bash
curl -I http://example.com/
```

`HTTP/1.1 308 Permanent Redirect` means the redirect from HTTP works.

```bash
curl -I https://example.com/
```

`HTTP/2 200` means the certificate was issued and requests reach engawa.

Open `https://example.com` in a browser. If the initial setup screen appears, you are done — the first account you create becomes the administrator.

## Alternative to step 11: serving HTTPS with Caddy

This is the Caddy route instead of nginx. **If you completed step 11, skip this section.** Both want ports 80 and 443, so you cannot run them side by side.

Caddy obtains and renews certificates and redirects HTTP to HTTPS out of the box, so there is no extra module to install.

### Install Caddy

Ubuntu's own repository carries Caddy, but it can be outdated, so add the official repository.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

```bash
sudo apt update
sudo apt install -y caddy
```

Check the version:

```bash
caddy version
```

Something starting with `v2.` means you are good.

:::caution[If nginx is running]
Stop and disable it first, or the ports clash and Caddy will not start.

```bash
sudo systemctl disable --now nginx
```
:::

### Open the firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

Port 80 is used for issuance and renewal (the HTTP-01 challenge), so leave it open. UDP 443 is for HTTP/3; skip it if you do not want HTTP/3.

:::caution[Do not open port 3000]
engawa listens on `0.0.0.0`, so opening port 3000 would let people reach it directly, bypassing HTTPS. Keep it closed at the firewall.
:::

### Add the configuration file

Copy `contrib/Caddyfile` from the repository:

```bash
sudo cp /home/engawa/engawa/contrib/Caddyfile /etc/caddy/Caddyfile
```

Replace the domain and the contact address with your own. The contact address is where Let's Encrypt sends certificate notices.

```bash
sudo sed -i 's/engawa\.example\.com/example.com/g; s/admin@example\.com/you@example.com/g' /etc/caddy/Caddyfile
```

Open it and confirm the substitutions landed:

```bash
sudo nano /etc/caddy/Caddyfile
```

`max_size` under `request_body` (268435456, i.e. 256 MiB) is meant to line up with engawa's `maxFileSize`. If you change one, change the other.

### Validate the configuration

Caddy can format and validate the file. Running both before you start it saves time.

```bash
caddy fmt --diff /etc/caddy/Caddyfile
```

A diff here means the formatting is off — it does not mean the config is broken.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

`Valid configuration` is what you want.

### Start it

```bash
sudo systemctl enable --now caddy
```

If Caddy is already running, use `sudo systemctl reload caddy`.

The first issuance takes a few tens of seconds. Watch the progress and any errors in the log:

```bash
sudo journalctl -u caddy -f
```

:::caution[Do not delete the data directory]
`/var/lib/caddy` holds the ACME account key and the certificates. Carry the whole directory over if you move the server; delete it and you have to get the certificate issued again.
:::

### Verify

```bash
curl -I http://example.com/
```

`HTTP/1.1 308 Permanent Redirect` means the redirect from HTTP works — Caddy sets that up for you.

```bash
curl -I https://example.com/
```

`HTTP/2 200` means the certificate was issued and requests reach engawa.

Open `https://example.com` in a browser. If the initial setup screen appears, you are done — the first account you create becomes the administrator.

## Updating

When a new version is released, run this as the engawa user:

```bash
sudo systemctl stop engawa
sudo -iu engawa
cd engawa
git pull
pnpm install --frozen-lockfile
NODE_ENV=production pnpm build
pnpm migrate
exit
sudo systemctl start engawa
```

:::caution
Back up the database first. Migrations are hard to undo.

```bash
sudo -u postgres pg_dump engawa > ~/engawa-backup-$(date +%Y%m%d).sql
```
:::

If the release notes describe extra steps, follow those instead.

## When something goes wrong

| Symptom | What to check |
|---|---|
| The service keeps dying | Read the error with `sudo journalctl -u engawa -n 50`. A typo in the config file is the usual cause |
| 502 Bad Gateway | Check that engawa is running (`systemctl status engawa`) and that `port` matches nginx's `proxy_pass` |
| HTTPS does not work / no certificate is issued | Check that port 80 is reachable from outside and that DNS points at this server. Details land in `/var/log/nginx/error.log` |
| nginx will not start: `module ... is already loaded` | The `load_module` line is duplicated between `nginx.conf` and `modules-enabled/`. Keep only one |
| Every request appears to come from the same IP | `trustProxy` is missing from the configuration file |
| The timeline does not update by itself | Check that the nginx WebSocket headers (`Upgrade` and `Connection`) are present |
| Cannot connect to the database | Try connecting by hand with `psql -h localhost -U engawa -d engawa` and confirm the password matches the config file |
| The build stops half way | Out of memory. Add swap as described in step 9 |
| Something is off and you are running Caddy | Read the log with `sudo journalctl -u caddy -n 50` |
| No video thumbnails | Check that ffmpeg is installed with `ffprobe -version`. Restart engawa after installing it |

Whenever you edit the configuration file, restart with `sudo systemctl restart engawa` — a running process will not pick up the change.
