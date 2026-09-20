---
title: systemdでインストールする（Ubuntu / Debian）
description: Ubuntu・Debian系のサーバーに、systemdサービスとしてengawaを構築する手順
lastUpdated: 2026-09-20
---

Ubuntu 24.04 LTS を想定した、engawaをゼロから構築する手順です。Debian 12でも、パッケージ名が同じなのでほぼそのまま使えます。

Dockerを使う場合はこのページではなく、Docker向けの手順を参照してください。RHEL系（AlmaLinux・Rocky Linux・RHEL）をお使いの場合は [systemdでインストールする（RHEL系）](/engawa/install/systemd-rhel/) を参照してください。

:::note[この手順で作られるもの]
- engawa本体（`/home/engawa/engawa`）
- PostgreSQL と Redis（同じサーバー上）
- `engawa.service` という名前のsystemdサービス
- nginx（またはCaddy）によるHTTPS配信
:::

## 始める前に

### 用意するもの

| 項目 | 目安 |
|---|---|
| サーバー | メモリ4GB以上を推奨。ビルド時にメモリを多く使います |
| ドメイン | 例: `example.com`。サーバーのIPアドレスを指すAレコード（IPv6ならAAAAレコード）を先に設定しておきます |
| メールサーバー | 必須ではありませんが、ユーザー登録の確認メールを送るなら必要です |
| オブジェクトストレージ | 必須ではありません。あとから管理画面で設定できます |

:::caution[ドメインは後から変えられません]
`url` に設定したドメインは、一度サーバーを起動して他サーバーと通信を始めると変更できません。テスト用のドメインで始めて後で本番用に移す、ということはできないので、最初から本番のドメインを設定してください。
:::

### 作業の流れ

1. 必要なソフトウェアを入れる（Node.js・PostgreSQL・Redis）
2. engawa専用のユーザーとデータベースを作る
3. ソースコードを取得してビルドする
4. 設定ファイルを書く
5. systemdサービスとして登録する
6. リバースプロキシ（nginx）を立ててHTTPS配信する

以下のコマンドは、`sudo` が使える一般ユーザーで実行してください。

## 1. 基本的なパッケージを入れる

まずシステムを最新にして、ビルドに必要なツールを入れます。

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y build-essential python3 curl git ca-certificates gnupg ffmpeg
```

`build-essential` と `python3` は、engawaが使う一部のライブラリをビルドするために必要です。入れずに進むと、後の `pnpm install` で失敗します。

`ffmpeg` は、動画ファイルを扱うために必要です。engawaは `ffmpeg` と `ffprobe` のコマンドをそのまま呼び出すので、システムに入っていないと機能しません。入ったか確認しておきます。

```bash
ffprobe -version
```

:::note[ffmpegがないとどうなるか]
engawaの起動自体は成功しますが、動画に関する処理が次のように劣化します。

- 動画のサムネイルが生成されません
- 音声ファイル（m4a・webmなど）に映像トラックがあるかを判定できず、映像ありとして扱われます

どうしてもサーバーに入れられない場合は、設定ファイルの `videoThumbnailGenerator` に外部のサムネイル生成サービスを指定する方法もあります。
:::

## 2. Node.js を入れる

engawaにはNode.js 24以上が必要です。Ubuntuの標準リポジトリにあるNode.jsはバージョンが古いので、NodeSourceのリポジトリを追加します。

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

入ったか確認します。

```bash
node -v
```

`v24.` から始まるバージョンが表示されればOKです。

次に、パッケージマネージャーの pnpm を有効にします。engawaは npm や yarn ではなく pnpm を使います。

```bash
sudo corepack enable
```

```bash
pnpm -v
```

:::note
`corepack: command not found` と出る場合は、代わりに `sudo npm install -g pnpm@11` で入れてください。
:::

## 3. PostgreSQL を入れる

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

PostgreSQL 15以上が必要です。Ubuntu 24.04では16が入ります。バージョンは次のコマンドで確認できます。

```bash
psql --version
```

## 4. Redis を入れる

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

動いているか確認します。

```bash
redis-cli ping
```

`PONG` と返ってくればOKです。

## 5. engawa用のユーザーを作る

engawaをrootで動かすのは避けたいので、専用のユーザーを作ります。

```bash
sudo adduser --disabled-password --disabled-login engawa
```

以降、engawa本体に関する作業はこのユーザーで行います。切り替えは次のコマンドです。

```bash
sudo -iu engawa
```

元のユーザーに戻るときは `exit` と入力します。**このページでは、どちらのユーザーで実行するコマンドなのかを都度書いています。**

## 6. データベースを作る

元のユーザー（`sudo` が使えるユーザー）に戻ってから実行します。

```bash
sudo -u postgres psql
```

PostgreSQLのプロンプト（`postgres=#`）が出たら、次の3行を順に実行します。`example-pass` の部分は自分で決めたパスワードに置き換えてください。あとで設定ファイルに書くので、控えておきます。

```sql
CREATE ROLE engawa WITH LOGIN PASSWORD 'example-pass';
CREATE DATABASE engawa OWNER engawa;
\q
```

`\q` でプロンプトを抜けます。

## 7. ソースコードを取得してビルドする

ここからは **engawaユーザー** で作業します。

```bash
sudo -iu engawa
```

リポジトリを取得します。

```bash
git clone --branch develop https://github.com/bettaku/engawa.git engawa
cd engawa
```

:::tip[ディスクの節約]
`--depth 1` を付けると履歴を取得せず、ダウンロード量とディスク使用量を減らせます。ただし後から別のバージョンに切り替えるのが面倒になるので、迷うなら付けないでおくのが無難です。
:::

依存パッケージを入れます。数分かかります。

```bash
pnpm install --frozen-lockfile
```

## 8. 設定ファイルを書く

サンプルをコピーして編集します（engawaユーザーのまま）。

```bash
cp .config/example.yml .config/default.yml
nano .config/default.yml
```

最低限、次の項目を自分の環境に合わせます。

```yaml
# 公開するURL。末尾のスラッシュは必要です
url: https://example.com/

# engawaが待ち受けるポート。nginxからここに中継します
port: 3000

db:
  host: localhost
  port: 5432
  db: engawa
  user: engawa
  pass: example-pass  # 手順6で決めたパスワード

redis:
  host: localhost
  port: 6379

# 手順11で立てるリバースプロキシを信頼します。
# これがないと、すべてのアクセス元IPがプロキシのIPとして記録されます
trustProxy:
  - '127.0.0.1/32'
  - '::1/128'

# サーバーを作った後は変更しないでください
id: 'aidx'
```

`nano` での保存は <kbd>Ctrl</kbd>+<kbd>O</kbd> → <kbd>Enter</kbd>、終了は <kbd>Ctrl</kbd>+<kbd>X</kbd> です。

他の項目もすべてコメント付きでサンプルに書かれているので、一度目を通しておくことをおすすめします。設定ファイルと環境変数の関係については [バックエンドの環境変数](/engawa/install/environment-variables/)、データベース接続の細かい調整については [db.extra で指定できる設定](/engawa/install/db-extra/) を参照してください。

## 9. ビルドしてデータベースを初期化する

engawaユーザーのまま、リポジトリのルートで実行します。

```bash
NODE_ENV=production pnpm build
```

:::caution[ビルド中にメモリ不足で止まる場合]
メモリ2GB程度のサーバーでは、フロントエンドのビルドが強制終了されることがあります。その場合はスワップを追加してください。

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

再起動後も有効にするには `/etc/fstab` に `/swapfile none swap sw 0 0` を追記します。
:::

ビルドが終わったら、データベースにテーブルを作ります。

```bash
pnpm migrate
```

ここまで成功したら、一度手動で起動して動作を確認します。

```bash
pnpm start
```

`Now listening on port 3000` のような行が出れば成功です。<kbd>Ctrl</kbd>+<kbd>C</kbd> で止めて、次に進みます。

エラーが出た場合は、データベースのパスワードやRedisの設定を見直してください。

## 10. systemdサービスとして登録する

`exit` でengawaユーザーを抜けて、元のユーザーに戻ります。

サービス定義ファイルを作ります。

```bash
sudo nano /etc/systemd/system/engawa.service
```

次の内容を貼り付けて保存します。

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

:::note[ExecStartについて]
`pnpm start` ではなくNode.jsを直接呼んでいるのは、systemdから実行するときにpnpmのパスが解決できず失敗することがあるためです。`pnpm start` は内部でデータベースへの接続確認を行ってから同じファイルを実行しているだけなので、動作に違いはありません。
:::

読み込んで起動します。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now engawa
```

状態を確認します。

```bash
sudo systemctl status engawa
```

`active (running)` と表示されればOKです。ログを見たいときは次のコマンドを使います。

```bash
sudo journalctl -u engawa -f
```

<kbd>Ctrl</kbd>+<kbd>C</kbd> で抜けられます。

## 11. リバースプロキシを立ててHTTPS配信する

engawaは `localhost:3000` で動いていますが、このままでは外部からアクセスできません。nginxを前段に置いて、HTTPSでの配信と証明書の管理を任せます。

設定ファイルは、リポジトリの `contrib/` に本番用のものが用意されています。ここではそれをそのまま使います。[`contrib/README.md`](https://github.com/bettaku/engawa/blob/develop/contrib/README.md) も一度目を通してください。

:::note[Certbotは使いません]
この設定では、証明書の取得と更新をnginx自身のACMEモジュール（`ngx_http_acme_module`）が行います。Certbotやcron、challenge用のwebrootは不要です。

nginxではなくCaddyを使いたい場合は、この手順を飛ばして [手順11の代替: Caddy でHTTPS配信する](#手順11の代替-caddy-でhttps配信する) に進んでください。どちらか一方だけを使います。
:::

### nginx とACMEモジュールを入れる

ACMEモジュールが使えるのはnginx 1.29.0以降で、Ubuntuの標準リポジトリのnginxには含まれていません。nginx公式リポジトリを追加します。

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

:::note[Debianの場合]
`ubuntu-keyring` を `debian-archive-keyring` に、リポジトリURLの `ubuntu` を `debian` に読み替えてください。
:::

バージョンを確認します。

```bash
nginx -v
```

`nginx/1.29.0` 以上であればOKです。

### ACMEモジュールを読み込む

`/etc/nginx/nginx.conf` を開きます。

```bash
sudo nano /etc/nginx/nginx.conf
```

ファイルの先頭付近、`http {` より**外側**に次の1行を追加します。

```nginx
load_module modules/ngx_http_acme_module.so;
```

:::caution
パッケージによっては、`/etc/nginx/modules-enabled/` 以下のファイルから自動で読み込まれることがあります。その場合はここに書かないでください。二重に読み込むと `module ... is already loaded` というエラーで起動しません。
:::

### 設定ファイルを置く

リポジトリの `contrib/nginx.sample.conf` を、nginxの `conf.d` にコピーします。

```bash
sudo cp /home/engawa/engawa/contrib/nginx.sample.conf /etc/nginx/conf.d/engawa.conf
```

ドメインと連絡先を自分のものに置き換えます。

```bash
sudo sed -i 's/engawa\.example\.com/example.com/g; s/admin@example\.com/you@example.com/g' /etc/nginx/conf.d/engawa.conf
```

置き換わったか、中身を確認しておきます。

```bash
sudo nano /etc/nginx/conf.d/engawa.conf
```

あわせて、次の項目が環境に合っているか確認してください。

| 項目 | 既定値 | 説明 |
|---|---|---|
| `resolver` | `1.1.1.1 1.0.0.1` | ACMEモジュールが使うDNSサーバーです。社内DNSがあればそちらに変更します |
| `ssl_trusted_certificate` | `/etc/ssl/certs/ca-certificates.crt` | Ubuntu・DebianのCA証明書のパスです。このままでOKです |
| `client_max_body_size` | `256m` | アップロード上限です。engawa側の `maxFileSize` と揃えます |

nginx公式パッケージには、80番ポートを受ける既定の設定が付属しています。競合するので消しておきます。

```bash
sudo rm -f /etc/nginx/conf.d/default.conf
```

### ACMEの保存先を作る

証明書とアカウント鍵の保存先を、nginxのworkerユーザーが読み書きできるように作ります。nginx公式パッケージのworkerユーザーは `nginx` です。

```bash
sudo install -d -m 700 -o nginx -g nginx /var/lib/nginx/acme-engawa
```

:::caution
このディレクトリには秘密鍵が入ります。権限（`700`）を維持し、サーバーを移設するときも中身を引き継いでください。消してしまうと、証明書を取り直すことになります。
:::

### ファイアウォールを開ける

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

80番はHTTPSへのリダイレクトだけでなく、証明書の初回取得と更新（HTTP-01認証）にも使われます。閉じないでください。

:::caution[3000番は開けないでください]
engawaは `0.0.0.0` で待ち受けるため、3000番を開けるとHTTPSを経由せずに直接アクセスできてしまいます。ファイアウォールで塞いだままにしてください。
:::

### 起動する

設定の文法を確認してから起動します。

```bash
sudo nginx -t
sudo systemctl enable --now nginx
```

`syntax is ok` と `test is successful` が出てから起動してください。すでに起動している場合は `sudo systemctl reload nginx` です。

初回の証明書発行には数十秒かかります。その間、HTTPSはまだ使えません。進行状況やエラーはnginxのログで確認できます。

```bash
sudo tail -f /var/log/nginx/error.log
```

### 動作を確認する

```bash
curl -I http://example.com/
```

`HTTP/1.1 308 Permanent Redirect` が返ればHTTPからのリダイレクトは正常です。

```bash
curl -I https://example.com/
```

`HTTP/2 200` が返れば、証明書の発行とengawaへの中継ができています。

ブラウザで `https://example.com` を開いて、初期設定画面が出れば完了です。最初に作ったアカウントが管理者になります。

## 手順11の代替: Caddy でHTTPS配信する

nginxの代わりにCaddyを使う手順です。**手順11を実行した場合、このセクションは不要です。** どちらも80番・443番を使うので、両方を同時に動かすことはできません。

Caddyは証明書の取得・更新とHTTPからのリダイレクトを標準機能で行うため、追加のモジュールは要りません。

### Caddy を入れる

Ubuntuの標準リポジトリにもCaddyはありますが、バージョンが古いことがあるので公式リポジトリを追加します。

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

バージョンを確認します。

```bash
caddy version
```

`v2.` から始まるバージョンが表示されればOKです。

:::caution[nginxが動いている場合]
先にnginxを止めて無効化してください。ポートが競合してCaddyが起動しません。

```bash
sudo systemctl disable --now nginx
```
:::

### ファイアウォールを開ける

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

80番は証明書の取得と更新（HTTP-01認証）に使われるので、閉じないでください。443番のUDPはHTTP/3用です。使わない場合は省いて構いません。

:::caution[3000番は開けないでください]
engawaは `0.0.0.0` で待ち受けるため、3000番を開けるとHTTPSを経由せずに直接アクセスできてしまいます。ファイアウォールで塞いだままにしてください。
:::

### 設定ファイルを置く

リポジトリの `contrib/Caddyfile` をコピーします。

```bash
sudo cp /home/engawa/engawa/contrib/Caddyfile /etc/caddy/Caddyfile
```

ドメインと連絡先を自分のものに置き換えます。連絡先は、証明書に関する通知がLet's Encryptから届くアドレスです。

```bash
sudo sed -i 's/engawa\.example\.com/example.com/g; s/admin@example\.com/you@example.com/g' /etc/caddy/Caddyfile
```

中身を確認しておきます。

```bash
sudo nano /etc/caddy/Caddyfile
```

`request_body` の `max_size`（268435456 = 256 MiB）は、engawa側の `maxFileSize` と揃える値です。変更するときは両方を直してください。

### 設定を検証する

Caddyには書式の整形と検証のコマンドがあります。起動前に通しておくと確実です。

```bash
caddy fmt --diff /etc/caddy/Caddyfile
```

差分が表示された場合は、書式の乱れがあるという意味です（動作しないわけではありません）。

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

`Valid configuration` と出ればOKです。

### 起動する

```bash
sudo systemctl enable --now caddy
```

すでに起動している場合は `sudo systemctl reload caddy` です。

初回の証明書発行には数十秒かかります。進行状況やエラーはログで確認できます。

```bash
sudo journalctl -u caddy -f
```

:::caution[データディレクトリを消さないでください]
`/var/lib/caddy` にACMEアカウントの鍵と証明書が保存されます。サーバーを移設するときは、このディレクトリごと引き継いでください。消すと証明書を取り直すことになります。
:::

### 動作を確認する

```bash
curl -I http://example.com/
```

`HTTP/1.1 308 Permanent Redirect` が返ればHTTPからのリダイレクトは正常です。CaddyはHTTPからHTTPSへのリダイレクトを自動で設定します。

```bash
curl -I https://example.com/
```

`HTTP/2 200` が返れば、証明書の発行とengawaへの中継ができています。

ブラウザで `https://example.com` を開いて、初期設定画面が出れば完了です。最初に作ったアカウントが管理者になります。

## アップデートのしかた

新しいバージョンが出たら、engawaユーザーで次の手順を実行します。

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
アップデート前にデータベースのバックアップを取ってください。マイグレーションは元に戻すのが難しい操作です。

```bash
sudo -u postgres pg_dump engawa > ~/engawa-backup-$(date +%Y%m%d).sql
```
:::

リリースノートに個別の作業が書かれている場合は、そちらを優先してください。

## うまくいかないときは

| 症状 | 確認すること |
|---|---|
| サービスがすぐ落ちる | `sudo journalctl -u engawa -n 50` でエラーを確認します。設定ファイルの書式ミスが多いです |
| 502 Bad Gateway | engawa本体が起動しているか（`systemctl status engawa`）、`port` とnginxの `proxy_pass` の番号が一致しているかを確認します |
| HTTPSにつながらない・証明書が発行されない | 80番が外部から到達できるか、DNSがこのサーバーを指しているかを確認します。詳細は `/var/log/nginx/error.log` に出ます |
| `module ... is already loaded` で起動しない | `load_module` の行が `nginx.conf` と `modules-enabled/` で重複しています。どちらか一方にしてください |
| アクセス元IPがすべて同じになる | 設定ファイルの `trustProxy` が抜けています |
| タイムラインが自動更新されない | nginxのWebSocket設定（`Upgrade` と `Connection` のヘッダー）が抜けていないか確認します |
| データベースに接続できない | `psql -h localhost -U engawa -d engawa` で手動接続を試します。パスワードが設定ファイルと一致しているか確認します |
| ビルドが途中で止まる | メモリ不足です。手順9のスワップ追加を試してください |
| Caddyを使っていて様子がおかしい | `sudo journalctl -u caddy -n 50` でログを確認します |
| 動画のサムネイルが出ない | `ffprobe -version` でffmpegが入っているか確認します。入れた後はengawaの再起動が必要です |

設定ファイルを書き換えたときは、必ず `sudo systemctl restart engawa` で再起動してください。起動中のプロセスには反映されません。
