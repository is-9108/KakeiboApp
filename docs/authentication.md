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
3. User Poolで自己サインアップを禁止する
   - マネジメントコンソールの **Sign-up experience → Self-service sign-up** で自己登録を無効にする（管理者作成ユーザーのみ許可）。
   - AWS CLIでは `AdminCreateUserConfig.AllowAdminCreateUserOnly=true` が該当する。設定値を確認する例：
     ```bash
     aws cognito-idp describe-user-pool --user-pool-id <POOL_ID> \
       --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly'
     ```
     CLIで `update-user-pool --admin-create-user-config AllowAdminCreateUserOnly=true` を使う場合、Cognitoは省略された既存設定を既定値へ戻すことがある。`describe-user-pool` で既存設定を保存し、他のUser Pool設定を保持したうえで更新すること。既存設定の扱いに不慣れな場合はコンソールで変更する。
   - 設定後、未認証のSignUp APIが拒否されることを確認する。アプリに登録画面がないことだけではサインアップ無効の証明にならない。
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
   ※一時パスワードにする場合は `--no-permanent` を指定する。フロントの初回ログインでパスワード変更画面が出る。

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
- `COGNITO_USER_POOL_ID` は `<COGNITO_REGION>_<Pool ID>` の形式、App Client IDは英数字であることをAPI起動時に検証する。

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
- 実Cognitoでの手動確認（ログイン・初回パスワード変更・ログアウト・自己登録無効）は自動テストではカバーしない。PR #17ではログイン・ページ表示まで確認済みとの報告がある。他の項目とAPIのHTTP 200、自己登録拒否の実環境確認は未確認のため、マージ前に確認して結果を記録する。

## 既知の制約

- アクセストークンなどのCognitoセッション情報は`sessionStorage`に保存され、現在のタブに限定される。タブを閉じると消去される。`signOut()`でAmplify側セッションとトークンを消す。
- ログアウト済みでも、Aトークンをコピーしていたユーザーはトークンの`exp`までAPIを呼べる（JWT検証の限界：取り消し機構はこのissueでは入れない）。
