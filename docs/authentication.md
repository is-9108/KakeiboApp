# 認証（Amazon Cognito）の設定と確認手順

`issue #5（Cognito認証の導入）`で導入した認証の、初期設定・ローカルでの動作確認・テスト方針のメモ。

## 全体像

- APIはCognito発行の**アクセストークン**（JWT）を検証する。対象は`/api/*`の全エンドポイント。`GET /health`のみ匿名可。
- 検証内容：署名（User PoolのJWKS公開鍵）・`iss`（発行者）・`exp`（期限切れ、ClockSkew=0）・`token_use=access`・`client_id`（App Client一致）。IDトークン・別User Poolのトークンは401。
- フロントエンドはAWS Amplify Auth（aws-amplify v6）でCognitoと通信する。**サインアップ導線は存在しない**（Cognito側でも無効化する）。
- 未ログインでどのURLを開いてもログイン画面を表示する。ログイン後は仮ページ（月次画面の代わり）。初回ログイン時はCognitoの`CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED`チャレンジでパスワード変更画面を出す。

## Cognito側の初期設定（管理者が手動で行う）

1. User Poolを作成（リージョンは任意。例：ap-northeast-1）
2. **App Client** を作成
   - 認証フロー：`ALLOW_USER_SRP_AUTH`（ユーザー名・パスワードのSRP）
   - **シークレットキーなし**（SPA用）
   - サインアップAPIを明示的に許可しない（↓の手順で無効化）
3. User Poolのポリシー設定でサインアップを無効化する（▽ 自己サインアップ防止）
   - AWS CLIの場合：`aws cognito-idp update-user-pool --user-pool-id <POOL_ID> --policies ... --user-attribute-update-settings ...`
   - またはマネジメントコンソールで「Self-service account recovery / Sign-up」を確認
4. ユーザーは**管理者が作成**する：
   ```bash
   aws cognito-idp admin-create-user \
     --user-pool-id <POOL_ID> \
     --username user@example.com \
     --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
     --message-action SUPPRESS
   aws cognito-idp admin-set-user-password \
     --user-pool-id <POOL_ID> --username user@example.com \
     --password '<恒久パスワード>' --permanent
   ```
   ※`--permanent false`（一時パスワード）にした場合は、フロントの初回ログインでパスワード変更画面が出る（正常系）。

## ローカル環境での設定

`.env` に値を設定する（`.env.example` をコピー）：

```
COGNITO_REGION=ap-northeast-1
COGNITO_USER_POOL_ID=ap-northeast-1_xxxxxxxx
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxx
```

- APIには `Cognito__*` 環境変数として渡る（`docker-compose.yml`参照）。
- フロントには `VITE_COGNITO_*` として渡る（Viteの環境変数仕様：`import.meta.env`）。
- **値を空にすると**、APIはテスト用プレースホルダ値（authは実Cognitoに到達できないが、テストは通る）で起動する。実Cognito確認のときは必ず実値を設定する。

## ローカルでの起動と確認

```bash
docker compose up -d
# ブラウザで http://localhost:5173 を開く
# 未ログイン → ログイン画面
# 管理者作成ユーザーでログイン → 仮ページ（取得した収支一覧または「登録されている収支はありません。」）
# ログアウト → ログイン画面に戻る
```

API認証の疎通（curl例）：

```bash
# トークンなし → 401
curl -i http://localhost:8080/api/entries?month=2031-01
# /health → 200
curl -i http://localhost:8080/health
# 有効なアクセストークン → 200
TOKEN='eyJ...' # ログイン後のアクセストークン
curl -i -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/api/entries?month=2031-01'
```

※Viteのプロキシ：ブラウザからは `/api/*` でアクセスし、Viteが `http://api:8080` に転送する（`vite.config.ts` の `server.proxy`）。

## テスト方針

- **API側の認証テストは実Cognitoに依存しない。** テスト用RSA鍵ペア（`TestSigningKeys`）で署名したトークンを、アプリ側はその公開鍵で検証する（`KakeiboApiTestFactory` がJWKSを差し替える）。CIでもAWS認証情報は不要。
- **フロントのテストはaws-amplifyをモックする**（`vi.mock`）。実Cognitoへの通信は発生しない。
- 正常系・異常系（不正署名・期限切れ・iss/client_idクレーム不正・IDトークン・欠落）・境界値（`exp`が現在時刻−1秒）を `api/tests/Authentication/AuthGuardTests.cs` でカバーしている。
- 実Cognitoでの手動確認（ログイン・初回パスワード変更・ログアウト・自己登録無効）はPR作成者が行う（自動テストではカバーしない）。

## 既知の制約

- アクセストークンは`sessionStorage`等に保存されなくなった（Amplify v6の既定ロケーションはブラウザのローカルストレージ）。`signOut()`でAmplify側セッションとトークンを消す。
- ログアウト済みでも、Aトークンをコピーしていたユーザーはトークンの`exp`までAPIを呼べる（JWT検証の限界：取り消し機構はこのissueでは入れない）。
