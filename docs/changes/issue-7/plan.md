# issue #7「AWSへのデプロイ」計画

本計画は元計画の承認を維持し、ユーザーの要求変更「IaC は Terraform を使う」と、親から共有された改訂計画の承認結果を反映して保存したものです。Terraform 化、S3 backend の標準採用、接続文字列の Terraform state／保存 plan への保存許容、および R9～R12 は今回の承認内容です。元計画の最小限の API 変更は実装済みで維持します。実際の AWS 操作と実環境に対する Terraform plan／apply はユーザーが実施します。

デプロイ実行中に判明した環境制約への対応（予約済み同時実行数の削除、`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` の追加）の2点は、親からの共有に基づきユーザー承認・実装済みです。

最終計画の保存先：`docs/changes/issue-7/plan.md`
レビュー・検証記録：`docs/changes/issue-7/review.md`（既存の SAM 検証は履歴として保持し、Terraform の検証成功には流用しない。今回の計画保存では変更しない）

`docs/plans/issue-7.md` は新設せず、issue 本文のリンクを現行規約の保存先へ変更する方針です。

## 1. 承認された実装範囲

元計画で承認された次の最小限の API 変更は、親からの引き継ぎでは実装済みです。今回の Terraform 化では再実装・変更せず維持します。

- Lambda ホスティング用パッケージと起動設定の追加
- 本番では起動時マイグレーションを実行しない設定分岐
- その回帰テスト

今回の改訂範囲は SAM 固有 IaC の Terraform への置換、手順書、構成テスト、CI の IaC 検証、秘密情報保護設定です。既存の API・スクリプト・CI の非 IaC 検証を継承します。AWS リソース作成、backend bootstrap、実環境の Terraform plan／apply、デプロイ、S3 配置、実環境確認はユーザー自身が行います。agent の Terraform 検証は fmt／validate／mock test までとし、実 AWS の参照・変更を行いません。

## 2. 目的・範囲

### 引き継がれた確定事項

- S3 のフロント、Lambda の API、Neon の PostgreSQL、Cognito による本番構成を準備する。
- 実装側は IaC とデプロイ手順、および承認された最小限の API 変更・CI/検証を整備する。
- AWS リソース作成、デプロイ、S3 配置、実環境確認はユーザー自身が行う。
- 独自ドメイン、監視・アラートなどの運用機能は対象外。
- 個人利用・最小コストを重視する。
- IaC は Terraform とし、公開経路・認証・Lambda bootstrap・Neon 接続用途分離などの中核設計は変更しない。
- Lambda 環境変数注入を維持し、接続文字列が state／保存 plan に含まれることをユーザー承認済みとする。S3 backend と保護された state／plan を承認済みの秘密情報保管先として管理する。

### 元計画時の調査と改訂時の引き継ぎ

- API は `net10.0`、EF Core / Npgsql は `10.0.3`。
- 元計画時は起動時マイグレーションが無条件だったが、現在は Lambda 対応と本番での禁止分岐・回帰テストが実装済みとの引き継ぎ。
- `/health` のみ匿名許可。その他は既存の Cognito JWT 認証が必須。
- フロントは `BrowserRouter` を使用し、`/login` とワイルドカードルートがある。
- API クライアントは `/api/...` の相対 URL を使用する。
- Cognito 設定は既存の `VITE_COGNITO_*` からビルド時に取り込まれる。
- 既存の API 統合テストは専用 PostgreSQL DB を作成するため、DB 作成権限を持つローカル検証用 PostgreSQL が必要。
- EF の設計時ファクトリーは存在するが、接続先は設計用固定値。
- `.gitignore` の本番環境ファイル・SAM 成果物除外、SAM IaC、手順書、CI の infra ジョブも実装済み。今回 Terraform 固有部分へ置換・追加する。

### 追加する対象

- Terraform 定義・backend 設定例・mock test、既存の非 Docker Lambda パッケージ作成手順の再利用
- CloudFront・非公開 S3・HTTP API・Lambda の構成
- 本番設定、秘密情報、マイグレーション、検証、更新・復旧の手順
- Lambda 稼働に必要な最小限の API 変更と回帰テスト（実装済みで維持）

### 対象外

agent による実デプロイ・実環境の Terraform plan／apply・AWS 認証情報の設定、CI/CD 自動デプロイ、独自ドメイン、監視・通知、業務機能・DB スキーマ変更、API の追加改修。

## 3. 設計判断

以下はユーザーの当初要求とは区別した設計判断です。中核設計は元計画から維持し、Terraform 固有の構成・秘密管理は会話で提示した改訂案と親から共有されたユーザー承認に基づきます。

### 3.1 IaC：Terraform

**ユーザーの要求変更により SAM を Terraform へ置換します。** `infra/` に単一 root module を置き、初回から module 分割しません。HCL のファイル分割は5節に示します。ユーザーが plan の作成・置換・削除を確認して apply します。CLI の作成コマンドだけによる管理や SAM との二重管理は採用しません。

#### リソース構成

- `aws_apigatewayv2_api`：HTTP API、execute-api endpoint 有効、CORS／JWT Authorizer なし。
- `aws_apigatewayv2_integration`：Lambda の `AWS_PROXY`、payload format `2.0`。
- `aws_apigatewayv2_route`：現行 SAM の明示設定と同じ `ANY /{proxy+}`。
- `aws_apigatewayv2_stage`：`$default`、自動デプロイ有効。
- `aws_lambda_permission`：API Gateway サービス principal と対象 API の execution ARN に限定。
- `aws_lambda_function`：既存 ZIP と3.4節の初期値・環境設定を使用。
- `aws_iam_role` とログ出力用ポリシー／attachment：Lambda trust とログ書き込み。実行ロールに Secret 取得権限は付けない。
- `aws_s3_bucket` と public access block、暗号化、ownership controls：フロント用と Lambda コード配布用を分離。
- `aws_cloudfront_origin_access_control`、`aws_cloudfront_distribution`、`aws_s3_bucket_policy`：S3 REST オリジンと対象 Distribution だけに許可した読み取り。
- `aws_cloudfront_function`：既存コードを JS ファイルへ意味変更なく抽出し、`cloudfront-js-2.0` で公開。
- 既存 Secret は `data.aws_secretsmanager_secret_version` で参照し、Secret 自体の作成・更新は管理しない。

#### state backend と秘密情報保管

- 標準は、ユーザーが事前作成する非公開・暗号化・versioning 有効の **S3 backend＋S3 native lockfile**。`use_lockfile = true` とし、新規に DynamoDB lock テーブルは採用しない。
- state 用バケットはアプリ root module の外で bootstrap し、アプリ削除と一緒に削除しない。local state は標準運用にしない。
- backend は部分設定とし、実環境の bucket／key／region は無視対象の設定ファイルへ置く。AWS 資格情報は profile／通常の credential chain を使い、設定へ埋め込まない。
- ユーザー承認に基づき、state／保存 plan／state バケットを秘密情報保管先として扱う。最小権限、暗号化、保管・削除・バックアップの手順を記載する。S3 内の state は非公開・暗号化で保護する。
- state の過去バージョン、バックアップ、保存 plan にも旧資格情報が残る。Secret 更新で既存コピーが消えるとは説明しない。CI artifact、Issue、レビュー添付、ログへ実値を公開しない。
- Terraform は native locking／mock tests／保持用 `removed` に対応する版を選び、CI・Docker・手順書で同一版に固定する。AWS provider は互換系列を制約し、実際に検証した解決版を `.terraform.lock.hcl` に保存・追跡する。特定版を現時点で検証済みとはしない。

#### Lambda ZIP の配布

- `package-api.sh` で事前作成する `.artifacts/api.zip` をそのまま使う。Terraform の `local_file`／`local-exec` による生成・ビルドはしない。
- 自己完結 .NET ZIP の直接アップロードサイズ制限に依存しないよう、非公開・SSE-S3・所有権設定付きコード配布用 S3 と `aws_s3_object` を使用する。
- ZIP 内容ハッシュを object key に含め、object の `source_hash` と Lambda の `source_code_hash` に使用する。Lambda は同一リージョンの `s3_bucket`／`s3_key` を参照する。
- 旧 ZIP と対応するコード・設定を復旧用に保持する。コード用 S3 の保存だけを旧版復旧の保証にしない。

#### 保持・削除の互換性

元 SAM のフロントバケットには Retain が設定されています。Terraform の `force_destroy = false` だけでは空バケットの削除を防げず、`prevent_destroy` は destroy を完了して保持する機能ではありません。

- フロントバケットに `prevent_destroy = true` と `force_destroy = false` を設定し、通常 apply の意図しない削除・置換を防ぐ。
- 廃止時は `removed` block の `destroy = false` 等で保持対象を明示的に管理解除し、残りの削除 plan を確認する。
- バケット本体だけでなく、public access block・暗号化・ownership controls 等の保護設定も保持対象として扱う。
- コード配布用バケットの保持・手動整理も説明する。単純な `terraform destroy` を SAM Retain と同じとは案内しない。

### 3.2 公開経路：CloudFront と API Gateway HTTP API を採用

```text
ブラウザ
  ├─ Cognito：既存 Amplify による SRP 認証
  └─ CloudFront（HTTPS）
       ├─ /api、/api/* → API Gateway HTTP API → Lambda → Neon
       ├─ /health     → API Gateway HTTP API → Lambda
       └─ その他     → 非公開 S3（OAC）
```

**CloudFront を採用する理由**

- S3 ウェブサイトエンドポイントの HTTP 公開を避ける。
- S3 を非公開にし、OAC で CloudFront だけに読み取りを許可できる。
- SPA と API を同一オリジンにでき、既存 API クライアントを変更せずに済む。

**HTTP API を採用する理由**

- Lambda に HTTP リクエストを渡す標準的な入口として使用できる。
- REST API の機能は現要件に不要。
- JWT 検証は既存 ASP.NET Core 認証に統一し、Gateway 側の JWT Authorizer は追加しない。

#### API 配信設定

- `/api` と `/api/*` のビヘイビアでは全 CRUD メソッドを許可。`/health` は現行どおり GET／HEAD／OPTIONS。
- キャッシュは無効。
- `Authorization`、クエリー文字列、必要なリクエストヘッダーを転送。
- API Gateway 向けには閲覧者の `Host` を転送しない。
- API の3ビヘイビアには管理ポリシー CachingDisabled（`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`）と AllViewerExceptHostHeader（`b689b0a8-53d0-40ab-baf2-68738e2966ac`）を使用し、Authorization・クエリー・Cookie 等を転送する。管理ポリシー ID を使い、名前検索を増やさない。
- `$default` ステージを使い、`/api/...` のパスを維持。
- `/api`、`/api/*`、`/health` を SPA フォールバックから明確に除外。

**CORS は追加しません。** ブラウザは同一 CloudFront オリジンへアクセスします。Gateway 直 URL のブラウザ利用はサポート対象外ですが、curl による検証は可能です。CORS をアクセス制御の代わりには扱いません。

### 3.3 S3・SPA・暗号化

- S3 はウェブサイトホスティングを有効化せず、REST オリジンとして使用。
- Block Public Access を全有効。
- OAC と配信 ID に制限したバケットポリシーを設定。
- 保存時暗号化は SSE-S3。
- HTTP から HTTPS へリダイレクト。
- CloudFront デフォルトドメイン・標準証明書を使用。

SPA フォールバックは、**S3 向けビヘイビアだけに関連付ける CloudFront Function** で行います。

- `/`、`/login`、拡張子のない画面パスを `/index.html` に書き換える。
- アセットへの要求は書き換えない。
- API の 401・404・500 を HTML の 200 に変換しない。
- Distribution 全体の 403/404 カスタムエラー変換は使用しない。

現行の認証は SRP であり、Hosted UI の OAuth リダイレクト URL は不要です。SSE を Server-Sent Events の意味で求める場合も、既存アプリに該当機能はなく追加しません。

### 3.4 Lambda：.NET 10 自己完結 ZIP

推奨方式は次です。

- `provided.al2023` カスタムランタイム
- `linux-x64`、自己完結 publish、ZIP 配布
- `Amazon.Lambda.AspNetCoreServer.Hosting` による HTTP API v2 イベント対応
- ZIP 直下の実行ファイル名を `bootstrap` とし、実行権限を付与
- Native AOT・トリミングは使用しない

既存の EF Core・JWT 認証の動的機能を維持し、Docker や AOT 対応作業を避けます。通常のローカル実行は従来どおり Kestrel を利用します。

初期値：

| 項目 | 推奨値 |
|---|---|
| メモリ | 512 MB |
| タイムアウト | 25 秒 |
| 一時ストレージ | 512 MB |
| 予約済み同時実行数 | 予約なし（当初の 2 からユーザー承認で変更済み） |
| Provisioned Concurrency | なし |
| VPC | 接続しない |
| 環境 | Production |

予約済み同時実行数について、実環境の AWS アカウントの Lambda 同時実行上限は 10 であり、2 を予約すると未予約枠が必要な 10 未満になるため、apply 時に `InvalidParameterValueException` で失敗しました。ユーザー承認により予約設定を削除済みです。将来アカウント上限を引き上げた場合は、予約済み同時実行数を再設定できます。

Lambda 環境変数に `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` を追加済みです。実環境の `provided.al2023` に libicu／ICU がなく、.NET が起動時に FailFast した実障害への対応としてユーザー承認を得ています。親からの共有では、アプリのカルチャ依存は `CultureInfo.InvariantCulture` のみであり、invariant モードと互換です。

Neon と Cognito へ公開 HTTPS/TLS 経由で接続するため、VPC・NAT Gateway は不要です。コールドスタートと Neon 復帰時間はユーザー検証対象にします。

パッケージの対応版、AL2023 上の必要ライブラリー、Terraform／AWS provider の対応は実装時に公式資料とビルド・検証で確認します。今回の計画保存では外部資料による確認は実施していません。

### 3.5 Neon とマイグレーション

#### API 接続

- Neon の **pooled endpoint** を使用。
- URI をそのまま渡すのではなく、Npgsql 形式の接続文字列として設定。
- `SSL Mode=VerifyFull` を基本とし、証明書検証を無効化しない。
- 初期値は `Pooling=true;Minimum Pool Size=0;Maximum Pool Size=5`。
- 接続タイムアウトは 15 秒程度を初期値とし、実環境で確認。
- プールプロキシ経由ではセッション状態に依存する設定や一時オブジェクトを利用しない。
- 自動 prepare は有効化しない。

#### スキーマ適用

**Lambda 起動時にはマイグレーションを実行しません。**

同時コールドスタート時の競合、本番 DDL 権限、起動遅延を避けます。

- EF Core で idempotent SQL を生成する。
- ユーザーが内容を確認する。
- Neon の **direct endpoint** とスキーマ変更権限を持つ資格情報で、`psql` から明示適用する。
- API 用接続は必要なテーブル・シーケンス権限を持つ実行用ロールを使用する。
- SQL 実行は `ON_ERROR_STOP` を有効化。
- パスワードはコマンド引数や手順書へ直接記載しない。

ローカル開発・既存テストの自動適用は維持し、本番だけ無効化します。本番で設定が未指定でも自動適用しない安全側の挙動にします。

### 3.6 設定・秘密情報

#### 秘密情報

Neon の API 用接続文字列は、ユーザーが事前作成する **AWS Secrets Manager の SecretString** に JSON `{"connectionString":"..."}` 形式で保存します。

- Terraform variables／tfvars には Secret ARN のみを渡し、秘密実値を渡さない。
- `data.aws_secretsmanager_secret_version` で `AWSCURRENT` を取得し、`jsondecode(...secret_string).connectionString` を Lambda の `ConnectionStrings__DefaultConnection` に注入する。
- Secret と Secret version の作成用リソースは定義せず、ユーザー管理を維持する。
- シークレット実値を HCL、tfvars、設定例、Outputs、ログに含めない。
- Lambda 実行ロールに Secret 読み取り権限は不要。
- デプロイ実行主体には必要な参照権限が必要。
- Lambda 設定を参照できる IAM 権限も秘密情報へのアクセス権として扱う。

**通常の data 参照と Lambda 環境変数管理では接続文字列が tfstate に保存され、保存 plan にも含まれ得ます。この保管をユーザー承認済みです。** `sensitive` は表示抑制であり、state の非保存や暗号化ではありません。3.1節の保管先・保護手順を適用します。「実値は Secrets Manager にだけ保存される」とは記載しません。

`TF_VAR_*` への変更では state 保存を回避できません。CloudFormation の動的参照文字列は Terraform／Lambda にそのまま渡しても解決されません。CLI 後付けと `ignore_changes` を秘密値非保存の保証として採用しません。アプリへの実行時 SDK は追加しません。

Secrets Manager と state／コード用 S3 には費用があるため、無料構成とは記載しません。

Secret 更新だけでは Lambda に反映されません。ユーザーが通常の refresh を伴う**新しい plan／apply**で再取得・反映します。Secret 更新前の保存 plan の再使用や `-refresh=false` を避けます。CloudFormation 用の `ConfigVersion`／`CONFIG_VERSION` は不要です。

#### Cognito

**User Pool / App Client は IaC に含めず、既存設定の再利用または手動作成を手順化します。**

既存認証資料と整合させ、既存 Pool の置換・ユーザー消失を避けます。

- 自己サインアップ禁止
- SPA 用シークレットなし App Client
- `ALLOW_USER_SRP_AUTH`
- 管理者によるユーザー作成
- 既存 Pool を利用する場合も設定確認を実施

API へは `Cognito__Region`、`Cognito__UserPoolId`、`Cognito__AppClientId` を渡します。

フロントには同じ値を既存の `VITE_COGNITO_*` でビルド時に渡します。これらはブラウザへ公開される識別情報であり、秘密鍵・パスワードではありません。ただし実環境固有値はリポジトリへ保存せず、例示ファイルにはプレースホルダーのみを記載します。

## 4. 要求と受け入れシナリオ

| ID | 操作・条件 | 期待結果 | 実施主体 |
|---|---|---|---|
| R1 | 公開 URL、`/login`、任意の画面パスを直接開く | HTTPS でログイン画面が表示される | ユーザー |
| R2 | 有効なアクセストークンで一覧取得 | 200、JSON 配列が返る | ユーザー |
| R3 | 収支登録後、同月の一覧を取得 | 201 の登録内容と同じデータが返る | ユーザー |
| R4 | トークンなし・不正トークンで一覧取得 | 401。HTML に変換されず、認証付き応答もキャッシュされない | 自動テスト＋ユーザー |
| R5 | S3 のオブジェクトへ直接匿名アクセス | アクセス拒否 | ユーザー |
| R6 | 初期化・更新・検証手順を読む | 必須設定、実行順、失敗時の扱いを再現できる | レビュー |
| R7 | 差分・生成物・設定例を確認 | 接続文字列、パスワード、トークン、AWS 資格情報が追跡対象にない | 実装担当・レビュー |
| R8 | ローカルで IaC 検証・パッケージ作成・回帰テスト | AWS リソースを作らず検証できる | 実装担当 |
| R9 | Secret 更新後、新しい通常 plan／apply を実行 | tfvars に秘密実値を書かず、Lambda の接続文字列が更新される | mock test＋ユーザー |
| R10 | state／plan と保管手順を確認 | 追跡・公開されず、保管先のアクセス制限と旧版を含む秘密管理が明記される | レビュー＋ユーザー |
| R11 | 通常操作でフロントバケットの削除・置換を試み、廃止手順を確認 | 通常操作は保護され、明示的な廃止手順では意図した保持ができる | mock test・レビュー＋ユーザー |
| R12 | AWS 資格情報なしで IaC／SPA 検証 | Terraform validate／mock tests と SPA テストを実行できる | 実装担当・CI |

R1～R5 の実環境確認が未実施の間は、issue の本番受け入れ条件を達成済みとは扱いません。

## 5. 追加・変更・削除ファイル

| パス | 役割 |
|---|---|
| `infra/versions.tf`、`infra/providers.tf` | 追加：CLI／provider 制約、AWS 設定 |
| `infra/backend.tf`、`infra/backend.s3.hcl.example` | 追加：S3 backend 部分設定と bootstrap 後の設定例 |
| `infra/variables.tf`、`infra/terraform.tfvars.example` | 追加：秘密実値を含まない入力定義・設定例 |
| `infra/main.tf` | 追加：共通 locals、既存 Secret data 参照 |
| `infra/lambda.tf` | 追加：Lambda、実行ロール、コード配布 |
| `infra/api.tf` | 追加：HTTP API、統合、ルート、ステージ、permission |
| `infra/storage.tf` | 追加：フロント用／コード用 S3 と保護設定 |
| `infra/cloudfront.tf` | 追加：OAC、Distribution、Function、バケットポリシー |
| `infra/functions/spa-rewrite.js` | 追加：既存 Function コードを意味変更せず抽出 |
| `infra/outputs.tf` | 追加：公開 URL、Distribution ID、配置先、API endpoint、関数名等 |
| `infra/.terraform.lock.hcl` | 追加・追跡：検証した provider 解決版 |
| `infra/tests/deployment.tftest.hcl` | 追加：AWS mock plan の構成検証 |
| `infra/tests/spa-rewrite.test.mjs` | 移設：SPA 書き換えの挙動検証 |
| `infra/template.yaml`、`infra/samconfig.example.toml` | Terraform への置換完了後に削除 |
| `infra/tests/deployment.test.mjs` | YAML 検査を廃止し、SPA／Terraform テストへの置換完了後に削除 |
| `.gitignore` | 変更：Terraform の秘密設定・成果物を除外 |
| `.github/workflows/ci.yml` | 変更：SAM 検証を Terraform 検証に置換。既存非 IaC ステップを継承 |
| `docs/deployment.md` | 変更：Terraform によるユーザー実施の構築・更新・保持・復旧手順 |
| `docs/changes/issue-7/plan.md` | 変更：本改訂計画 |
| `docs/changes/issue-7/review.md` | 実装後に writer が追記・統合。今回は変更しない |

変更せず再利用するもの：`infra/scripts/package-api.sh`、`infra/scripts/generate-migration-sql.sh`、`api/Program.cs`、`api/Kakeibo.Api.csproj`、`api/tests/`、`api/.config/dotnet-tools.json`、`frontend/.env.production.example`、既存フロント実装・テスト、`docs/authentication.md` の本番手順リンク。API 最小変更・bootstrap 設計は IaC と独立であり、再実装しません。

ZIP・SQL・保存 plan の成果物はルートの `.artifacts/` に集約します。保存 plan は秘密情報として権限制限・保管期限・後片付けを手順化します。provider cache／backend 設定等は Terraform の通常配置を使い無視対象にします。

`.gitignore` は既存除外を維持し、Terraform 成果物・設定の除外を追加します。

- `.env.*` と、共有する `*.example` の例外
- `.aws-sam/`、`.artifacts/`
- `infra/samconfig.toml`
- `infra/parameters.local.json`
- `infra/secrets/`
- `.terraform/`、`*.tfstate*`、`*.tfvars`、`*.tfvars.json`、`*.tfplan`
- `crash.log`、`crash.*.log`、`infra/backend.s3.hcl`

`terraform.tfvars.example` と `backend.s3.hcl.example` はプレースホルダーだけを追跡します。`.terraform.lock.hcl` は除外せず追跡します。旧 SAM 成果物の除外は、ローカル生成物の誤追跡を防ぐため当面維持してよいものとします。

除外設定だけで秘密情報の安全性を証明せず、追跡済みファイルも確認します。実接続文字列や Cognito 実値に IaC デフォルトは設けません。リージョン例は `ap-northeast-1` とします。

## 6. 実装タスクとチェック

1. **範囲確認・計画保存** — R6・R10
   - 承認された Terraform 改訂、state の秘密保管、API 最小変更は実装済みで維持することを保存。
   - チェック：会話の承認内容と保存内容が一致し、実装側とユーザー実施側の境界が明記されている。

2. **Terraform 定義・backend 例・provider lock** — R1～R8・R10～R12
   - 5節の HCL、設定例、outputs を作成。中核設計と S3 保持を維持。
   - チェック：`terraform -chdir=infra fmt -check -recursive`、`terraform -chdir=infra init -backend=false -input=false`、`terraform -chdir=infra validate` が成功。

3. **S3 ZIP 配布・IAM・Secret 参照** — R7～R10
   - 既存パッケージを S3 経由で配布し、Secret data 取得から環境変数までを接続。
   - チェック：mock test でハッシュによるコード更新の配線、権限範囲、fake Secret の `connectionString` 注入を確認。秘密実値を入力例・outputs に出さない。

4. **構成テスト置換・SPA テスト移設** — R4・R5・R8～R12
   - 既存12件の検証意図を Terraform test と JS テストで維持。backend／保持条件も検証・レビュー。
   - `mock_provider "aws"`、fake Secret JSON、`command = plan` を使用し、実 AWS を参照・変更しない。計算に必要な ARN・endpoint 等の mock 属性を明示する。
   - チェック：`terraform -chdir=infra test` と `node --test infra/tests/spa-rewrite.test.mjs` が AWS 資格情報なしで成功。
   - Lambda 初期値・本番設定、HTTP API v2／ステージ／permission、3 API ビヘイビアと管理ポリシー、S3 非公開／暗号化／OAC／限定ポリシー、Function 関連付け、CORS／全体エラー変換なしを assertion・レビューで確認。
   - HCL の字面正規表現だけを主検証にしない。tflint は任意で必須依存にしない。mock／validate は AWS の受理、IAM 実権限、実ヘッダー転送の保証ではない。

5. **CI・除外設定・SAM 資産整理** — R7・R8・R10・R12
   - 既存 infra ジョブを継承し、SAM CLI／cfn-lint を固定版 Terraform のセットアップ・fmt／validate／mock tests に置換。ZIP 作成後に検証する。
   - `.gitignore` を追加し、テスト移設後に SAM 固有ファイルを削除。
   - チェック：SAM への実行依存がなく、AWS 認証情報なしで検証できる。state／plan／秘密設定は追跡されず、lock と例示ファイルだけが適切に追跡される。

6. **手順書と検証例** — R1～R7・R9～R11
   - 7節の目次に沿って更新。Cognito・Neon・SQL・フロント配置・curl の既存手順は維持。
   - チェック：bootstrap、初回、更新、Secret 更新、部分失敗、復旧、保持・削除を順序どおり追え、秘密保管・破壊的操作を区別できる。

7. **既存実装の回帰確認・独立レビュー** — R1～R12
   - API／フロントテスト、フロントビルド、Lambda publish と ZIP 直下の実行可能な bootstrap を確認。通常 Kestrel 起動・認証、本番 DDL 禁止、開発・テスト互換を維持。
   - 既存 SQL 生成・使い捨て PostgreSQL への2回適用の検証意図も維持し、既存結果の引用と新たな実行を区別。
   - 本番形式のフロントビルドに DB 接続情報がなく、追跡済み差分にも秘密実値がないことを確認。
   - AWS 資格情報を使う plan／作成／配置／デプロイは agent・CI で実行しない。
   - チェック：writer が新しい検証結果と未実施事項を `review.md` に分離記録し、旧 SAM 成功記録を Terraform 成功として転記しない。

ホストの Terraform CLI／Docker の利用可否は未確認です。CLI がない場合、Docker が利用可能なら固定版 Terraform 公式イメージへリポジトリをマウントして同じ検証を行います。provider ダウンロードのネットワーク、ファイル所有者、ZIP の相対パスを確認します。コマンド実行権限がない場合は成功扱いせず、CI またはユーザー実施へ引き継ぎます。

## 7. デプロイ手順書の目次案

1. 責任分界、構成、費用の発生箇所
2. 前提ツール・バージョン、AWS アカウントと IAM 権限
3. Cognito の再利用／作成、自己登録禁止、管理者ユーザー作成
4. Neon の作成、direct / pooled endpoint、TLS、DB ロール
5. Secret 作成、S3 backend のユーザー bootstrap、state／plan の秘密管理と IAM
6. マイグレーション SQL の生成・確認・適用
7. 既存スクリプトによる Lambda パッケージ作成、Terraform init／fmt／validate／mock tests
8. ユーザーによる新しい plan の保存・差分確認・同じ plan の apply、Terraform outputs の取得
9. Cognito 設定付きフロントビルド、S3 配置、キャッシュ更新
10. 公開 URL・認証・CRUD・S3 非公開の確認
11. アプリ更新と Secret 更新時の反映
12. 障害切り分け、アプリ復旧、DB 復旧の注意
13. リソース削除、保護設定を含む S3 保持・管理解除、state と残存データの扱い
14. 実施結果チェックリスト

S3 はハッシュ付きアセットを先に配置し、`index.html` を最後に更新します。初回構築や障害復旧を除き、古いアセットを即時一括削除しない手順とします。DB の破壊的な downgrade は自動復旧手順に含めません。

初回は Secret／backend 準備 → パッケージ作成 → init → fmt／validate／mock tests → ユーザーによる plan 保存・確認 → 同じ plan の apply → outputs によるフロント配置の順とします。CloudFormation Outputs の取得は Terraform output に置換します。Secret 更新は新しい refresh 付き plan／apply を必須とします。

Terraform に CloudFormation のような自動ロールバックはありません。部分成功時は原因を調べ、再 plan／修正／再 apply を行います。旧 ZIP と対応する旧コード・設定を用いて復旧し、古い tfstate の復元をアプリのロールバック手順にはしません。

既存手順書の主な置換箇所は2節のツール／IAM、5節の秘密情報、7～8節の検証／デプロイ、各節の outputs 取得、11節の更新／復旧、13節の削除、14節のチェックリストです。責任分界、構成、Cognito、Neon、SQL、フロント配置順、curl の意味は維持します。

### ユーザー検証の curl 例

```bash
# トークンなし → 401
curl -i "$PUBLIC_URL/api/entries?month=2031-01"

# 有効なアクセストークン → 200
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$PUBLIC_URL/api/entries?month=2031-01"

# 登録 → 201
curl -i -X POST "$PUBLIC_URL/api/entries" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"date":"2031-01-15","type":"支出","amount":123,"category":"食費","memo":"deployment-check"}'

# 再取得 → 登録内容が一致
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$PUBLIC_URL/api/entries?month=2031-01"
```

`TOKEN` はブラウザでログインして得た**アクセストークン**を一時的に読み込み、コマンド履歴・ログ・検証記録へ実値を残さない方法を記載します。登録 ID を使った検証データの削除も案内します。

追加で、次をユーザーが確認します。

- CloudFront と Gateway 直 URL の両方で認証結果が正しい。
- 認証付き GET の後でも、トークンなし GET は 401。
- `/login` の再読み込みが成功する。
- API の不正パスは JSON / API のエラーであり、SPA の HTML にならない。
- Cognito 自己登録が拒否される。
- S3 直アクセスが拒否される。
- Neon の休止後も、再アクセスで正常動作する。

## 8. 確認事項・実装時外部確認事項

Terraform 化、S3 backend 標準、接続文字列の state／保存 plan への保管許容は、親から共有されたユーザー承認により確定しています。API 最小変更は実装済みで維持します。リージョン、環境名、既存 Cognito の識別子、Secret ARN、backend の bucket／key などはユーザー指定の設定項目です。

実 AWS の SAM スタックが存在しない前提で新規構築手順を整備します。存在する場合は重複作成せず、CloudFormation 管理解除・import 等の移行計画が必要なため親へ返します。この移行を今回の承認範囲へ自動追加しません。

実装時に次を公式資料と検証で確認します。

- S3 native lockfile／mock tests／保持用 `removed` の対応 Terraform 版、DynamoDB locking の非推奨状況、AWS provider の対応 schema。CLI は固定し、provider の制約と lock をそろえる。
- デプロイ主体の `iam:PassRole`、Secret の `GetSecretValue`、顧客管理 KMS 使用時の復号権限、backend state／lockfile の必要最小権限。
- CloudFront と S3 policy の依存循環を避けること、グローバルな Function／OAC 名や S3 名の衝突、コード用 S3 と Lambda の同一リージョン。
- Lambda ZIP の圧縮・展開サイズ上限、AL2023 の実行互換、予約済み同時実行数のアカウント制約。
- apply の部分成功、state lock、backend 移行、保持対象の管理解除と保護設定の残存。実環境の plan／apply／削除による確認はユーザーが行う。

今回の計画更新ではファイルの読み取りと計画保存だけを行い、ビルド・テスト・Terraform 検証・実デプロイを実行していません。旧 `review.md` の検証結果は既存実装の履歴であり、改訂後の Terraform 検証結果ではありません。
