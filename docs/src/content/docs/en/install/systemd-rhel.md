---
title: Installing with systemd (RHEL family)
description: Setting up engawa as a systemd service on AlmaLinux, Rocky Linux and RHEL
lastUpdated: 2026-09-20
sidebar:
  order: 3
---

This page walks through building engawa from scratch on AlmaLinux 9, Rocky Linux 9 or RHEL 9. RHEL 10 follows the same flow, with some care around SELinux and package names.

If you are on Ubuntu or Debian, see [Installing with systemd (Ubuntu / Debian)](/engawa/en/install/systemd-ubuntu/).

:::note[What you end up with]
- engawa itself, in `/home/engawa/engawa`
- PostgreSQL and Redis on the same server
- A systemd service named `engawa.service`
- nginx (or Caddy) serving it over HTTPS
:::

:::caution[Specific to the RHEL family]
**SELinux** and **firewalld** are enabled by default here. Ignore them and you end up in the confusing state where engawa is running perfectly but the browser cannot reach it. This guide configures both where it matters.
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
6. Put a reverse proxy (nginx) in front and serve HTTPS, including SELinux and firewalld

Run the commands below as a regular user with `sudo` access.

## 1. Install the basics

Bring the system up to date and install the build tools.

```bash
sudo dnf upgrade -y
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y python3 curl git
```

`Development Tools` and `python3` are needed to compile some of engawa's dependencies. Without them, `pnpm install` fails later on.

:::note
On RHEL 10 and other DNF 5 systems, `dnf groupinstall` became `dnf group install`. If the command errors, try `sudo dnf group install -y "Development Tools"`.
:::

Add the EPEL repository now as well, since it is needed later.

```bash
sudo dnf install -y epel-release
```

### Install ffmpeg

engawa shells out to the `ffmpeg` and `ffprobe` commands to handle video. Neither ships in the standard RHEL-family repositories, so you have to add them.

The easy route is `ffmpeg-free` from EPEL:

```bash
sudo dnf install -y ffmpeg-free
```

If you need the full build with patent-encumbered codecs, enable CRB and add RPM Fusion:

```bash
sudo dnf config-manager --set-enabled crb
sudo dnf install -y https://mirrors.rpmfusion.org/free/el/rpmfusion-free-release-$(rpm -E %rhel).noarch.rpm
sudo dnf install -y ffmpeg
```

:::note
On RHEL itself, the repository equivalent to CRB is named `codeready-builder-for-rhel-9-x86_64-rpms`. On AlmaLinux and Rocky Linux, `crb` works as written above.
:::

Either way the commands are called `ffmpeg` and `ffprobe`. Confirm they are there:

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

engawa needs Node.js 24 or newer. The version in the default repositories is too old, so add the NodeSource repository.

```bash
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs
```

Check it:

```bash
node -v
```

A version starting with `v24.` means you are good.

:::note[If AppStream's Node.js is already installed]
Check the enabled stream with `dnf module list nodejs`. If it conflicts, run `sudo dnf module reset nodejs` before installing the NodeSource package.
:::

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

engawa needs PostgreSQL 15 or newer, and what AppStream carries can be older than that, so use [PostgreSQL's official Yum repository](https://www.postgresql.org/download/linux/redhat/). This guide installs PostgreSQL 18.

### Add the repository

```bash
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
```

:::note[Adjust for your environment]
`EL-9-x86_64` in the URL is your OS major version and CPU architecture — `EL-10-x86_64` on RHEL 10, `EL-9-aarch64` on Arm. The [official download page](https://www.postgresql.org/download/linux/redhat/) generates the exact commands once you pick your platform, architecture and version.
:::

On RHEL 8, you also have to disable the AppStream module. This is not needed on RHEL 9 and later.

```bash
sudo dnf -qy module disable postgresql
```

### Install and initialize

```bash
sudo dnf install -y postgresql18-server postgresql18-contrib
```

Unlike Ubuntu, the RHEL family does not initialize the data directory for you. The official packages use a per-version setup command:

```bash
sudo /usr/pgsql-18/bin/postgresql-18-setup initdb
sudo systemctl enable postgresql-18
sudo systemctl start postgresql-18
```

:::caution[Version numbers appear in service names and paths]
With the official packages the service is `postgresql-18`, not `postgresql`; the data directory is `/var/lib/pgsql/18/data`; and the commands live under `/usr/pgsql-18/bin/`. If you installed a version other than 18, substitute it for `18` everywhere below.
:::

### Put the commands on your PATH

`psql` and friends land in `/usr/pgsql-18/bin/`, so typing `psql` alone will not find them. You can write the full path every time, but adding it to `PATH` is easier:

```bash
echo 'export PATH=/usr/pgsql-18/bin:$PATH' | sudo tee /etc/profile.d/pgsql.sh
```

Log out and back in to pick it up, or run:

```bash
source /etc/profile.d/pgsql.sh
```

This page uses full paths throughout, so the steps work either way.

### Enable password authentication

Out of the box, local connections use `ident` — no password — which means engawa cannot log in. Change it:

```bash
sudo nano /var/lib/pgsql/18/data/pg_hba.conf
```

Near the bottom, set the last column of the `127.0.0.1/32` and `::1/128` lines to `scram-sha-256`:

```text
# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
# IPv6 local connections:
host    all             all             ::1/128                 scram-sha-256
```

Save, then reload the configuration:

```bash
sudo systemctl reload postgresql-18
```

## 4. Install Redis

```bash
sudo dnf install -y redis
sudo systemctl enable --now redis
```

Verify it is running:

```bash
redis-cli ping
```

It should answer `PONG`.

:::note[About the version]
RHEL 9's AppStream ships Redis 6.2. It works, but engawa is developed against 7.x. To get 7.x, add a third-party repository such as [Remi](https://rpms.remirepo.net/), or use Valkey, the compatible fork (a standard package on RHEL 10, available from EPEL on RHEL 9). With Valkey the service is named `valkey` and the config lives in `/etc/valkey/valkey.conf`.
:::

## 5. Create a user for engawa

Running engawa as root is best avoided, so create a dedicated user.

```bash
sudo useradd -m -s /bin/bash engawa
```

From here on, anything touching engawa itself is done as this user. Switch to it with:

```bash
sudo -iu engawa
```

Type `exit` to return to your own user. **Each step below says which user to run it as.**

## 6. Create the database

Go back to your own user (the one with `sudo`) and run:

```bash
sudo -u postgres /usr/pgsql-18/bin/psql
```

At the `postgres=#` prompt, run these three lines. Replace `example-pass` with a password of your own and keep it — you will put it in the configuration file.

```sql
CREATE ROLE engawa WITH LOGIN PASSWORD 'example-pass';
CREATE DATABASE engawa OWNER engawa;
\q
```

`\q` leaves the prompt. It is worth confirming that the new credentials actually work:

```bash
/usr/pgsql-18/bin/psql -h 127.0.0.1 -U engawa -d engawa -c '\conninfo'
```

If it prompts for the password and connects, the authentication change in step 3 took effect.

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
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
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
After=network-online.target postgresql-18.service redis.service

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

:::note
If you went with Valkey, change `redis.service` in the `After=` line to `valkey.service`.
:::

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

The ACME module needs nginx 1.29.0 or newer, which AppStream does not carry. Add the official nginx repository.

```bash
sudo tee /etc/yum.repos.d/nginx.repo > /dev/null <<'EOF'
[nginx-mainline]
name=nginx mainline repo
baseurl=http://nginx.org/packages/mainline/centos/$releasever/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
module_hotfixes=true
EOF
```

:::note
`$releasever` and `$basearch` are variables dnf expands for you. Paste them as-is — the heredoc is quoted with `'EOF'`, so the shell leaves them alone.
:::

If AppStream's nginx is already installed, remove it first. If it is not, dnf just says there is no match, and you can move on.

```bash
sudo dnf remove -y nginx-core
```

Now install from the official repository:

```bash
sudo dnf install -y nginx nginx-module-acme
```

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
If it is already loaded from a file under `/etc/nginx/modules-enabled/`, do not add the line here — loading it twice fails to start with `module ... is already loaded`.
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

:::caution[Change the CA bundle path]
The sample's `ssl_trusted_certificate` points at the Ubuntu/Debian path. On the RHEL family you have to change it:

```bash
sudo sed -i 's#/etc/ssl/certs/ca-certificates.crt#/etc/pki/tls/certs/ca-bundle.crt#' /etc/nginx/conf.d/engawa.conf
```

Miss this and the ACME module cannot verify Let's Encrypt's server, so issuance fails.
:::

Open the file, confirm the substitutions landed, and check these against your environment:

```bash
sudo nano /etc/nginx/conf.d/engawa.conf
```

| Setting | Default | What it is |
|---|---|---|
| `resolver` | `1.1.1.1 1.0.0.1` | The DNS servers the ACME module uses. Point it at your own resolver if you have one |
| `ssl_trusted_certificate` | `/etc/ssl/certs/ca-certificates.crt` | Change it to `/etc/pki/tls/certs/ca-bundle.crt`, as above |
| `client_max_body_size` | `256m` | The upload limit. Keep it in line with engawa's `maxFileSize` |

The official nginx package ships a default site that also listens on port 80. Remove it so it does not compete:

```bash
sudo rm -f /etc/nginx/conf.d/default.conf
```

### Create the ACME state directory

The certificate and the account key are stored here, and the nginx worker user has to be able to read and write it.

```bash
sudo install -d -m 700 -o nginx -g nginx /var/lib/nginx/acme-engawa
sudo restorecon -R /var/lib/nginx/acme-engawa
```

`restorecon` resets the SELinux labels on the directory to the correct values.

:::caution
This directory holds private keys. Keep the `700` permissions, and carry its contents over if you move the server. Delete it and you have to get the certificate issued again.
:::

### Configure SELinux

Out of the box, SELinux forbids nginx from connecting to another process — engawa, in this case. Allow it:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

:::caution
Skip this and nginx logs `Permission denied` while the browser shows 502 Bad Gateway. Since engawa itself is running fine, the cause is easy to miss — this is the single most common stumbling block on the RHEL family.
:::

### Configure firewalld

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

Port 80 is not just for the redirect to HTTPS — the HTTP-01 challenge uses it for the initial issuance and every renewal. Leave it open.

:::caution[Do not open port 3000]
engawa listens on `0.0.0.0`, so opening port 3000 would let people reach it directly, bypassing HTTPS. Keep it closed in firewalld.
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

The standard RHEL-family repositories do not carry Caddy, so install it from COPR.

```bash
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy
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

### Configure firewalld

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=443/udp
sudo firewall-cmd --reload
```

Port 80 is used for issuance and renewal (the HTTP-01 challenge), so leave it open. UDP 443 is for HTTP/3; skip it if you do not want HTTP/3.

:::caution[Do not open port 3000]
engawa listens on `0.0.0.0`, so opening port 3000 would let people reach it directly, bypassing HTTPS. Keep it closed in firewalld.
:::

### About SELinux

Unlike the nginx route, Caddy does not normally need the `httpd_can_network_connect` boolean: its binary is not labelled as a web server the way nginx's is, so it runs without those restrictions.

If you do hit a 502, check whether SELinux is involved:

```bash
sudo ausearch -m AVC -ts recent
```

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
sudo -u postgres /usr/pgsql-18/bin/pg_dump engawa > /tmp/engawa-backup-$(date +%Y%m%d).sql
```
:::

If the release notes describe extra steps, follow those instead.

## When something goes wrong

| Symptom | What to check |
|---|---|
| 502 Bad Gateway | First confirm you ran `sudo setsebool -P httpd_can_network_connect 1`. It is the most common cause here |
| Nothing reaches the server at all | Check that http/https are open in firewalld with `sudo firewall-cmd --list-services` |
| HTTPS does not work / no certificate is issued | Check that `ssl_trusted_certificate` was changed to `/etc/pki/tls/certs/ca-bundle.crt` and that port 80 is reachable from outside. Details land in `/var/log/nginx/error.log` |
| nginx will not start: `module ... is already loaded` | The `load_module` line is duplicated between `nginx.conf` and `modules-enabled/`. Keep only one |
| Every request appears to come from the same IP | `trustProxy` is missing from the configuration file |
| The service keeps dying | Read the error with `sudo journalctl -u engawa -n 50`. A typo in the config file is the usual cause |
| Cannot connect to the database | Check that `/var/lib/pgsql/18/data/pg_hba.conf` says `scram-sha-256` and that you ran `sudo systemctl reload postgresql-18` |
| The timeline does not update by itself | Check that the nginx WebSocket headers (`Upgrade` and `Connection`) are present |
| The build stops half way | Out of memory. Add swap as described in step 9 |
| Something is off and you are running Caddy | Read the log with `sudo journalctl -u caddy -n 50` |
| No video thumbnails | Check that ffmpeg is installed with `ffprobe -version`. Restart engawa after installing it |

To tell whether SELinux is the culprit, look at the recent denials:

```bash
sudo ausearch -m AVC -ts recent
```

Whenever you edit the configuration file, restart with `sudo systemctl restart engawa` — a running process will not pick up the change.
