# AWS へのデプロイ手順

issue #7「AWSへのデプロイ」の本番構築・更新・検証手順です。実装側は IaC（`infra/` の Terraform）、パッケージ作成・SQL 生成スクリプト、この手順書を用意します。**AWS・Neon・Cognito の実リソース作成、Terraform の plan／apply、デプロイ、S3 配置、実環境確認はユーザーが実施します。** このリポジトリの CI は AWS 認証情報を使わず、Terraform の fmt／validate／mock test までを検証します。

## 1. 責任分界、構成、費用の発生箇所

### 責任分界

| 作業 | 実施主体 |
|---|---|
| Terraform 定義・スクリプト・手順書の整備 | 実装側（このリポジトリ） |
| Cognito User Pool / App Client の作成・設定 | ユーザー |
| Neon プロジェクト・DB・ロールの作成 | ユーザー |
| Secrets Manager シークレットの作成・更新 | ユーザー |
| マイグレーション SQL の確認・適用 | ユーザー |
| **state 用 S3 バケットの bootstrap** | ユーザー |
| **Terraform の plan 作成・差分確認・apply** | ユーザー |
| フロントエンドのビルド・S3 配置・キャッシュ更新 | ユーザー |
| 実環境の受け入れ確認（R1〜R5） | ユーザー |

Terraform は CloudFormation スタックを使いません。実 AWS への `terraform plan`／`apply` はユーザーが実施し、実装側・CI は行いません。

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
- Lambda の起動時マイグレーションは本番では無効です。スキーマは手動適用した SQL で管理します。
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
- **成功済みのアプリを戻す場合**：`.artifacts/releases/` に退避した ZIP と `git-revision.txt` のコード、対応する設定で plan／apply します。旧コミットから作り直す場合も、同じ旧設定と組み合わせます。
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
