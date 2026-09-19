# 本番用リバースプロキシ設定

`nginx.sample.conf` または `Caddyfile` のどちらかを使用します。同一ホスト上の
engawa (`127.0.0.1:3000`) をインターネットへ直接公開する構成です。
HTTPS、証明書の自動更新、WebSocket、ActivityPub、ファイルアップロードに対応します。

## 共通の準備

1. 設定内の `engawa.example.com` と `admin@example.com` を実際のドメイン・連絡先に置き換えます。
2. ドメインの A レコードをサーバーへ向けます。AAAA を設定する場合は IPv6 でも到達できることを確認します。
3. 外部から TCP 80/443 への接続を許可します。80 は証明書の初回取得・更新にも必要です。
   Caddy の HTTP/3 を利用する場合は UDP 443 も許可します。
4. アプリの `.config/default.yml` に次を設定し、アプリを再起動します。

   ```yaml
   url: https://engawa.example.com/
   port: 3000
   trustProxy:
     - '127.0.0.1/32'
     - '::1/128'
   ```

5. **3000 番ポートをインターネットへ公開しないでください。** アプリは現在 `0.0.0.0` で
   待ち受けるため、通常起動ではファイアウォールで外部からの接続を遮断します。
   ホスト上のプロキシから Docker のアプリへ接続する場合は Compose のポート設定を
   `"127.0.0.1:3000:3000"` に変更します。Docker 経由ではアプリから見たプロキシの
   送信元 IP が変わるため、実際の送信元 IP/CIDR のみに `trustProxy` を調整してください。

プロキシもコンテナで動かす場合は、上流を `web:3000` などのサービス名に変更し、
アプリの `ports` を削除して共有する非公開ネットワーク経由で接続します。
`trustProxy: true` ではなく、そのネットワークのプロキシの IP/CIDR のみを指定してください。

これらの例は CDN・ロードバランサーを前段に置かない構成です。前段を追加する場合は、
その送信元だけをプロキシ側でも信頼する設定と、オリジンへの接続制限が必要です。

## nginx

nginx 1.29.0 以降と、同じバージョンに対応する公式 `nginx-module-acme` パッケージ、
SSL/HTTP2 モジュール、OS の `ca-certificates` が必要です。
`nginx.conf` の main コンテキスト（`http {}` の外）で ACME モジュールを一度だけ読み込みます。
パッケージが自動で読み込む場合、重複して追加しないでください。

```nginx
load_module modules/ngx_http_acme_module.so;
```

`nginx.sample.conf` を `/etc/nginx/conf.d/engawa.conf` に配置し、`nginx.conf` の
`http {}` 内から読み込みます。このファイル自体は完全な `nginx.conf` ではありません。
モジュールのパス、CA バンドルのパス、DNS リゾルバーは環境に合わせて変更してください。

ACME の保存先を nginx の **worker 実行ユーザー** が読み書きできるよう作成します。
以下はユーザー・グループが `nginx` の場合です（環境によっては `www-data` など）。

```sh
sudo install -d -m 700 -o nginx -g nginx /var/lib/nginx/acme-engawa
sudo nginx -t
sudo systemctl reload nginx
```

初回は nginx サービスを起動します。HTTP-01 認証はモジュールが処理するので、
Certbot や challenge 用の webroot は不要です。初回発行が終わるまで HTTPS は使えません。
発行・更新エラーは nginx のエラーログで確認します。
`accept_terms_of_service` は Let's Encrypt の利用規約への同意を表します。
`/var/lib/nginx/acme-engawa` は秘密鍵を含むため権限を維持して永続化し、再配置時にも引き継ぎます。

## Caddy

現行の安定版 Caddy 2 を使用し、`Caddyfile` を `/etc/caddy/Caddyfile` に配置します。
標準モジュールだけで動作します。

```sh
caddy fmt --diff /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

初回は Caddy サービスを起動します。証明書管理と HTTP → HTTPS のリダイレクトは自動です。
公式 systemd サービスでは `/var/lib/caddy`、公式 Docker イメージでは `/data` と `/config` を
永続化してください。証明書の状態・秘密鍵が保存されるデータディレクトリを公開しないでください。

## 運用時の確認

- `curl -I http://engawa.example.com/` で HTTPS へのリダイレクトを確認します。
- `curl -I https://engawa.example.com/` で有効な証明書とアプリの応答を確認します。
- ログイン、ファイルアップロード、タイムラインのリアルタイム更新、他サーバーとの配送を確認します。
- リクエスト全体の上限は 256 MiB です。アプリの既定の `maxFileSize`（250 MiB）に
  multipart の余裕を加えています。上限を増やす場合はアプリとプロキシの両方を変更します。
- API や認証済みレスポンスの共有キャッシュは行いません。キャッシュ制御と HSTS はアプリに任せます。
- アクセスログは無効です。追加する場合は、WebSocket 等の URL に含まれる認証トークンを
  保存しない形式にしてください。エラーログにも URL が含まれる場合があるため、閲覧権限と保持期間を管理します。

参照: [nginx ACME](https://nginx.org/en/docs/http/ngx_http_acme_module.html)、
[Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、
[Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)。
