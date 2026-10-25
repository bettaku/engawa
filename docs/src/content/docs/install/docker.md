---
title: Dockerでインストールする
description: Docker Composeと公開済みのコンテナイメージを使って、engawaを構築する手順
lastUpdated: 2026-10-25
sidebar:
  order: 4
---

Docker Compose を使って engawa を構築する手順です。engawa のコンテナイメージは GitHub Container Registry（`ghcr.io/bettaku/engawa`）で公開されているので、サーバー上でソースコードをビルドする必要はありません。イメージは `linux/amd64` と `linux/arm64` に対応しています。

Dockerを使わずに構築する場合は [systemdでインストールする（Ubuntu / Debian）](/engawa/install/systemd-ubuntu/) または [systemdでインストールする（RHEL系）](/engawa/install/systemd-rhel/) を参照してください。

:::note[この手順で作られるもの]
- engawa本体・PostgreSQL・Valkey の3つのコンテナ（Docker Compose で管理）
- 作業ディレクトリ `~/engawa`（設定ファイルと、アップロードされたファイル・データベース・Valkeyのデータ）
- サーバー上の nginx（またはCaddy）によるHTTPS配信
:::

## 始める前に

### 用意するもの

| 項目 | 目安 |
|---|---|
| サーバー | メモリ2GB以上を推奨。ビルドしないので、systemdで構築する場合より少なくて済みます |
| ドメイン | 例: `example.com`。サーバーのIPアドレスを指すAレコード（IPv6ならAAAAレコード）を先に設定しておきます |
| メールサーバー | 必須ではありませんが、ユーザー登録の確認メールを送るなら必要です |
| オブジェクトストレージ | 必須ではありません。あとから管理画面で設定できます |

:::caution[ドメインは後から変えられません]
`url` に設定したドメインは、一度サーバーを起動して他サーバーと通信を始めると変更できません。テスト用のドメインで始めて後で本番用に移す、ということはできないので、最初から本番のドメインを設定してください。
:::

### 作業の流れ

1. Docker を入れる
2. 作業ディレクトリを作る
3. 使うイメージのバージョンを決める
4. `compose.yml` を書く
5. 設定ファイルを書く
6. 起動する
7. リバースプロキシ（nginx）を立ててHTTPS配信する

以下のコマンドは、`sudo` が使える一般ユーザーで実行してください。

## 1. Docker を入れる

Docker Engine と Docker Compose（v2）を入れます。手順はディストリビューションごとに異なるので、Docker の公式ドキュメントに従ってください。

- [Install Docker Engine](https://docs.docker.com/engine/install/)

入ったか確認します。

```bash
docker --version
docker compose version
```

`docker compose version` で `Docker Compose version v2.` から始まるバージョンが表示されればOKです。

:::note[sudo なしで docker を使う場合]
以降のコマンドは `sudo docker ...` の形でも動きます。毎回 `sudo` を付けたくない場合は、`sudo usermod -aG docker $USER` を実行してからログインし直してください。`docker` グループのユーザーはroot相当の権限を持つことに注意してください。
:::

## 2. 作業ディレクトリを作る

設定ファイルとデータを置くディレクトリを作ります。

```bash
mkdir -p ~/engawa/.config ~/engawa/files ~/engawa/db ~/engawa/redis
cd ~/engawa
```

engawaのコンテナは、UID `991` のユーザーで動きます。アップロードされたファイルを保存できるように、`files` の所有者を変えておきます。

```bash
sudo chown 991:991 files
```

## 3. 使うイメージのバージョンを決める

イメージには次のタグが付いています。

| タグ | 指すもの |
|---|---|
| `1.0.0` のような完全なバージョン | そのバージョンに固定。**本番ではこれを推奨します** |
| `1.0`・`1` | その系列の最新の安定版。新しいバージョンが出ると、自動で付け替わります |
| `latest` | 最新の安定版 |
| `develop` | 開発中の最新版。本番では使わないでください |

公開されているバージョンは [GitHubのリリース一覧](https://github.com/bettaku/engawa/releases) で確認できます。完全なバージョンに固定しておけば、意図しないタイミングでバージョンが上がることがなく、アップデートの前にリリースノートを確認できます。

:::tip[イメージの来歴を確認する]
リリース版のイメージには、GitHub Actions でビルドされたことを示す来歴証明（attestation）が付いています。[GitHub CLI](https://cli.github.com/) が入っていれば、次のコマンドで確認できます。

```bash
gh attestation verify oci://ghcr.io/bettaku/engawa:1.0.0 -R bettaku/engawa
```

`Verification succeeded!` と表示されれば、そのイメージは bettaku/engawa のリポジトリのCIでビルドされたものです。
:::

## 4. compose.yml を書く

`~/engawa/compose.yml` を作ります。

```bash
nano compose.yml
```

次の内容を貼り付けて、`image:` のタグを手順3で決めたバージョンに書き換えます。

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
      # サーバー自身（リバースプロキシ）からだけ接続できるようにします
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

`internal_network` は外部と通信できないネットワークで、PostgreSQLとValkeyはこちらにだけつながります。engawa本体は、他のサーバーと通信するために `external_network` にもつながります。

ValkeyはRedis互換のデータベースです。engawaの設定ファイルではRedisと同じく `redis:` の項目に接続先を書くので、サービス名も `redis` にしています。

`ports` を `"3000:3000"` にすると、リバースプロキシを通さずに外部から直接つながってしまいます。`127.0.0.1:` を外さないでください。

## 5. 設定ファイルを書く

### データベースのパスワードを決める

PostgreSQLのコンテナが初回起動時に使う設定を `.config/docker.env` に書きます。パスワードはランダムな文字列にします。

```bash
openssl rand -hex 24
```

表示された文字列をパスワードとして使います。

```bash
nano .config/docker.env
```

```ini
POSTGRES_USER=engawa
POSTGRES_PASSWORD=ここに生成したパスワード
POSTGRES_DB=engawa
```

このファイルにはパスワードが入るので、自分だけが読めるようにしておきます。

```bash
chmod 600 .config/docker.env
```

:::caution[POSTGRES_* は初回だけ使われます]
`POSTGRES_USER`・`POSTGRES_PASSWORD`・`POSTGRES_DB` は、`db` ディレクトリが空の状態で初めて起動したときにだけ使われます。後からこのファイルを書き換えても、データベースのパスワードは変わりません。
:::

### engawa の設定ファイルを書く

```bash
nano .config/default.yml
```

最低限、次の内容を自分の環境に合わせて書きます。

```yaml
# 公開するURL。末尾のスラッシュは必要です
url: https://example.com/

# コンテナ内でengawaが待ち受けるポート。compose.yml の ports と合わせます
port: 3000

db:
  host: db        # compose.yml のサービス名
  port: 5432
  db: engawa      # docker.env の POSTGRES_DB
  user: engawa    # docker.env の POSTGRES_USER
  pass: ここに生成したパスワード  # docker.env の POSTGRES_PASSWORD

redis:
  host: redis     # compose.yml のサービス名
  port: 6379

# サーバー上のリバースプロキシを信頼します。
# Dockerのコンテナには、プロキシからの接続がDockerネットワークのゲートウェイ（172.x.x.x）から届くので、
# その範囲を指定します。これがないと、すべてのアクセス元IPがゲートウェイのIPとして記録されます
trustProxy:
  - '172.16.0.0/12'

# 管理者アカウントを作るときに入力するパスワード。
# 起動してから管理者アカウントを作るまでの間に、他の人に先に作られるのを防ぎます
setupPassword: ここに別のランダムな文字列

# サーバーを作った後は変更しないでください
id: 'aidx'
```

`setupPassword` にも、`openssl rand -hex 24` で生成した別の文字列を使ってください。

:::note[Dockerネットワークの範囲を確認する]
Dockerは、ネットワークに既定で `172.17.0.0/16`〜`172.31.0.0/16` の範囲を割り当てるので、通常は `172.16.0.0/12` で足ります。Dockerの設定で別の範囲を使っている場合は、起動後に次のコマンドで実際の範囲を確認し、`trustProxy` に書いてください。

```bash
docker network inspect engawa_external_network --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```
:::

`default.yml` にはデータベースのパスワードが入っていますが、コンテナ内のユーザー（UID `991`）が読めるようにしておく必要があります。他のユーザーに見られたくない場合は、`chmod 640 .config/default.yml` と `sudo chgrp 991 .config/default.yml` で、自分とコンテナだけが読めるようにしてください。

他の項目は、リポジトリの [`.config/example.yml`](https://github.com/bettaku/engawa/blob/develop/.config/example.yml) にコメント付きで書かれているので、一度目を通しておくことをおすすめします。設定ファイルと環境変数の関係については [バックエンドの環境変数](/engawa/install/environment-variables/)、データベース接続の細かい調整については [db.extra で指定できる設定](/engawa/install/db-extra/) を参照してください。

## 6. 起動する

イメージを取得して起動します。

```bash
docker compose pull
docker compose up -d
```

engawaのコンテナは、起動するたびにデータベースのマイグレーションを自動で行ってから起動します。初回は数十秒〜数分かかります。ログを見て、起動を待ちます。

```bash
docker compose logs -f web
```

次のような行が出れば起動完了です。<kbd>Ctrl</kbd>+<kbd>C</kbd> でログの表示を終えます（コンテナは止まりません）。

```
DONE *	[core boot]	Now listening on port 3000 on https://example.com
```

サーバー上から応答を確認します。

```bash
curl -fsS http://127.0.0.1:3000/healthz && echo OK
```

`OK` と表示されれば、engawaは動いています。

## 7. リバースプロキシを立ててHTTPS配信する

engawaの前にリバースプロキシを置き、HTTPSで配信します。ここからの手順は、systemdで構築する場合と同じです。engawaは `127.0.0.1:3000` で待ち受けているので、サンプルの設定ファイルはそのまま使えます。

サンプルの設定ファイルはリポジトリの `contrib/` にあります。ソースコードを取得していないので、使うバージョンのものをダウンロードします（`1.0.0` の部分は手順3で決めたバージョンに合わせます）。

```bash
# nginx の場合
curl -fsSLO https://raw.githubusercontent.com/bettaku/engawa/1.0.0/contrib/nginx.sample.conf
# Caddy の場合
curl -fsSLO https://raw.githubusercontent.com/bettaku/engawa/1.0.0/contrib/Caddyfile
```

あとは、systemdの手順のうちリバースプロキシの部分に従ってください。手順中の `/home/engawa/engawa/contrib/...` は、いまダウンロードした `~/engawa/...` のファイルに読み替えます。

- nginx: [手順11 リバースプロキシを立ててHTTPS配信する](/engawa/install/systemd-ubuntu/#11-リバースプロキシを立ててhttps配信する)
- Caddy: [手順11の代替: Caddy でHTTPS配信する](/engawa/install/systemd-ubuntu/#手順11の代替-caddy-でhttps配信する)

ブラウザで `https://example.com` を開いて、初期設定画面が出れば完了です。`default.yml` に書いた `setupPassword` を入力して、管理者アカウントを作ります。最初に作ったアカウントが管理者になります。

## アップデートのしかた

新しいバージョンが出たら、リリースノートを確認してから、`compose.yml` の `image:` のタグを新しいバージョンに書き換えます。

```bash
cd ~/engawa
nano compose.yml
```

イメージを取得して、コンテナを作り直します。マイグレーションは起動時に自動で行われます。

```bash
docker compose pull
docker compose up -d
```

:::caution
アップデート前にデータベースのバックアップを取ってください。マイグレーションは元に戻すのが難しい操作です。

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

`~/engawa` で実行してください。バックアップにはデータベースの全内容が含まれます。上のコマンドは、実行のたびに本人だけが読めるディレクトリを作って保存し、成功すると保存先のパスを表示します。パスが表示されなければ失敗しており、そのときの作業ディレクトリは自動で削除されます。
:::

リリースノートに個別の作業が書かれている場合は、そちらを優先してください。

### 以前の構成（PostgreSQL 15・Redis 7）から移行する

engawa 1.0.0 より前の `compose_example.yml` を元にした環境では、PostgreSQL 15 と Redis 7 を使っています。この手順の `compose.yml` は PostgreSQL 18 と Valkey 9.0 を使うので、イメージを書き換えるだけでは移行できません。

- PostgreSQLは、メジャーバージョンが変わると古いデータディレクトリをそのまま使えません。バックアップを取り、空の状態で起動したPostgreSQL 18にリストアします
- PostgreSQL 18のイメージはデータの置き場所が変わったため、マウント先も `/var/lib/postgresql/data` から `/var/lib/postgresql` に変わります。古い `db` ディレクトリのまま起動すると、エラーにならずに空のデータベースが作られてしまいます
- Valkey 9.0は、Redis 7が保存したデータをそのままでは読めず、起動に失敗します。一度だけ変換してから起動します

以下は `~/engawa` で実行してください。

1. engawaを止めます。

   ```bash
   docker compose stop web
   ```

2. 上の「アップデートのしかた」のコマンドで、データベースのバックアップを取ります。表示された保存先のパスを控えておきます。

3. すべてのコンテナを止めて、古いデータベースを退避します。Redisは、止まるときにデータを `redis` ディレクトリに保存します。

   ```bash
   docker compose down
   mv db db-pg15
   ```

4. `compose.yml` の `redis` と `db` を、次の内容に書き換えます（「4. compose.yml を書く」と同じ内容です）。

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

5. Redisのデータを、Valkeyが読める形式に変換します。

   ```bash
   docker run --rm -v "$PWD/redis:/data" valkey/valkey:9.0-alpine sh -c 'valkey-server --rdb-version-check relaxed --daemonize yes && until valkey-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done && valkey-cli save && valkey-cli shutdown nosave'
   ```

   `OK` と表示されれば変換できています。Redisにはキャッシュのほか、配送待ちのジョブなども入っているので、削除せずに変換することをおすすめします。

6. PostgreSQL 18を起動して、バックアップをリストアします。`~/engawa-backup-XXXX/engawa.sql` は、手順2で控えたパスに置き換えます。

   ```bash
   docker compose up -d --wait db
   docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ~/engawa-backup-XXXX/engawa.sql
   ```

   新しいデータベースとユーザーは `docker.env` の `POSTGRES_*` で作られます。`docker.env` を後から書き換えていた場合は、先に `default.yml` の `db:` の値と合わせておいてください。

7. engawaを起動します。

   ```bash
   docker compose up -d
   ```

動作に問題がないことを確認したら、`db-pg15` ディレクトリは削除して構いません。

### ソースコードからイメージをビルドする

公開されているイメージを使わず、自分でビルドすることもできます。ビルドにはメモリを多く使うので、4GB以上を推奨します。

```bash
git clone --recursive https://github.com/bettaku/engawa.git ~/engawa-src
```

`compose.yml` の `image:` の行を、次のように `build:` に置き換えます。

```yaml
  web:
    build: ../engawa-src
```

```bash
docker compose build
docker compose up -d
```

アップデートするときは、`~/engawa-src` で `git pull` と `git submodule update --init` をしてから、もう一度ビルドします。

## うまくいかないときは

| 症状 | 確認すること |
|---|---|
| `web` コンテナがすぐ落ちる・再起動を繰り返す | `docker compose logs web` でエラーを確認します。設定ファイルの書式ミスが多いです |
| `EACCES: permission denied` でファイルを保存できない | `files` の所有者が `991:991` になっているか確認します（手順2） |
| 設定ファイルを読み込めない | `.config/default.yml` がUID `991` から読めるか確認します（手順5） |
| データベースに接続できない | `default.yml` の `db.user`・`db.pass`・`db.db` が `docker.env` と一致しているか確認します。`docker.env` を後から変えても、既存のデータベースには反映されません |
| 502 Bad Gateway | `docker compose ps` で `web` が `healthy` になっているか、`compose.yml` の `ports` と nginx の `proxy_pass` の番号が一致しているかを確認します |
| アクセス元IPがすべて同じになる | `default.yml` の `trustProxy` が抜けているか、Dockerネットワークの範囲と合っていません（手順5） |
| イメージを取得できない | `image:` のタグが存在するか、[パッケージのページ](https://github.com/bettaku/engawa/pkgs/container/engawa) で確認します |
| タイムラインが自動更新されない | nginxのWebSocket設定（`Upgrade` と `Connection` のヘッダー）が抜けていないか確認します |

設定ファイルを書き換えたときは、`docker compose restart web` で再起動してください。起動中のプロセスには反映されません。
