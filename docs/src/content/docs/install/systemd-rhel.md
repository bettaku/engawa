---
title: systemdでインストールする（RHEL系）
description: AlmaLinux・Rocky Linux・RHELに、systemdサービスとしてengawaを構築する手順
lastUpdated: 2026-09-20
---

AlmaLinux 9 / Rocky Linux 9 / RHEL 9 を想定した、engawaをゼロから構築する手順です。RHEL 10系でも、SELinuxとパッケージ名に注意すればほぼ同じ流れで進められます。

Ubuntu・Debianをお使いの場合は [systemdでインストールする（Ubuntu / Debian）](/engawa/install/systemd-ubuntu/) を参照してください。

:::note[この手順で作られるもの]
- engawa本体（`/home/engawa/engawa`）
- PostgreSQL と Redis（同じサーバー上）
- `engawa.service` という名前のsystemdサービス
- nginx（またはCaddy）によるHTTPS配信
:::

:::caution[RHEL系ならではの注意点]
RHEL系では **SELinux** と **firewalld** が既定で有効です。この2つを意識せずに進めると、engawa自体は正常に動いているのにブラウザからつながらない、という状態になりがちです。この手順では、必要な箇所でどちらも設定します。
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
6. リバースプロキシ（nginx）を立ててHTTPS配信する（SELinux・firewalldの設定を含む）

以下のコマンドは、`sudo` が使える一般ユーザーで実行してください。

## 1. 基本的なパッケージを入れる

システムを最新にして、ビルドに必要なツールを入れます。

```bash
sudo dnf upgrade -y
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y python3 curl git
```

`Development Tools` と `python3` は、engawaが使う一部のライブラリをビルドするために必要です。入れずに進むと、後の `pnpm install` で失敗します。

:::note
RHEL 10やDNF 5環境では `dnf groupinstall` が `dnf group install` に変わっています。エラーが出る場合は `sudo dnf group install -y "Development Tools"` を試してください。
:::

あとで使うEPELリポジトリも、この時点で追加しておきます。

```bash
sudo dnf install -y epel-release
```

### ffmpeg を入れる

engawaは動画を扱うために `ffmpeg` と `ffprobe` のコマンドをそのまま呼び出します。RHEL系の標準リポジトリにはffmpegが含まれていないため、別途追加する必要があります。

手軽なのはEPELの `ffmpeg-free` です。

```bash
sudo dnf install -y ffmpeg-free
```

特許で保護されたコーデックを含む完全版が必要な場合は、CRBリポジトリとRPM Fusionを追加します。

```bash
sudo dnf config-manager --set-enabled crb
sudo dnf install -y https://mirrors.rpmfusion.org/free/el/rpmfusion-free-release-$(rpm -E %rhel).noarch.rpm
sudo dnf install -y ffmpeg
```

:::note
RHEL本体では、CRBに相当するリポジトリの名前が `codeready-builder-for-rhel-9-x86_64-rpms` です。AlmaLinux・Rocky Linuxでは上記のとおり `crb` で有効にできます。
:::

どちらで入れた場合も、コマンド名は `ffmpeg` と `ffprobe` です。確認しておきます。

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

engawaにはNode.js 24以上が必要です。標準リポジトリのNode.jsはバージョンが古いので、NodeSourceのリポジトリを追加します。

```bash
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs
```

入ったか確認します。

```bash
node -v
```

`v24.` から始まるバージョンが表示されればOKです。

:::note[既にAppStreamのNode.jsが入っている場合]
`dnf module list nodejs` で有効なストリームを確認し、競合するようなら `sudo dnf module reset nodejs` を実行してからNodeSourceのパッケージを入れてください。
:::

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

engawaにはPostgreSQL 15以上が必要です。AppStreamに含まれるPostgreSQLはバージョンが古いことがあるため、[PostgreSQL公式のYumリポジトリ](https://www.postgresql.org/download/linux/redhat/) を使います。ここではPostgreSQL 18を入れます。

### リポジトリを追加する

```bash
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
```

:::note[環境に合わせて読み替えてください]
URLの `EL-9-x86_64` は、OSのメジャーバージョンとCPUアーキテクチャです。RHEL 10なら `EL-10-x86_64`、Arm環境なら `EL-9-aarch64` になります。自分の環境向けのコマンドは、[公式のダウンロードページ](https://www.postgresql.org/download/linux/redhat/) でプラットフォーム・アーキテクチャ・バージョンを選ぶと生成されます。
:::

RHEL 8系の場合は、AppStreamのモジュールを無効化する手順が追加で必要です。RHEL 9以降では不要です。

```bash
sudo dnf -qy module disable postgresql
```

### インストールして初期化する

```bash
sudo dnf install -y postgresql18-server postgresql18-contrib
```

Ubuntuと違い、RHEL系では初期化が自動では行われません。公式リポジトリ版では、バージョンごとの専用コマンドを使います。

```bash
sudo /usr/pgsql-18/bin/postgresql-18-setup initdb
sudo systemctl enable postgresql-18
sudo systemctl start postgresql-18
```

:::caution[サービス名・パスにバージョン番号が入ります]
公式リポジトリ版では、サービス名が `postgresql` ではなく `postgresql-18`、データディレクトリが `/var/lib/pgsql/18/data`、コマンドが `/usr/pgsql-18/bin/` 以下になります。18以外を入れた場合は、以降に出てくる `18` をそのバージョンに読み替えてください。
:::

### コマンドにパスを通す

`psql` などのコマンドは `/usr/pgsql-18/bin/` に入り、そのままでは `psql` と打っても見つかりません。毎回フルパスを書いてもよいのですが、パスを通しておくと楽です。

```bash
echo 'export PATH=/usr/pgsql-18/bin:$PATH' | sudo tee /etc/profile.d/pgsql.sh
```

設定を反映するには、いったんログインし直すか次を実行します。

```bash
source /etc/profile.d/pgsql.sh
```

このページでは、パスを通していなくても動くようにフルパスで書いています。

### パスワード認証を有効にする

初期設定では、ローカル接続がパスワードなしの認証（`ident`）になっています。このままだとengawaからの接続に失敗するので、設定を変更します。

```bash
sudo nano /var/lib/pgsql/18/data/pg_hba.conf
```

ファイルの下の方にある、`127.0.0.1/32` と `::1/128` の行の最後の列を `scram-sha-256` に書き換えます。

```text
# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
# IPv6 local connections:
host    all             all             ::1/128                 scram-sha-256
```

保存したら、設定を読み込ませます。

```bash
sudo systemctl reload postgresql-18
```

## 4. Redis を入れる

```bash
sudo dnf install -y redis
sudo systemctl enable --now redis
```

動いているか確認します。

```bash
redis-cli ping
```

`PONG` と返ってくればOKです。

:::note[バージョンについて]
RHEL 9のAppStreamに含まれるRedisは6.2系です。動作はしますが、engawaは7.x系での動作を前提に開発されています。7.x系を使いたい場合は、[Remi](https://rpms.remirepo.net/) などのサードパーティリポジトリを追加するか、互換実装のValkey（RHEL 10では標準パッケージ、RHEL 9ではEPEL）を使ってください。Valkeyを使う場合、サービス名は `valkey`、設定ファイルは `/etc/valkey/valkey.conf` になります。
:::

## 5. engawa用のユーザーを作る

engawaをrootで動かすのは避けたいので、専用のユーザーを作ります。

```bash
sudo useradd -m -s /bin/bash engawa
```

以降、engawa本体に関する作業はこのユーザーで行います。切り替えは次のコマンドです。

```bash
sudo -iu engawa
```

元のユーザーに戻るときは `exit` と入力します。**このページでは、どちらのユーザーで実行するコマンドなのかを都度書いています。**

## 6. データベースを作る

元のユーザー（`sudo` が使えるユーザー）に戻ってから実行します。

```bash
sudo -u postgres /usr/pgsql-18/bin/psql
```

PostgreSQLのプロンプト（`postgres=#`）が出たら、次の3行を順に実行します。`example-pass` の部分は自分で決めたパスワードに置き換えてください。あとで設定ファイルに書くので、控えておきます。

```sql
CREATE ROLE engawa WITH LOGIN PASSWORD 'example-pass';
CREATE DATABASE engawa OWNER engawa;
\q
```

`\q` でプロンプトを抜けます。接続できるか、engawaユーザーの資格情報で確認しておくと安心です。

```bash
/usr/pgsql-18/bin/psql -h 127.0.0.1 -U engawa -d engawa -c '\conninfo'
```

パスワードを聞かれて接続できれば、手順3の認証設定は正しく反映されています。

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
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
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
Valkeyを使っている場合は、`After=` の `redis.service` を `valkey.service` に置き換えてください。
:::

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

ACMEモジュールが使えるのはnginx 1.29.0以降で、AppStreamのnginxには含まれていません。nginx公式リポジトリを追加します。

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
`$releasever` と `$basearch` はdnfが展開する変数です。書き換えずにそのまま貼り付けてください。上のコマンドはヒアドキュメントを `'EOF'` で囲んでいるので、シェルには展開されません。
:::

AppStreamのnginxが既に入っている場合は、先に外しておきます。入っていなければ「一致するものが見つかりません」と出るだけなので、そのまま次へ進んでください。

```bash
sudo dnf remove -y nginx-core
```

公式リポジトリからインストールします。

```bash
sudo dnf install -y nginx nginx-module-acme
```

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
`/etc/nginx/modules-enabled/` 以下のファイルから自動で読み込まれる場合は、ここに書かないでください。二重に読み込むと `module ... is already loaded` というエラーで起動しません。
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

:::caution[CA証明書のパスを変更してください]
サンプルの `ssl_trusted_certificate` はUbuntu・Debian向けのパスになっています。RHEL系では次のように書き換えが必要です。

```bash
sudo sed -i 's#/etc/ssl/certs/ca-certificates.crt#/etc/pki/tls/certs/ca-bundle.crt#' /etc/nginx/conf.d/engawa.conf
```

これを忘れると、ACMEモジュールがLet's Encryptのサーバーを検証できず、証明書の発行に失敗します。
:::

中身を確認し、次の項目が環境に合っているかも見ておきます。

```bash
sudo nano /etc/nginx/conf.d/engawa.conf
```

| 項目 | 既定値 | 説明 |
|---|---|---|
| `resolver` | `1.1.1.1 1.0.0.1` | ACMEモジュールが使うDNSサーバーです。社内DNSがあればそちらに変更します |
| `ssl_trusted_certificate` | `/etc/ssl/certs/ca-certificates.crt` | 上記のとおり `/etc/pki/tls/certs/ca-bundle.crt` に変更します |
| `client_max_body_size` | `256m` | アップロード上限です。engawa側の `maxFileSize` と揃えます |

nginx公式パッケージには、80番ポートを受ける既定の設定が付属しています。競合するので消しておきます。

```bash
sudo rm -f /etc/nginx/conf.d/default.conf
```

### ACMEの保存先を作る

証明書とアカウント鍵の保存先を、nginxのworkerユーザーが読み書きできるように作ります。

```bash
sudo install -d -m 700 -o nginx -g nginx /var/lib/nginx/acme-engawa
sudo restorecon -R /var/lib/nginx/acme-engawa
```

`restorecon` は、SELinuxのラベルを正しい状態に直すためのコマンドです。

:::caution
このディレクトリには秘密鍵が入ります。権限（`700`）を維持し、サーバーを移設するときも中身を引き継いでください。消してしまうと、証明書を取り直すことになります。
:::

### SELinux を設定する

RHEL系では、既定のままだとnginxが他のプロセス（ここではengawa）へ中継することをSELinuxが禁止します。これを許可します。

```bash
sudo setsebool -P httpd_can_network_connect 1
```

:::caution
この設定を忘れると、nginxのログに `Permission denied` と記録され、ブラウザには502 Bad Gatewayが表示されます。engawa側は正常に動いているので原因がわかりにくく、RHEL系で最もはまりやすい箇所です。
:::

### firewalld を設定する

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

80番はHTTPSへのリダイレクトだけでなく、証明書の初回取得と更新（HTTP-01認証）にも使われます。閉じないでください。

:::caution[3000番は開けないでください]
engawaは `0.0.0.0` で待ち受けるため、3000番を開けるとHTTPSを経由せずに直接アクセスできてしまいます。firewalldで塞いだままにしてください。
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

RHEL系の標準リポジトリにはCaddyが含まれていないため、COPRから入れます。

```bash
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy
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

### firewalld を設定する

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=443/udp
sudo firewall-cmd --reload
```

80番は証明書の取得と更新（HTTP-01認証）に使われるので、閉じないでください。443番のUDPはHTTP/3用です。使わない場合は省いて構いません。

:::caution[3000番は開けないでください]
engawaは `0.0.0.0` で待ち受けるため、3000番を開けるとHTTPSを経由せずに直接アクセスできてしまいます。firewalldで塞いだままにしてください。
:::

### SELinux について

nginxの場合と違い、Caddyでは `httpd_can_network_connect` の設定は通常必要ありません。Caddyのバイナリはnginxのようにウェブサーバーとしてラベル付けされておらず、SELinuxの制限を受けない状態で動作するためです。

もし502エラーが出る場合は、SELinuxが原因かどうかを次のコマンドで確認してください。

```bash
sudo ausearch -m AVC -ts recent
```

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
sudo -u postgres /usr/pgsql-18/bin/pg_dump engawa > /tmp/engawa-backup-$(date +%Y%m%d).sql
```
:::

リリースノートに個別の作業が書かれている場合は、そちらを優先してください。

## うまくいかないときは

| 症状 | 確認すること |
|---|---|
| 502 Bad Gateway | まず `sudo setsebool -P httpd_can_network_connect 1` が実行済みか確認します。RHEL系で最も多い原因です |
| 外部からまったくつながらない | firewalldでhttp/httpsを開けたか（`sudo firewall-cmd --list-services`）確認します |
| HTTPSにつながらない・証明書が発行されない | `ssl_trusted_certificate` を `/etc/pki/tls/certs/ca-bundle.crt` に変えたか、80番が外部から到達できるかを確認します。詳細は `/var/log/nginx/error.log` に出ます |
| `module ... is already loaded` で起動しない | `load_module` の行が `nginx.conf` と `modules-enabled/` で重複しています。どちらか一方にしてください |
| アクセス元IPがすべて同じになる | 設定ファイルの `trustProxy` が抜けています |
| サービスがすぐ落ちる | `sudo journalctl -u engawa -n 50` でエラーを確認します。設定ファイルの書式ミスが多いです |
| データベースに接続できない | `/var/lib/pgsql/18/data/pg_hba.conf` が `scram-sha-256` になっているか、`sudo systemctl reload postgresql-18` を実行したか確認します |
| タイムラインが自動更新されない | nginxのWebSocket設定（`Upgrade` と `Connection` のヘッダー）が抜けていないか確認します |
| ビルドが途中で止まる | メモリ不足です。手順9のスワップ追加を試してください |
| Caddyを使っていて様子がおかしい | `sudo journalctl -u caddy -n 50` でログを確認します |
| 動画のサムネイルが出ない | `ffprobe -version` でffmpegが入っているか確認します。入れた後はengawaの再起動が必要です |

SELinuxが原因かどうかは、次のコマンドで拒否ログを見ると判断できます。

```bash
sudo ausearch -m AVC -ts recent
```

設定ファイルを書き換えたときは、必ず `sudo systemctl restart engawa` で再起動してください。起動中のプロセスには反映されません。
