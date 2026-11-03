# AWS へのデプロイ手順

初回構築は Issue #7 の手動手順で行い、更新は Issue #25 の GitHub Actions CD で自動化します。main へのマージ後、同じコミットの CI が成功し、人間が production Environment で承認すると、マイグレーション・Terraform plan/apply・フロントの配置を実行します。初回の AWS・Neon・Cognito の構築、IAM/OIDC の作成、GitHub の設定、実環境確認はユーザーが実施します。CI は AWS 認証情報を使いません。デプロイのワークフローだけが OIDC で AWS に認証します。設定と運用は15章を参照してください。

## 1. 責任分界、構成、費用の発生箇所

### 責任分界

| 作業 | 実施主体 |
|---|---|
| Terraform 定義・スクリプト・手順書の整備 | 実装側（このリポジトリ） |
| Cognito User Pool / App Client の作成・設定 | ユーザー |
| Neon プロジェクト・DB・ロールの作成 | ユーザー |
| Secrets Manager シークレットの作成・更新 | ユーザー |
| マイグレーション SQL の確認・適用 | 初回はユーザー、更新時は人間の承認後に CD が生成・適用 |
| **state 用 S3 バケットの bootstrap** | ユーザー |
| **Terraform の plan 作成・apply** | 初回はユーザー、更新時は人間の承認後に CD（承認は plan 作成前） |
| フロントエンドのビルド・S3 配置・キャッシュ更新 | 初回はユーザー、更新時は人間の承認後に CD |
| IAM/OIDC の作成・GitHub Environment と Variables / Secrets の設定 | ユーザー |
| 実環境の受け入れ確認（R1〜R5） | ユーザー |

Terraform は CloudFormation スタックを使いません。初回の実 AWS への `terraform plan`／`apply` はユーザーが実施し、更新時は承認後に CD が行います。実装作業中と CI の検証では実 AWS への plan／apply は行いません。

> 既存の SAM スタックが実アカウントに残っている場合は、同じリソースを二重管理しないでください。CloudFormation の管理解除や Terraform への import は別途の移行計画が必要です。この手順書は新規構築を前提にしています。

### 構成

```text
ブラウザ
  ├─ Cognito（既存 Amplify による SRP 認証）
  └─ CloudFront（HTTPS、デフォルトドメイン）
       ├─ /api、/api/*  → API Gateway HTTP API（$default）→ Lambda → Neon
       ├─ /health       → API Gateway HTTP API（$default）→ Lambda
       └─ その他        → 非公開 S3（OAC）＋ CloudFront Function で SPA フォールバック
```

- S3 はウェブサイトホスティングを使わず、Block Public Access を全有効にします。CloudFront だけが OAC で読み取ります。
- API は同一 CloudFront オリジン配下の `/api` で提供するため、既存フロントの相対 URL を変更しません。CORS は追加しません。
- API Gateway の JWT Authorizer は使わず、既存の ASP.NET Core Cognito 認証で検証します。
- Lambda は `provided.al2023`、`linux-x64` の自己完結 ZIP、`bootstrap` 実行ファイルです。通常のローカル実行（Kestrel）は従来どおりです。
- Lambda の起動時マイグレーションは本番では無効です。スキーマは CD または手動で明示適用した SQL で管理します。
- Terraform の state は、ユーザーが事前作成する S3 バケットに保存し、S3 native lockfile でロックします（DynamoDB は使いません）。
- フロント用 S3 バケットは `prevent_destroy = true` と `force_destroy = false` で保護します。通常の `terraform destroy` では削除されません。

### 費用の発生箇所

個人利用・最小構成ですが、**無料構成ではありません**。少なくとも次に費用が発生します。

- CloudFront（転送量・リクエスト数。無料枠あり）
- S3（フロント成果物・Lambda ZIP・**Terraform state** の保存量とリクエスト数。無料枠あり）
- API Gateway HTTP API（リクエスト数。無料枠あり）
- Lambda（リクエスト数・実行時間。無料枠あり）
- **Secrets Manager（シークレット 1 件あたりの固定費）**
- Neon（無料枠の範囲内なら無料。プラン・使用量による）
- Cognito（無料枠の範囲内なら無料。MAU 課金）
- CloudWatch Logs（保存量。必要なら保持期間を設定）
- CloudFront のキャッシュ無効化（無料枠を超えると従量）
- state バケットの versioning による過去バージョンの保存量（小さいが継続的に増える）

## 2. 前提ツール・バージョン、AWS アカウントと IAM 権限

### 前提ツール

| ツール | 目安 |
|---|---|
| Terraform | **1.17.1**（CI・この手順書で固定。`infra/versions.tf` の制約と合わせる） |
| AWS CLI | v2 |
| .NET SDK | 10.0.x（`global.json` は未使用。CI は 10.0.x） |
| Node.js / npm | Node.js 20 以上（CI は 22） |
| zip / unzip | パッケージ作成・確認に使用 |
| psql | PostgreSQL クライアント（Neon の SQL Editor でも可） |
| jq | シークレット・Cognito 入力 JSON の作成に使用（1.6 以上） |

バージョン確認：

```bash
terraform version
aws --version
dotnet --version
node --version
psql --version
```

Terraform は S3 native lockfile（`use_lockfile`）、`mock_provider` によるテスト、保持用の `removed` ブロックに対応した版を使います。CI と手順書は 1.17.1 に固定しています。AWS provider は `~> 6.71` に制約し、実際に検証した解決版を `infra/.terraform.lock.hcl` に保存・追跡します。

### AWS アカウントと IAM 権限

AWS 資格情報は profile や通常の credential chain で渡し、tfvars・backend 設定・リポジトリへ埋め込まないでください。

```bash
export AWS_PROFILE=kakeibo-deploy
export AWS_REGION=ap-northeast-1
```

デプロイ実行主体には少なくとも次が必要です。

- **state 用 S3**: `s3:ListBucket`、`s3:GetBucketLocation`、`s3:GetBucketVersioning`、`s3:GetObject`、`s3:PutObject`、`s3:DeleteObject`（lockfile の削除を含む）。state バケットを SSE-KMS にする場合は KMS の暗号化・復号権限も必要です。
- **アプリ用 S3**: バケットの作成・設定、オブジェクトのアップロード
- **CloudFront**: Distribution・Function・OAC の作成・更新・無効化
- **API Gateway HTTP API**、**Lambda** 関数の作成・更新
- **IAM**: Lambda 実行ロールとポリシー添付の作成。Lambda へロールを渡す `iam:PassRole`
- **CloudWatch Logs** の参照
- **Secrets Manager の `GetSecretValue`**: `data` 参照を plan／apply 時に解決するため

Lambda 実行ロールに Secrets Manager の読み取り権限は不要です。接続文字列は plan／apply 時に Lambda の環境変数へ解決され、実行時に SDK で取得しません。ただし Lambda の環境設定を読める IAM 権限は秘密情報へのアクセス権として扱ってください。

リージョンは例として `ap-northeast-1` を使います。実際の値へ読み替えてください。

## 3. Cognito の再利用／作成、自己登録禁止、管理者ユーザー作成

User Pool / App Client は **Terraform の管理対象外**です。既存の Pool を再利用するか、手動で作成します。Terraform の destroy でも Cognito は残ります。

### 既存 Pool を再利用する場合

次を確認します。

- 自己サインアップが無効（`AdminCreateUserConfig.AllowAdminCreateUserOnly=true`）
- SPA 用 App Client がシークレットなし
- 認証フローに `ALLOW_USER_SRP_AUTH` がある
- 管理者がユーザーを作成している

```bash
aws cognito-idp describe-user-pool --user-pool-id <POOL_ID> \
  --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly'
```

`true` 以外なら、コンソールの **Sign-up experience → Self-service sign-up** で無効化します。CLI の `update-user-pool` は省略した既存設定を既定値へ戻すことがあるため、コンソールでの変更を推奨します。

### 新規に作成する場合

コンソールで次を設定します。

1. User Pool を作成（リージョンは Lambda と同じにする。例 `ap-northeast-1`）
2. 自己サインアップを無効化
3. App Client を作成
   - シークレットなし（SPA 用）
   - `ALLOW_USER_SRP_AUTH` を許可
   - サインアップ API を許可しない
4. 管理者ユーザーを作成

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
```

恒久パスワードは `read -s` で読み、`--cli-input-json` の一時ファイル経由で渡します。実パスワードをコマンド引数・シェル履歴へ残さないでください。コンソールでユーザー作成・パスワード設定を行う場合は、次の CLI 例は不要です。

```bash
read -rsp '恒久パスワード: ' COGNITO_PASSWORD; echo
(
  set -e
  umask 077
  INPUT_FILE=$(mktemp)
  trap 'rm -f "$INPUT_FILE"' EXIT
  COGNITO_PASSWORD="$COGNITO_PASSWORD" jq -n --arg pool '<POOL_ID>' --arg user 'user@example.com' '{
    UserPoolId: $pool,
    Username: $user,
    Password: $ENV.COGNITO_PASSWORD,
    Permanent: true
  }' > "$INPUT_FILE"
  aws cognito-idp admin-set-user-password --cli-input-json "file://$INPUT_FILE"
)
unset COGNITO_PASSWORD
```

### 控えておく値

- `cognito_region`（例 `ap-northeast-1`）
- `cognito_user_pool_id`（例 `ap-northeast-1_xxxxxxxxx`）
- `cognito_app_client_id`（例 `xxxxxxxxxxxxxxxxxxxxxxxxxx`）

これらは API の `Cognito__*` とフロントの `VITE_COGNITO_*` に使います。ブラウザへ公開される識別情報であり、秘密鍵・パスワードではありません。ただし実環境固有値はリポジトリへ保存しないでください。

## 4. Neon の作成、direct / pooled endpoint、TLS、DB ロール

### プロジェクトと DB

Neon でプロジェクトを作成し、データベース（例 `kakeibo`）を作成します。リージョンは AWS 側（例 `ap-northeast-1`）に近い場所を選びます。

### endpoint の使い分け

Neon は 2 種類のホスト名を提供します。

| 用途 | endpoint | 使う場面 |
|---|---|---|
| API（Lambda） | **pooled**（ホスト名に `-pooler` を含む） | 通常の CRUD |
| マイグレーション | **direct**（`-pooler` を含まない） | `psql` での DDL 適用、権限付与 |

Lambda は pooled endpoint を使います。マイグレーションは direct endpoint とスキーマ変更権限を持つロールで実行します。

### DB ロール

- マイグレーション用：DB 所有者または DDL 権限を持つロール
- API 用：必要なテーブル・シーケンスだけを操作できる実行用ロール（例 `kakeibo_app`）

マイグレーション適用後に、所有者ロールで API 用ロールへ権限を付与します。

```sql
GRANT CONNECT ON DATABASE kakeibo TO kakeibo_app;
GRANT USAGE ON SCHEMA public TO kakeibo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kakeibo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kakeibo_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kakeibo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kakeibo_app;
```

### API 用接続文字列

URI ではなく **Npgsql 形式**で設定します。ユーザーが入力・更新する実値の保存先は Secrets Manager で、tfvars には ARN だけを渡します。ただし Terraform が `data` 参照した値は、Lambda の環境変数・Terraform state・保存 plan にも保存されます（「5.」の秘密管理を参照）。

```text
Host=<pooled-host>;Port=5432;Database=kakeibo;Username=kakeibo_app;Password=<password>;SSL Mode=VerifyFull;Pooling=true;Minimum Pool Size=0;Maximum Pool Size=5;Timeout=15
```

- `SSL Mode=VerifyFull` を基本とし、証明書検証を無効化しないでください（`Trust Server Certificate=true` を本番で使わない）。
- 接続タイムアウトは初期値 15 秒です。実環境で調整します。
- pooled endpoint 経由ではセッション状態に依存する設定や一時オブジェクトを使いません。自動 prepare は有効化しません。
- Neon の無料枠は一定時間で休止します。休止後の初回アクセスは復帰待ちで遅くなります。Lambda のタイムアウトは初期値 25 秒です。超える場合は `infra/lambda.tf` の `timeout` と `memory_size` を調整して再 apply します。

## 5. Secret 作成、S3 backend の bootstrap、state／plan の秘密管理

### Secret の作成

接続文字列は **AWS Secrets Manager の SecretString** に JSON で保存します。キー名は `connectionString` です。

```json
{"connectionString":"Host=<pooled-host>;Port=5432;Database=kakeibo;Username=kakeibo_app;Password=<password>;SSL Mode=VerifyFull;Pooling=true;Minimum Pool Size=0;Maximum Pool Size=5;Timeout=15"}
```

パスワードをコマンド引数やシェル履歴へ残さないため、`read -s` と一時ファイルを使います。`jq` へは環境変数 `$ENV.DB_PASSWORD` で渡し、`--arg` のようにプロセス引数へ実値を出しません。

```bash
read -rsp 'Neon の API 用パスワード: ' DB_PASSWORD; echo
(
  set -e
  umask 077
  SECRET_FILE=$(mktemp)
  trap 'rm -f "$SECRET_FILE"' EXIT
  DB_PASSWORD="$DB_PASSWORD" jq -n '{
    connectionString: ("Host=<pooled-host>;Port=5432;Database=kakeibo;Username=kakeibo_app;Password=" + $ENV.DB_PASSWORD + ";SSL Mode=VerifyFull;Pooling=true;Minimum Pool Size=0;Maximum Pool Size=5;Timeout=15")
  }' > "$SECRET_FILE"
  aws secretsmanager create-secret \
    --name kakeibo/database \
    --description 'Kakeibo API database connection string' \
    --secret-string "file://$SECRET_FILE"
)
unset DB_PASSWORD
```

- 一時ファイルは `umask 077` と `mktemp` で作成し、サブシェル終了時（失敗時を含む）に `trap` で削除します。
- Terraform はこの Secret を `data.aws_secretsmanager_secret_version` で参照するだけで、作成・更新・削除は行いません。

シークレット ARN を控えます（ARN 自体は秘密ではありません）。

```bash
aws secretsmanager describe-secret --secret-id kakeibo/database --query ARN --output text
```

### state 用 S3 バケットの bootstrap

state バケットは **アプリの Terraform とは別に、ユーザーが最初に一度だけ**作成します。アプリ root module の管理下に置かないため、アプリを削除しても state は残ります。

- 非公開・暗号化（SSE-S3 または顧客管理 KMS）・versioning 有効
- パブリックアクセス全ブロック
- バケット名はグローバルに一意（例 `kakeibo-terraform-state-<account-id>`）

```bash
STATE_BUCKET='kakeibo-terraform-state-<account-id>'
STATE_REGION='ap-northeast-1'

aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$STATE_REGION" \
  --create-bucket-configuration LocationConstraint="$STATE_REGION"

aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-ownership-controls --bucket "$STATE_BUCKET" \
  --ownership-controls '{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}'
```

- `us-east-1` を使う場合、`create-bucket` の `LocationConstraint` は不要です。
- 顧客管理 KMS を使う場合は、Terraform 実行主体と state バケットへ必要な KMS 権限を付与します。

### backend 設定

`infra/backend.tf` は部分設定です。実環境の bucket／key／region は、追跡対象外の `infra/backend.s3.hcl` に置きます。

```bash
cp infra/backend.s3.hcl.example infra/backend.s3.hcl
# エディタで bucket / key / region を実値へ変更する
```

`infra/backend.s3.hcl` は `.gitignore` 済みです。`use_lockfile = true` と `encrypt = true` は `infra/backend.tf` で固定しています。新規に DynamoDB の lock テーブルは作りません。

backend の bucket／key／region を変更する場合は、**state を新しい保存先へ移行**します。`-reconfigure` は state を移行せず、新しい保存先から再解釈するため、この用途には使わないでください。

1. 現在の backend に接続した状態で、state を追跡対象外の場所へバックアップします。state は秘密情報を含みます。

```bash
umask 077
mkdir -p .artifacts
terraform -chdir=infra state pull > ".artifacts/terraform-state-backup-$(date +%Y%m%dT%H%M%S).tfstate"
```

2. 変更後の `infra/backend.s3.hcl` を設定し、state 移行を伴う初期化を行います。確認プロンプトではコピーを承認します。

```bash
terraform -chdir=infra init -migrate-state -backend-config=backend.s3.hcl
```

3. 移行後に state の対応が維持されていることを確認します。

```bash
terraform -chdir=infra state list
terraform -chdir=infra plan
```

- `state list` のリソース数・アドレスが移行前と一致し、`plan` に意図しない create／destroy が出ないことを確認します。
- 問題があれば、バックアップと元の backend 設定へ戻し、原因を確認します。バックアップは移行確認が終わるまで削除しないでください（秘密情報として扱います）。
- `-reconfigure` は、保存先を変えずに backend 設定（認証情報など）を再評価する場合だけ使います。バケット・key・リージョンの変更には使わないでください。

初回の初期化は「8.」で行います。

### state／保存 plan は秘密情報として扱う

Secret を `data` 参照し、その値を Lambda の環境変数へ注入するため、**接続文字列は tfstate に保存され、保存 plan にも含まれます。** これはユーザー承認済みの運用です。`sensitive` は表示を抑えるだけで、state への保存や暗号化を防ぎません。「実値は Secrets Manager にだけ保存される」とは考えないでください。

- **state バケット**を秘密情報の保管先として、最小権限・非公開・暗号化・versioning で管理します。
- state と保存 plan には、過去に使ったパスワードも残ります。**Secret を更新しても、既存の state の過去バージョン、バックアップ、保存 plan から旧資格情報は消えません。**
- state・plan・backend 設定を、リポジトリ、Issue、PR、レビュー添付、CI artifact、チャット、ログへ公開しないでください。
- 保存 plan は `.artifacts/` など追跡対象外の場所へ `umask 077` で作成し、apply 後は不要になった plan を削除します（「8.」参照）。
- `terraform show` や `terraform output` の結果にも秘密情報が含まれ得ます。画面共有・記録へ貼らないでください。
- `TF_VAR_*` を使っても state 保存は避けられません。state を秘密情報から切り離す目的で `-refresh=false` を使わないでください（Secret 更新の反映漏れにもつながります）。

## 6. マイグレーション SQL の生成・確認・適用

### 生成

リポジトリルートで実行します。

```bash
./infra/scripts/generate-migration-sql.sh
```

- `api/.config/dotnet-tools.json` で固定した `dotnet-ef` を `dotnet tool restore` で復元します。
- 出力：`.artifacts/migrations/migrate.sql`（冪等 SQL）
- Lambda の起動時にはこの SQL を実行しません。

### 確認

次を確認します。

- `__EFMigrationsHistory` の作成と、適用済みマイグレーションのスキップ条件がある
- `CREATE TABLE` などの DDL が想定した差分だけである
- 接続先ホストやパスワードが SQL に含まれていない
- トランザクションと `ON_ERROR_STOP` で失敗時に停止できる

### 適用

Neon の **direct endpoint** と所有者ロールで `psql` を使います。接続情報は環境変数で渡し、コマンド引数へパスワードを書かないでください。

```bash
export PGHOST='<direct-host>'
export PGPORT=5432
export PGDATABASE='kakeibo'
export PGUSER='<owner_user>'

read -rsp 'DB パスワード: ' PGPASSWORD; export PGPASSWORD
psql -v ON_ERROR_STOP=1 -f .artifacts/migrations/migrate.sql

unset PGPASSWORD
```

- `ON_ERROR_STOP=1` を必ず使います。
- 初回適用後、同じ SQL をもう一度実行して成功する（冪等）ことを確認します。
- 適用後に「4. Neon」の権限付与 SQL を実行します。
- 失敗時は自動 downgrade をしません。Neon のブランチ／バックアップを確認し、原因を直してから再実行します。

## 7. Lambda パッケージ作成、Terraform の検証

### パッケージ作成

Docker は使いません。リポジトリルートで実行します。

```bash
./infra/scripts/package-api.sh
```

- `linux-x64`・自己完結・`AssemblyName=bootstrap` で publish します。
- 出力：`.artifacts/api.zip`（ZIP 直下に実行権限付き `bootstrap`）
- スクリプトは ZIP 直下の `bootstrap` と実行権限を検証し、失敗時は非ゼロで終了します。
- `appsettings.Development.json` と `*.pdb` はパッケージに含めません。

確認：

```bash
unzip -l .artifacts/api.zip | grep -E ' bootstrap$| bootstrap\.dll$'
```

Terraform はこの ZIP をビルドせず、内容ハッシュを key と `source_code_hash` に使ってコード配布用 S3 へアップロードします。

### Terraform の検証（AWS 認証情報・state 不要）

```bash
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false -input=false
terraform -chdir=infra validate
terraform -chdir=infra test
node --test infra/tests/spa-rewrite.test.mjs
```

- `init -backend=false` は state バケットへ接続せず、provider だけを取得します。
- `terraform test` は `mock_provider "aws"` と `command = plan` を使い、実 AWS を参照・変更しません。
- 構成テストはテスト専用のダミー ZIP を使うため、`package-api.sh` の実行順に依存しません。

Terraform CLI がホストにない場合は、固定版の公式 Docker イメージで同じ検証ができます。`--user` を付け、リポジトリ内のファイルを root 所有にしないようにしてください。

```bash
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/workspace -w /workspace hashicorp/terraform:1.17.1 \
  -chdir=infra fmt -check -recursive
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/workspace -w /workspace hashicorp/terraform:1.17.1 \
  -chdir=infra init -backend=false -input=false
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/workspace -w /workspace hashicorp/terraform:1.17.1 \
  -chdir=infra validate
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/workspace -w /workspace hashicorp/terraform:1.17.1 \
  -chdir=infra test
```

- 実 AWS への plan／apply は Docker 内で実行しないでください。backend と AWS 資格情報の受け渡しが増え、誤操作のリスクが高まります。

- テストは Lambda 初期値、HTTP API と `$default` ステージ、S3 非公開・暗号化、OAC と限定ポリシー、API ビヘイビアのキャッシュ無効・`AllViewerExceptHostHeader`、SPA Function の関連付け、CORS／全体エラー変換なし、Secret の `connectionString` 注入を確認します。
- これらは AWS 側の受理、IAM の実権限、実ヘッダー転送を保証しません。初回 apply と実環境確認はユーザーが行います。

## 8. ユーザーによる plan の保存・確認・apply、outputs の取得

### 入力値の設定

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
# エディタで database_secret_arn / cognito_* / aws_region / name_prefix を設定
```

- `infra/terraform.tfvars` は `.gitignore` 済みです。
- **接続文字列そのものは tfvars に書きません。** Secret の ARN だけを渡します（接続文字列は state／保存 plan に含まれます）。
- `name_prefix` はリソース名の接頭辞です。3〜16 文字の小文字英数字とハイフン（先頭・末尾は英数字）で指定します。S3 バケット名は `<name_prefix>-site-<account-id>-<region>` のようにアカウント ID とリージョンを含めて一意にし、63 文字以内に収まるよう `terraform plan` 時に検証されます。

### 初期化（backend 接続）

```bash
cd infra
terraform init -backend-config=backend.s3.hcl
cd ..
```

### plan の保存と確認

```bash
mkdir -p .artifacts
umask 077
terraform -chdir=infra plan -out=../.artifacts/kakeibo.tfplan
```

- **保存 plan には接続文字列が含まれます。** `.artifacts/` は追跡対象外ですが、ファイル自体を秘密情報として扱い、共有・添付・アップロードをしないでください。
- 作成・変更・削除・**置換（replace）** されるリソースを確認します。特に次を確認します。
  - フロント用 S3 バケットが削除・置換されない（`prevent_destroy` により通常はエラーになる）
  - Lambda の `s3_key` が新しい ZIP ハッシュを指し、`source_code_hash` が更新される
  - CloudFront の API ビヘイビアが 3 つ（`/api`、`/api/*`、`/health`）のまま
  - Secret の参照が既存 ARN のまま
- `terraform show ../.artifacts/kakeibo.tfplan` は内容確認に使えますが、表示結果を記録・共有しないでください。

### apply

確認した**同じ plan** を apply します（apply 前に plan を作り直さない）。

```bash
terraform -chdir=infra apply ../.artifacts/kakeibo.tfplan
```

- 初回は IAM ロール作成などのため時間がかかります。
- CloudFront の作成・更新には時間がかかることがあります。
- apply 後、保存 plan とその控えを削除します（`rm -f .artifacts/kakeibo.tfplan`）。apply 前の plan を別名で保管しないでください。どうしても保管が必要な場合は、state バケットと同じアクセス制限・暗号化・保管期限を適用します。

### outputs の取得

```bash
terraform -chdir=infra output
```

主な outputs：

- `site_url`：公開 URL
- `distribution_id`：キャッシュ更新用
- `site_bucket_name`：フロント配置先
- `artifact_bucket_name`：Lambda ZIP 配布用
- `api_endpoint`：API Gateway 直 URL（検証用）
- `api_function_name`：Lambda 関数名
- `spa_rewrite_function_name`：SPA フォールバック用 CloudFront Function 名

接続文字列などの秘密情報は output に含めていません。`terraform output -json` も共有しないでください。

### 部分失敗時の扱い

Terraform には CloudFormation のような**自動ロールバックはありません**。apply が途中で失敗すると、完了したリソースの state は更新されたまま残ります。

1. エラー内容と `terraform -chdir=infra state list` で、どこまで作成・変更されたか確認します。
2. 原因（IAM 権限、名前衝突、クォータ、既存リソースとの競合など）を修正します。
3. 新しい plan を作成・確認し、apply します。設定を変えた場合は、失敗前の保存 plan を再利用しないでください。

## 9. Cognito 設定付きフロントビルド、S3 配置、キャッシュ更新

### ビルド

以降のコマンドはリポジトリルートを起点にします。

```bash
cp frontend/.env.production.example frontend/.env.production.local
# エディタで VITE_COGNITO_* を実値へ設定

# ビルドだけサブシェルで frontend/ へ移動し、終了後はルートへ戻る
(cd frontend && npm ci && npm run build)
```

- `VITE_COGNITO_*` はビルド時に取り込まれます。値を変えたら再ビルドが必要です。
- `frontend/.env.production.local` は `.gitignore` 済みです。
- 生成物 `frontend/dist/` に DB 接続情報や AWS 認証情報が含まれないことを確認します。

```bash
grep -R -E 'Npgsql|Database=|SSL Mode=|neon\.tech|Username=kakeibo' frontend/dist \
  && echo '想定外の DB 接続情報候補あり' || true
```

### S3 配置

ハッシュ付きアセットを先に、`index.html` を最後に配置します。初回構築・障害復旧を除き、古いアセットを即時一括削除しないでください（開いているタブの読み込み失敗を避けるため）。

```bash
BUCKET=$(terraform -chdir=infra output -raw site_bucket_name)
DIST_ID=$(terraform -chdir=infra output -raw distribution_id)

# 1. ハッシュ付きアセット（長期キャッシュ）
aws s3 sync frontend/dist/assets "s3://$BUCKET/assets" \
  --cache-control "public,max-age=31536000,immutable"

# 2. index.html 以外のルートファイル
aws s3 sync frontend/dist "s3://$BUCKET" \
  --exclude "index.html" --exclude "assets/*"

# 3. index.html は最後（再検証させる）
aws s3 cp frontend/dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache,max-age=0"
```

### キャッシュ更新

SPA の各画面パスは CloudFront 上で別々の URI としてキャッシュされます。`index.html` だけの無効化では `/login` などに古い HTML が残るため、`/*` を無効化します。

```bash
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

無効化は無料枠を超えると従量課金です。頻繁な更新を避けるか、必要に応じてパスを限定してください。API ビヘイビアはキャッシュ無効なので、API の更新に無効化は不要です。

## 10. 公開 URL・認証・CRUD・S3 非公開の確認

```bash
PUBLIC_URL=$(terraform -chdir=infra output -raw site_url)
echo "$PUBLIC_URL"
```

### 画面

- `$PUBLIC_URL/`、`$PUBLIC_URL/login`、任意の画面パスを直接開き、HTTPS でログイン画面が表示される
- ログイン後、月次画面が表示される
- `/login` を再読み込みしても表示できる

### API の curl 検証

トークンなし → 401：

```bash
curl -i "$PUBLIC_URL/api/entries?month=2031-01"
```

有効なアクセストークン → 200：

```bash
# トークンはブラウザのログイン後に取得する。履歴へ残さないよう read -s を使う。
read -rsp 'アクセストークン: ' TOKEN; echo
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$PUBLIC_URL/api/entries?month=2031-01"
```

登録 → 201：

```bash
curl -i -X POST "$PUBLIC_URL/api/entries" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"date":"2031-01-15","type":"支出","amount":123,"category":"食費","memo":"deployment-check"}'
```

再取得 → 登録内容が一致：

```bash
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$PUBLIC_URL/api/entries?month=2031-01"
```

- `TOKEN` は**アクセストークン**です。ID トークンでは 401 になります。ブラウザの開発者ツールで、ログイン後のリクエストの `Authorization` ヘッダー、または Amplify が `sessionStorage` に保存したセッションから取得します。
- トークン実値をコマンド履歴・ログ・検証記録へ残さないでください。確認後は `unset TOKEN` します。
- 登録した検証データは、返却された `id` を使って削除します。

```bash
curl -i -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$PUBLIC_URL/api/entries/<id>"
```

### 追加確認

- CloudFront と API Gateway 直 URL（`api_endpoint`）の両方で、同じ認証結果になる
- 認証付き GET の後でも、トークンなし GET は 401（API 応答がキャッシュされていない）
- API の不正パスが SPA の HTML にならず、API のエラー（404 など）になる

```bash
curl -i "$PUBLIC_URL/api/does-not-exist"
```

- Cognito の自己登録が拒否される（アプリに登録画面がないことだけでは確認にならない）
- S3 へ直接匿名アクセスすると拒否される

```bash
curl -i "https://$BUCKET.s3.ap-northeast-1.amazonaws.com/index.html"
# 403 など。200 で内容が返る場合は公開設定を確認する
```

- Neon の休止後も、再アクセスで正常動作する（初回は復帰待ちで遅い）

## 11. アプリ更新と Secret 更新時の反映

main へのマージ後の通常の更新は、15章の CD が行います。この章の手動手順は、初回構築と障害時の代替として使用します。CD と手動の更新を同時に実行しないでください。手動で作業する際は、承認待ちを含む Deploy の状況を確認し、作業中に CD を承認・再実行しないでください。

### 更新前の退避（旧版の保持）

コード配布用 S3 の key には ZIP の内容ハッシュが含まれます。更新時は新しい key のオブジェクトへ切り替わり、Terraform が管理していた旧 key のオブジェクトは削除されます。**S3 上のオブジェクトは旧版の控えになりません。** 更新前に、現行の ZIP と対応するコード・設定を、追跡対象外の `.artifacts/releases/` へ `umask 077` で退避します。

```bash
RELEASE_DIR=".artifacts/releases/$(date +%Y%m%dT%H%M%S)"
(
  set -e
  umask 077
  mkdir -p "$RELEASE_DIR"
  cp .artifacts/api.zip "$RELEASE_DIR/api.zip"
  cp infra/terraform.tfvars "$RELEASE_DIR/terraform.tfvars"
  terraform -chdir=infra output -json > "$RELEASE_DIR/outputs.json"
  git rev-parse HEAD > "$RELEASE_DIR/git-revision.txt"
  aws lambda get-function-configuration \
    --function-name "$(terraform -chdir=infra output -raw api_function_name)" \
    > "$RELEASE_DIR/lambda-configuration.json"
)
```

- `lambda-configuration.json` は Lambda の環境変数を含み、接続文字列などの秘密情報を含み得ます。`.artifacts/` は追跡対象外ですが、退避物は秘密情報として権限制限し、共有・添付・アップロードをしないでください。不要になった退避物は削除します。
- 復旧時は、この退避物の `api.zip`・`git-revision.txt` のコード・tfvars／outputs などの設定を組み合わせて使います。S3 に残ったオブジェクトだけを旧版の保証にしないでください。

### アプリ（API）の更新

```bash
./infra/scripts/package-api.sh
umask 077
terraform -chdir=infra plan -out=../.artifacts/kakeibo.tfplan
# 差分を確認する（Lambda の s3_key / source_code_hash が変わる）
terraform -chdir=infra apply ../.artifacts/kakeibo.tfplan
rm -f .artifacts/kakeibo.tfplan
```

- ZIP の内容ハッシュが key に含まれるため、コードが変わったときだけ新しいオブジェクトが作られ、Lambda が更新されます。Terraform の管理上、旧 key のオブジェクトは削除されます。旧版は「更新前の退避」で保持します。
- `$LATEST` を直接更新する構成のため、別名（alias）の切り替えはありません。
- コードの更新だけなら、`terraform apply` 後に CloudFront の無効化は不要です（API はキャッシュ無効）。

### フロントの更新

「9. Cognito 設定付きフロントビルド、S3 配置、キャッシュ更新」を再実行します。アセットを先、`index.html` を最後、その後に `/*` を無効化します。

### Secret の更新

1. Secrets Manager の値を更新します（パスワードを履歴へ残さない）。

```bash
read -rsp '新しい DB パスワード: ' DB_PASSWORD; echo
(
  set -e
  umask 077
  SECRET_FILE=$(mktemp)
  trap 'rm -f "$SECRET_FILE"' EXIT
  DB_PASSWORD="$DB_PASSWORD" jq -n '{
    connectionString: ("Host=<pooled-host>;Port=5432;Database=kakeibo;Username=kakeibo_app;Password=" + $ENV.DB_PASSWORD + ";SSL Mode=VerifyFull;Pooling=true;Minimum Pool Size=0;Maximum Pool Size=5;Timeout=15")
  }' > "$SECRET_FILE"
  aws secretsmanager put-secret-value \
    --secret-id kakeibo/database \
    --secret-string "file://$SECRET_FILE"
)
unset DB_PASSWORD
```

2. **通常の refresh を伴う新しい plan** を作成し、差分を確認します。Secret の参照は refresh 時に再取得されます。

```bash
umask 077
terraform -chdir=infra plan -out=../.artifacts/kakeibo.tfplan
```

- Secret 更新前に保存した古い plan を再利用しないでください。
- `-refresh=false` を使わないでください。Lambda の環境変数が更新されません。
- CloudFormation 用の `ConfigVersion`／`CONFIG_VERSION` に相当する入力はありません。Secret 更新後の通常の plan／apply が反映操作です。

3. 同じ plan を apply し、検証します。

```bash
terraform -chdir=infra apply ../.artifacts/kakeibo.tfplan
rm -f .artifacts/kakeibo.tfplan
```

4. 「10.」の curl 検証で DB 接続を確認します。

Secret を更新しただけでは Lambda の環境変数は変わりません。**Secret 更新後は、必ず新しい plan／apply を行ってください。** 過去の state バージョンや保存 plan には旧パスワードが残ります（「5.」参照）。

### 障害・復旧

Terraform には CloudFormation の `rollback-stack` に相当する自動ロールバックはありません。

- **apply が失敗した場合**：エラーと state を確認し、原因を修正して新しい plan／apply を行います。失敗した plan をそのまま再実行しないでください。
- **成功済みのアプリを戻す場合**：CD で配置した版は、15章のとおり revert コミットを PR から main にマージし、CI と承認を経て再デプロイして戻します。CD は `.artifacts/releases/` への退避を行いません。以下の手動復旧は、手動で更新し、退避物がある場合に使います。CD と同時に実行しないでください。
  - `.artifacts/releases/` に退避した ZIP と `git-revision.txt` のコード、対応する設定で plan／apply します。旧コミットから作り直す場合も、同じ旧設定と組み合わせます。
  - **コード配布用 S3 の旧オブジェクトは、Terraform が管理する key の切り替えで削除されます。** 旧 ZIP の保持先は S3 ではなく、更新前に取得した `.artifacts/releases/` の退避物です。S3 に旧 ZIP が残っていても、それだけでは旧構成の復旧を保証しません。Terraform 設定・環境変数・フロント成果物も揃えます。
  - フロントは旧 `frontend/dist` を同じ順序で再配置し、`/*` を無効化します。
- **tfstate の過去バージョンの復元は、アプリのロールバック手順にしないでください。** state にはリソースの対応関係が記録されており、安易な復元はリソースの重複作成・誤削除につながります。state の復元は、Terraform 管理情報の災害復旧として、影響を確認したうえで行います。
- DB スキーマは自動で戻りません。破壊的 downgrade は自動復旧手順に含めません。必要なら Neon のブランチ／バックアップから復元し、アプリ側の互換性を確認します。

## 12. 障害切り分け、アプリ復旧、DB 復旧の注意

| 症状 | 確認ポイント |
|---|---|
| CloudFront が 502/504 | Lambda の CloudWatch Logs（`/aws/lambda/<api_function_name>`）。起動失敗、タイムアウト、DB 接続待ちを確認 |
| ログに `Couldn't find a valid ICU package` が出て起動しない | provided.al2023 に libicu が無いことが原因。`infra/lambda.tf` の `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` が設定されているか確認し、無ければ追加して再 apply |
| すべて 401 | `Cognito__Region` / `UserPoolId` / `AppClientId` の不一致、ID トークン使用、期限切れ、端末時刻 |
| 500（DB 系） | Secret の接続文字列、pooled endpoint、`SSL Mode=VerifyFull`、API 用ロールの権限、Neon の休止・復帰 |
| 画面が 403/404 | S3 に `index.html` があるか、CloudFront Function の関連付け（`spa_rewrite_function_name`）、OAC とバケットポリシー |
| API が HTML を返す | `/api`・`/api/*`・`/health` のビヘイビア順序、CloudFront のカスタムエラー応答が無いこと、キャッシュ無効 |
| CORS エラー | 同一 CloudFront オリジンへアクセスしているか。Gateway 直 URL のブラウザ利用はサポート対象外 |
| コールドスタートが遅い | Lambda メモリ・タイムアウト、Neon 復帰時間。必要なら `infra/lambda.tf` の `memory_size` / `timeout` を調整して再 apply |
| ログが増え続ける | CloudWatch Logs の保持期間を設定（この構成では未設定） |
| plan が Secret の取得で失敗する | 実行主体の `secretsmanager:GetSecretValue`、Secret ARN、リージョン |
| `terraform init` が backend で失敗する | backend バケット名・リージョン、S3 権限、versioning、`backend.s3.hcl` の内容 |

`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` は、.NET を ICU に依存しない invariant モードで起動する設定です。provided.al2023 は libicu を含まないため、この設定が無いとプロセスが起動前に FailFast し、ログに `Couldn't find a valid ICU package` が残ります。日付・数値の書式は invariant 固定になりますが、アプリのカルチャ依存は `CultureInfo.InvariantCulture` のみなので互換です。環境変数の変更は再 apply で反映され、ZIP の再配置は不要です。

復旧の基本：

1. まず `/health` と CloudWatch Logs で、Lambda まで到達しているか確認する。
2. Lambda の設定（環境変数）と Secret の整合を確認する。秘密値は表示・記録しない。
3. 直近の apply 差分（コード・設定・SQL）を確認する。
4. アプリは旧コード・旧設定の再 apply で戻す。DB は forward-only を基本とし、破壊的 downgrade をしない。
5. Neon の復旧はブランチ／バックアップを優先し、復元後にアプリのマイグレーション履歴と整合を確認する。

## 13. リソース削除、保護設定を含む S3 保持・管理解除、state と残存データの扱い

### 通常の削除は保護される

フロント用 S3 バケットには `prevent_destroy = true` を設定しているため、バケットを削除・置換しようとする plan／apply は失敗します。これは意図的な保護です。また `force_destroy = false` のため、オブジェクトが残るバケットは削除できません。

コード配布用 S3 は `force_destroy = false` ですが、これは「旧 ZIP を保持する」設定ではありません。Terraform が管理する ZIP オブジェクトは key の切り替えで削除されます（「11. 更新前の退避」参照）。旧版の保持先は `.artifacts/releases/` の退避物です。

### 廃止時の手順（保持対象の管理解除）

S3 のフロント成果物を保持したままアプリを廃止する場合は、**参照元を整理してから、保持するリソースを Terraform の管理から明示的に外します。** `prevent_destroy` を外して削除するだけでは、保持したいデータも消えます。次の順で、各段階の plan を確認しながら進めてください。

#### 1. outputs と参照元の整理

- `infra/outputs.tf` から、削除するリソースを参照する output を削除します。全廃止なら outputs を空にします。
- 削除対象リソースだけが使っている `main.tf` の `data` 参照や locals は、この段階で外してかまいません（Secret を読む data 参照を残すと、plan 時に Secrets Manager への権限が必要になります）。保持するバケットが使う locals は残します。
- `terraform -chdir=infra plan` を実行し、**リソースの作成・削除・置換が出ず、outputs の削除だけ**になることを確認して apply します。
- ここで参照エラーが出る場合は、先に outputs や他のリソースからの参照を外します。

#### 2. CloudFront・API・Lambda・IAM・ZIP オブジェクトの削除

設定から次を外します（削除対象の例）。

- `aws_cloudfront_distribution.site`、`aws_s3_bucket_policy.site`
- `aws_cloudfront_function.spa_rewrite`、`aws_cloudfront_origin_access_control.site`
- `aws_apigatewayv2_stage.default`、`aws_apigatewayv2_route.proxy`、`aws_apigatewayv2_integration.api`、`aws_apigatewayv2_api.api`
- `aws_lambda_permission.api`、`aws_lambda_function.api`
- `aws_iam_role_policy_attachment.api_basic_execution`、`aws_iam_role.api`
- `aws_s3_object.api_zip`

`terraform -chdir=infra plan` で、これらが **destroy** になり、フロント用／コード配布用 S3 バケット自体の destroy／replace が出ないことを確認して apply します。S3 バケットポリシーは Distribution を参照しているため、Distribution と同じ変更で外します。依存関係の削除順は Terraform が解決します。

#### 3. コード配布用 artifacts バケットの保持と管理解除

バケットを残す場合は、`aws_s3_bucket.artifacts` と保護設定（public access block・暗号化・ownership controls）を設定から外し、`removed` ブロックで `destroy = false` を指定します（書き方は「4.」の site と同じ）。

`terraform -chdir=infra plan` で **destroy ではなく state からの管理解除（forget）** になることを確認して apply します。その後、不要になった ZIP オブジェクトを手動で整理します。バケット自体も不要なら、`removed` ブロックは追加せず、オブジェクトを空にしてから通常の destroy にします。

#### 4. フロント用 site バケットの管理解除

`aws_s3_bucket.site` と保護設定を設定から外し、`removed` ブロックで `destroy = false` を指定します。

```hcl
removed {
  from = aws_s3_bucket.site
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_public_access_block.site
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_server_side_encryption_configuration.site
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_ownership_controls.site
  lifecycle {
    destroy = false
  }
}
```

`terraform -chdir=infra plan` で、これらが **destroy ではなく state からの管理解除** になることを確認して apply します。バケットと保護設定は AWS に残ります。管理解除が完了したら、`removed` ブロックは設定から削除してかまいません。

#### 5. 最終確認と失敗時の切り分け

- `terraform -chdir=infra plan` が **No changes**（または残したリソースだけの差分）になることを確認します。
- `terraform -chdir=infra state list` で、廃止したアプリのリソースが state から外れ、保持したバケットが管理対象に残っていないことを確認します。
- `aws s3 ls` と `aws s3api get-public-access-block` で、保持したバケットとオブジェクト、Block Public Access が残っていることを確認します。
- plan に site バケットの destroy／replace が出た場合は apply しないでください。`removed` ブロックの不足、またはリソースブロックの残存を確認します。
- plan が「resource still referenced」で失敗する場合は、outputs・バケットポリシー・Distribution などの参照が残っています。「1.」へ戻って参照を外します。
- 保持するバケットの削除で「not empty」エラーになった場合は、`force_destroy = true` に変えず、保持か手動整理のどちらかを選びます。
- 管理解除の apply が他のリソースで失敗した場合も、保持対象のバケットは残ります。エラーを直して再 plan／apply します。

- 保持したバケットは、不要になった時点で手動で空にしてから削除します（`aws s3 rm ... --recursive` と `aws s3 rb ...`）。公開設定は Block Public Access のままにしてください。
- コード配布用バケットのオブジェクトも、旧 ZIP が不要になったら手動で整理します。旧 ZIP の保持は `.artifacts/releases/` の退避物で行います（「11.」参照）。
- **state 用 S3 バケットはアプリの Terraform の管理外**です。アプリを削除しても state とその過去バージョンは残ります。完全に廃止するときは、state バケットの全オブジェクト（versioning の過去バージョンを含む）とバケットを、権限を保ったまま手動で削除します。state には旧接続文字列が残っているため、削除するまで秘密情報として扱います。
- **Secrets Manager のシークレット**：Terraform の管理外です。`aws secretsmanager delete-secret --secret-id kakeibo/database --recovery-window-in-days 7` などで削除します（回復期間に注意）。
- **Cognito User Pool / ユーザー**：Terraform の管理外です。不要ならコンソールまたは CLI で削除します。ユーザーも失われます。
- **Neon のプロジェクト・DB・データ**：Terraform の管理外です。削除すると家計簿データが失われます。必要ならバックアップ／ブランチを作成してから削除します。

`terraform destroy` は、`prevent_destroy` と `force_destroy = false` のため、フロント用バケットを保持したままでは完了しません。CloudFormation の `DeletionPolicy: Retain` と同じ結果を、単純な `terraform destroy` だけで得られるとは考えないでください。

## 14. 実施結果チェックリスト

CD の設定（15章）:

- [ ] GitHub 用 OIDC プロバイダーと audience を設定した
- [ ] デプロイ用 IAM ロールの信頼ポリシーを production の subject に限定した
- [ ] production の Required reviewers と main だけの Deployment branches を設定した
- [ ] production に Variables / Secrets をすべて登録した
- [ ] 初回の Deploy が承認待ちになり、承認後に成功した
- [ ] 初回デプロイのログに秘密情報が出ていないことと、10章のアプリ動作を確認した

手動構築・復旧を含む確認:

- [ ] Cognito の自己登録が無効、SPA 用 App Client がシークレットなし・SRP 許可
- [ ] 管理者ユーザーを作成した
- [ ] Neon の direct / pooled endpoint を区別した
- [ ] API 用ロールと権限を設定した
- [ ] Secret を作成し、接続文字列を JSON の `connectionString` に保存した
- [ ] state 用 S3 バケットを作成し、versioning・暗号化・パブリックアクセス全ブロックを設定した
- [ ] `infra/backend.s3.hcl` を設定した（追跡されていないことを確認）
- [ ] `infra/terraform.tfvars` に Secret ARN・Cognito 値を設定した（接続文字列は書いていない）
- [ ] backend を変更した場合、state をバックアップし `init -migrate-state` で移行した
- [ ] 更新前に旧 ZIP・コード・設定を `.artifacts/releases/` へ `umask 077` で退避した
- [ ] `terraform fmt -check -recursive` が成功した
- [ ] `terraform init -backend=false`・`validate`・`test` が成功した
- [ ] `node --test infra/tests/spa-rewrite.test.mjs` が成功した
- [ ] `generate-migration-sql.sh` で SQL を生成し、内容を確認した
- [ ] direct endpoint へ `ON_ERROR_STOP=1` で適用した
- [ ] 同じ SQL の再適用が成功した（冪等）
- [ ] `package-api.sh` で `.artifacts/api.zip` を作成し、`bootstrap` と実行権限を確認した
- [ ] `terraform init -backend-config=backend.s3.hcl` が成功した
- [ ] plan を保存し、作成・変更・置換・削除を確認した（フロントバケットが置換されない）
- [ ] 確認したのと同じ plan を apply した
- [ ] 保存 plan を apply 後に削除した
- [ ] outputs（`site_url` / `distribution_id` / `site_bucket_name` / `api_endpoint` / `api_function_name`）を控えた
- [ ] `frontend/.env.production.local` に実値を設定してビルドした
- [ ] ハッシュ付きアセット → その他 → `index.html` の順で S3 へ配置した
- [ ] CloudFront の `/*` を無効化した
- [ ] `/health` が 200
- [ ] `/` と `/login` が HTTPS で表示される
- [ ] トークンなし API が 401
- [ ] 有効なアクセストークンで一覧が 200
- [ ] 登録が 201、再取得で内容が一致
- [ ] API の不正パスが SPA の HTML にならない
- [ ] S3 への直接匿名アクセスが拒否される
- [ ] Cognito の自己登録が拒否される
- [ ] Neon 休止後の再アクセスが正常
- [ ] 検証データを削除した
- [ ] トークン・パスワード・接続文字列を記録に残していない
- [ ] state・保存 plan・backend 設定を公開していない
- [ ] フロント用 S3 の `prevent_destroy` と `force_destroy = false` を確認した
- [ ] 廃止時は `removed` ブロックで保持対象を管理解除する手順を確認した
- [ ] 実施結果と未確認事項をレビュー記録へ分離して残した

実環境の R1〜R5 を確認するまで、issue の本番受入条件は達成済みとして扱いません。

## 15. GitHub Actions による自動デプロイ（CD）

### 流れと事前準備

初回構築は3〜9章の手動手順で済ませます。AWS の本番リソース、state バケット、Secrets Manager、Neon、Cognito が存在し、以下の OIDC・IAM・GitHub 設定が完了してから、このワークフローを main にマージしてください。IAM ロールと OIDC プロバイダーは Terraform の管理対象外です。

1. main への push（PR のマージ）で CI のすべてのジョブを実行します。
2. CI が成功すると `Deploy` が起動します。同じリポジトリの main への push が起点の CI だけが対象です。
3. `gate` が CI の `head_sha` と現在の main の先頭を比較します。古いコミットなら通知を出して成功終了し、デプロイをスキップします。
4. GitHub Environment `production` の承認を待ちます。
5. 承認後、deploy ジョブの先頭で CI の `head_sha` と現在の main の先頭を再比較します。古ければ通知を出して成功終了し、checkout・AWS 認証を含む後続ステップをすべてスキップします。最新の場合だけ、CI が成功したコミットを checkout し、全13個の Variables と1個の Secret が空でないことを AWS 認証より前に確認します。不足があれば、値は表示せず設定名だけを通知して停止します。その後、マイグレーション → Lambda パッケージ・Terraform plan・同じ plan の apply → フロントのビルド・検査・S3 配置・CloudFront 無効化を、1つのジョブで実行します。

途中で失敗すると、それ以降の手順は実行されません。自動ロールバックはありません。承認は plan 作成前の1回です。apply 前に plan の差分を見て止める承認段階はありません。state・plan・ZIP・SQL は artifact としてアップロードしません。保存 plan はランナーの一時領域に権限を限定して作成し、apply の終了時に削除します。

`deploy.yml` は main に入って初めて `workflow_run` が有効になります。PR では実際のデプロイは検証できません。CI は従来どおり、PR では変更箇所のジョブだけ、main への push では全ジョブを実行します。actionlint は常に実行し、`CI 結果` の判定にも含めます。

### IAM の OIDC プロバイダー

AWS コンソールの **IAM → Identity providers → Add provider** で次を登録します。既存の同じプロバイダーがある場合は再利用します。

- Provider type: OpenID Connect
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

登録後の ARN は `arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com` です。長期のアクセスキーを GitHub に登録する必要はありません。[GitHub の公式手順](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)も参照してください。

### デプロイ用 IAM ロール

IAM の **Roles → Create role → Web identity** で上記プロバイダーと audience を選び、例として `kakeibo-github-deploy` を作成します。信頼ポリシーを次の JSON に設定します。`<ACCOUNT_ID>` は自分の AWS アカウント ID に置き換えます。

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:is-9108/KakeiboApp:environment:production"
      }
    }
  }]
}
```

`sub` は完全一致にし、リポジトリ全体のワイルドカードを使いません。通常のブランチ・PR の subject は一致しません。Environment を使うジョブの subject はブランチ名を含まないため、次項の Environment の main 制限と併用します。リポジトリで OIDC subject のカスタマイズを有効にしている場合は、この例との一致を設定時に確認してください。

次の権限ポリシー例を、ロールのインラインポリシーとして登録します。すべての `<...>` を実環境に置き換えてください。`<STATE_KEY>` は state オブジェクトのキー、`<API_ID>`・`<DISTRIBUTION_ID>`・`<OAC_ID>` は初回構築済みリソースの ID、`<DATABASE_SECRET_ARN>` は Secret の完全な ARN です。state バケットとアプリ用バケットを混同しないでください。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "StateBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketVersioning"
      ],
      "Resource": "arn:aws:s3:::<STATE_BUCKET>"
    },
    {
      "Sid": "StateObject",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::<STATE_BUCKET>/<STATE_KEY>"
    },
    {
      "Sid": "StateLock",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::<STATE_BUCKET>/<STATE_KEY>.tflock"
    },
    {
      "Sid": "AppBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "s3:GetBucket*",
        "s3:GetAccelerateConfiguration",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:GetReplicationConfiguration",
        "s3:ListBucketMultipartUploads",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketOwnershipControls",
        "s3:DeleteBucketOwnershipControls",
        "s3:PutBucketTagging"
      ],
      "Resource": [
        "arn:aws:s3:::<NAME_PREFIX>-site-*",
        "arn:aws:s3:::<NAME_PREFIX>-artifacts-*"
      ]
    },
    {
      "Sid": "AppObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetObjectAttributes",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectTagging",
        "s3:PutObjectTagging",
        "s3:DeleteObjectTagging",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::<NAME_PREFIX>-site-*/*",
        "arn:aws:s3:::<NAME_PREFIX>-artifacts-*/*"
      ]
    },
    {
      "Sid": "ApiLambda",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:GetPolicy",
        "lambda:GetFunctionCodeSigningConfig",
        "lambda:GetFunctionConcurrency",
        "lambda:GetRuntimeManagementConfig",
        "lambda:ListVersionsByFunction",
        "lambda:ListTags",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource"
      ],
      "Resource": "arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:<NAME_PREFIX>-api"
    },
    {
      "Sid": "LambdaRole",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:GetRole",
        "iam:UpdateAssumeRolePolicy",
        "iam:UpdateRole",
        "iam:DeleteRole",
        "iam:ListRolePolicies",
        "iam:GetRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:ListInstanceProfilesForRole",
        "iam:ListRoleTags",
        "iam:TagRole",
        "iam:UntagRole"
      ],
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/<NAME_PREFIX>-api-lambda"
    },
    {
      "Sid": "LambdaLoggingPolicy",
      "Effect": "Allow",
      "Action": [
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy"
      ],
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/<NAME_PREFIX>-api-lambda",
      "Condition": {
        "ArnEquals": {
          "iam:PolicyARN": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }
      }
    },
    {
      "Sid": "PassLambdaRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/<NAME_PREFIX>-api-lambda",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    },
    {
      "Sid": "ApiGateway",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE"
      ],
      "Resource": [
        "arn:aws:apigateway:<REGION>::/apis/<API_ID>",
        "arn:aws:apigateway:<REGION>::/apis/<API_ID>/*",
        "arn:aws:apigateway:<REGION>::/tags/*"
      ]
    },
    {
      "Sid": "CreateApi",
      "Effect": "Allow",
      "Action": "apigateway:POST",
      "Resource": "arn:aws:apigateway:<REGION>::/apis"
    },
    {
      "Sid": "CloudFrontResources",
      "Effect": "Allow",
      "Action": [
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:GetFunction",
        "cloudfront:DescribeFunction",
        "cloudfront:UpdateFunction",
        "cloudfront:PublishFunction",
        "cloudfront:DeleteFunction",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:GetOriginAccessControlConfig",
        "cloudfront:UpdateOriginAccessControl",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:ListTagsForResource",
        "cloudfront:TagResource",
        "cloudfront:UntagResource"
      ],
      "Resource": [
        "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>",
        "arn:aws:cloudfront::<ACCOUNT_ID>:function/<NAME_PREFIX>-spa-rewrite",
        "arn:aws:cloudfront::<ACCOUNT_ID>:origin-access-control/<OAC_ID>"
      ]
    },
    {
      "Sid": "CloudFrontCreateAndList",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:CreateDistributionWithTags",
        "cloudfront:CreateFunction",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:ListDistributions",
        "cloudfront:ListFunctions",
        "cloudfront:ListOriginAccessControls"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DatabaseSecret",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "<DATABASE_SECRET_ARN>"
    },
    {
      "Sid": "ReadLogs",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ],
      "Resource": "arn:aws:logs:<REGION>:<ACCOUNT_ID>:log-group:/aws/lambda/<NAME_PREFIX>-api:*"
    },
    {
      "Sid": "CallerIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    }
  ]
}
```

この例は2章の権限を構成に合わせて限定したものです。CloudFront の作成・一覧はリソースを限定できない操作を含むため `Resource: "*"` にしています。API Gateway のタグ ARN はリソース ARN をエンコードして含むため、リージョン内の `/tags/*` を許可しています。バケットの Get、Lambda・IAM の Get/List は Terraform の refresh にも使います。state を SSE-KMS にしている場合は、対象キーの KMS 権限も別途必要です。

このポリシー例は実 AWS では未検証です。初回デプロイで AccessDenied が発生した場合は、対象アクションと ARN を確認し、必要な範囲だけポリシーと本書を更新してください。API・Distribution・OAC を置換すると ID が変わるため、置換の際は対象 ARN の見直しが必要です。Secret の値や Lambda 環境設定を読み取れる権限を含むため、ロールの引受先を広げないでください。

### GitHub Environment `production`

リポジトリの **Settings → Environments → New environment** で `production` を作成します。

1. **Required reviewers** に自分を設定します。個人運用で自分のデプロイを承認できるよう、**Prevent self-review は有効にしません**。
2. **Deployment branches and tags** を Selected branches and tags にし、branch `main` だけを許可します。全ブランチの許可やタグの許可は追加しません。
3. 以下の Variables / Secrets を、すべて Environment `production` に登録します。リポジトリ単位の設定と取り違えないでください。

利用中の GitHub プラン・リポジトリの公開範囲で Required reviewers が利用できることを確認し、承認を必須にしてからマージします。

| 名前 | 種別 | 用途 | 例 | 秘密か |
|---|---|---|---|---|
| `AWS_REGION` | Variable | アプリの AWS リージョン | `ap-northeast-1` | いいえ |
| `AWS_DEPLOY_ROLE_ARN` | Variable | 上で作成したデプロイロール | `arn:aws:iam::<ACCOUNT_ID>:role/kakeibo-github-deploy` | いいえ |
| `TF_STATE_BUCKET` | Variable | 既存 state バケット名 | `kakeibo-terraform-state-<account-id>` | いいえ |
| `TF_STATE_KEY` | Variable | state のキー | `kakeibo/terraform.tfstate` | いいえ |
| `TF_STATE_REGION` | Variable | state バケットのリージョン | `ap-northeast-1` | いいえ |
| `NAME_PREFIX` | Variable | 既存 Terraform と同じ接頭辞 | `kakeibo` | いいえ |
| `DATABASE_SECRET_ARN` | Variable | API 用接続文字列を格納した既存 Secret | `arn:aws:secretsmanager:<REGION>:<ACCOUNT_ID>:secret:<SECRET_NAME>` | いいえ（値は秘密） |
| `COGNITO_REGION` | Variable | API・フロント共通の Cognito リージョン | `ap-northeast-1` | いいえ |
| `COGNITO_USER_POOL_ID` | Variable | 既存 User Pool ID | `ap-northeast-1_xxxxxxxxx` | いいえ |
| `COGNITO_APP_CLIENT_ID` | Variable | シークレットなしの SPA App Client | `xxxxxxxxxxxxxxxxxxxxxxxxxx` | いいえ |
| `NEON_DIRECT_HOST` | Variable | マイグレーション用 direct endpoint | `ep-example.ap-southeast-1.aws.neon.tech` | いいえ |
| `NEON_DATABASE` | Variable | 対象 DB | `kakeibo` | いいえ |
| `NEON_MIGRATION_USER` | Variable | 4章の既定権限を設定した所有者ロール | 6章の `<owner_user>` と同じロール | いいえ |
| `NEON_MIGRATION_PASSWORD` | Secret | マイグレーション用パスワード | 実値を Secret 入力欄だけに登録 | **はい** |

例をそのまま登録せず、初回構築済みの値と一致させます。`TF_STATE_BUCKET`・`TF_STATE_KEY`・`TF_STATE_REGION` には、初回に使った `infra/backend.s3.hcl` と同じ値を登録します。別のキーを指定すると既存の state を参照できず、リソースを新規作成しようとするため、5章の設定と照合してください。API 用接続文字列は既存 Secrets Manager から Terraform が参照し、GitHub へ複製しません。マイグレーション用パスワードは事前検証ステップの環境変数と、`psql` ステップの `PGPASSWORD` にだけ渡します。事前検証では空でないことだけを確認し、値を表示しません。接続 URI をコマンド引数にしません。TLS は `verify-full` と `PGSSLROOTCERT=system` を使用し、psql 16 以上が必要です。フロント用 Cognito 設定はステップの環境変数からビルドし、`.env.production.local` は作成しません。

`NEON_MIGRATION_USER` には、4章の `ALTER DEFAULT PRIVILEGES` を実行した所有者ロール（6章の `<owner_user>`）を使います。`FOR ROLE` を省略した既定権限は、その SQL を実行したロールが今後作成するオブジェクトだけに適用されます。CD は権限付与を行いません。初回に同じ所有者ロールで4章の既存テーブル・シーケンスへの権限付与と既定権限の設定を済ませてください。別の DDL ロールを登録すると、新しいテーブルに API 用ロールの権限が付かず、CD が成功しても API が permission denied になる場合があります。

### 運用・失敗時の扱い

- ワークフロー全体を固定の concurrency グループ `deploy-production` に入れ、実行中のデプロイをキャンセルしません。承認待ちもこの枠内です。GitHub の concurrency では pending の実行は1つだけで、さらに新しい実行が来ると pending が置き換えられます。CI の完了順が逆転すると、最新コミットの実行が古い実行に置き換わり、その古い実行も gate でスキップされる場合があります。ワークフロー全体の concurrency は gate の条件判定より前に適用されるため、CI が失敗した実行や、フォークの `main` ブランチからの PR による実行も pending を置き換えることがあります。これらの実行自体は gate でスキップされますが、置き換えられた正しいデプロイは復元されません。最新コミットが未デプロイなら、以下の Re-run all jobs で再実行します。
- 承認前の gate と、承認後の deploy ジョブの先頭で最新 SHA を比較します。いずれかの比較時点で古ければデプロイしません。承認待ち中に main が進んだ場合も、承認後の再比較で古い実行を除外します。main の SHA の取得に失敗した場合はジョブを失敗させ、後続ステップを実行しません。
- 承認待ちの実行 A が古くなった場合は、Actions の承認画面で **Reject** するか、承認して終了させます。承認しても最新 SHA の再比較でスキップされ、何も配置しません。A を承認待ちのまま放置すると concurrency の枠を占め続け、新しいコミット B の実行も pending のまま進みません。A が終了した後、B が進むと、B の deploy ジョブでもう一度承認が求められます。B の SHA を確認して承認してください。
- 最新コミットがデプロイされなかった場合は、**Actions → Deploy → 対象コミットの実行 → Re-run all jobs** で再実行します。古い SHA の実行を再実行しても gate がスキップします。失敗した Deploy も Re-run all jobs で再実行します。Re-run failed jobs は成功済みの gate を再実行せず出力を再利用しますが、deploy の先頭で必ず再比較するため、古いコミットの配置は行いません。CI が失敗している場合は、先に CI の原因を修正します。
- マイグレーション成功後に apply が失敗すると、DB だけが先に進んだ状態になります。マイグレーションは後方互換のある forward-only にし、旧 API も動作できるようにします。再実行では冪等な SQL を再適用します。
- CD は11章の「更新前の退避（`.artifacts/releases/`）」を行いません。戻す場合は revert コミットを PR から main にマージし、CI と承認を経て再デプロイします。DB を自動で巻き戻すことはできません。
- 6〜9章の手動手順は初回構築と障害時の代替として残します。CD と手動 apply を同時に実行しないでください。
- 初回は承認待ちになること、ログに秘密情報が出ないこと、全ステップの成功を人間が確認し、10章の `/health`・ログイン・一覧・登録を検証します。自動のスモークテストはこの CD に含みません。

### タイムアウト・キャンセル後のロックと state の確認

Terraform apply の途中で60分のタイムアウトやキャンセルが発生すると、S3 の `<STATE_KEY>.tflock` が残る場合があります。次の Deploy が `Error acquiring the state lock` で失敗するときは、以下の手順で確認します。ロック解除や本番への plan はユーザーが手元で行います。

1. Actions と手動作業の状況を確認し、ほかの Deploy や手動の plan / apply が動いていないことを確かめます。承認待ちの Deploy も作業中に開始しないようにします。実行中の処理が使っているロックを解除しないでください。
2. 手元で最新の main のコードを用意し、2章の AWS 認証と8章の入力値を設定します。`infra/backend.s3.hcl` の bucket・key・region が、production の Variables と同じ既存 state を指していることを確認します。確認用 plan に使う `infra/terraform.tfvars` または `TF_VAR_*` も、現在の production の Variables と同じ値にそろえます。初回構築時の手元の設定をそのまま使わず、次の6項目を照合してください。

   | Terraform の入力変数（tfvars） | 環境変数で渡す場合 | production の Variable |
   |---|---|---|
   | `aws_region` | `TF_VAR_aws_region` | `AWS_REGION` |
   | `name_prefix` | `TF_VAR_name_prefix` | `NAME_PREFIX` |
   | `database_secret_arn` | `TF_VAR_database_secret_arn` | `DATABASE_SECRET_ARN` |
   | `cognito_region` | `TF_VAR_cognito_region` | `COGNITO_REGION` |
   | `cognito_user_pool_id` | `TF_VAR_cognito_user_pool_id` | `COGNITO_USER_POOL_ID` |
   | `cognito_app_client_id` | `TF_VAR_cognito_app_client_id` | `COGNITO_APP_CLIENT_ID` |

   tfvars と環境変数を併用している場合は、実際に適用される値が production と一致するよう、古い設定を残さないでください。入力値の違いによる差分を、タイムアウトによる state と実リソースの食い違いと取り違えないようにします。
3. リポジトリルートから backend を初期化し、エラーに表示された **Lock ID**（state キーやファイル名ではない）でロックを解除します。解除前にエラーのロック情報も確認し、停止した自分の処理のロックであることを確かめてください。

   ```bash
   terraform -chdir=infra init -backend-config=backend.s3.hcl
   terraform -chdir=infra force-unlock '<LOCK_ID>'
   ```

   確認プロンプトの内容を確認してから解除します。自動解除や `-lock=false` による回避は行いません。[Terraform の公式手順](https://developer.hashicorp.com/terraform/cli/commands/force-unlock)も参照してください。

4. 7章のスクリプトで最新の Lambda パッケージを用意し、新しい plan を作成します。

   ```bash
   ./infra/scripts/package-api.sh
   terraform -chdir=infra plan
   ```

   state と実リソースの食い違い、作りかけのリソース、意図しない新規作成・置換・削除がないかを確認します。state の書き込み失敗時に生成される `errored.tfstate` は、使い捨ての CD ランナーから回収できるとは限りません。state に記録されていない実リソースがあれば、同名リソースを重複作成せず、必要な import などの復旧を判断してから進めてください。state や plan に秘密情報が含まれるため、内容を共有・アップロードしないでください。
5. 食い違いを解消し、手動作業が終了した後に、最新コミットの Deploy を **Re-run all jobs** で再実行します。以前の保存 plan は再利用しません。
