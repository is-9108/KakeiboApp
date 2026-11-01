# issue #7「AWSへのデプロイ」完了レビュー

**現行は Terraform 版。下部の SAM 版は当時の検証・指摘の履歴として原文を保持し、Terraform の検証成功には流用しない。**

## Terraform 移行分（現行）

### 判定・範囲・確認主体

- 計画: `docs/changes/issue-7/plan.md`（Terraform 改訂版）。SAM → Terraform はユーザー要求変更。S3 backend＋native lockfile、接続文字列の state／保存 plan への保管はユーザー承認済み。
- 実装範囲: SAM IaC の Terraform 置換、手順書全面更新、構成テスト・CI の置換、`.gitignore` 追加。API 最小変更・既存 scripts は前回実装を維持。実 AWS plan／apply、backend bootstrap、S3 配置はユーザー実施。
- 仕様レビュー（harness-review-spec）・品質レビュー（harness-review-quality）ともに **要修正 → 全指摘修正済み**との再確認報告。統合結果は **未解決の必須指摘なし／実環境は未検証**。R1–R5 実施まで本番受け入れ条件の達成は確定しない。

本節は親から提供された両レビュー・再確認結果と実装者の検証報告を統合したもの。writer は計画、`docs/deployment.md`、`infra/lambda.tf`、`infra/variables.tf`、`infra/storage.tf`、`infra/tests/deployment.tftest.hcl` の対応箇所を静的確認した。shell・テスト実行・追加 agent・差分の網羅照合は行っていない。以下の実行結果は実装者報告である。指摘 ID は本節内の ID とし、SAM 履歴の同名 ID とは別件。

### 指摘・対応と根拠

| ID・重要度・状態 | 当初の根拠・影響 | 対応・再確認根拠 |
|---|---|---|
| SPEC-1・重要・修正済み | backend 変更手順が `init -reconfigure` のみで、state が移行されない | `docs/deployment.md:308–333` に `umask 077` での state バックアップ、`init -migrate-state`、`state list`／`plan` による移行確認、`-reconfigure` の用途区別を追加。spec 再確認報告と writer 静的確認 |
| SPEC-2・重要・修正済み | ZIP の S3 object key 切り替えで旧オブジェクトが削除され、「旧 ZIP 保持」は暗黙には実現しない | `docs/deployment.md:660–681,745–754` に更新前の `.artifacts/releases/<日時>/` への退避（`umask 077`、api.zip・tfvars・outputs・git revision・Lambda 設定）と秘密情報扱いを追加し、復旧説明を修正。`infra/lambda.tf:25–28` に旧 key 削除と退避先を明記。spec 再確認報告と writer 静的確認 |
| SPEC-3・重要・修正済み | 廃止時に outputs 等の参照が残り、削除 plan が成立しない | `docs/deployment.md:779–870` を5段階化。outputs・data／locals 整理 → CloudFront／API／Lambda／IAM／ZIP 削除 → artifacts バケットの `removed`（`destroy=false`）→ site バケットと保護設定の管理解除 → 最終 `plan` の No changes・state／残存保護確認と失敗時切り分け。spec 再確認報告と writer 静的確認。実際の廃止操作は未検証 |
| SPEC-4・軽微・修正済み | 「実値は Secrets Manager にだけ保存」という説明が state／plan 保存と矛盾 | `docs/deployment.md:214,337–346` を、入力・更新先は Secrets Manager、値は Lambda 環境変数・state・保存 plan にも保存、と修正。spec 再確認報告と writer 静的確認 |
| QUALITY-1・重要・修正済み | 長い `name_prefix` により S3 バケット名が63字を超える | `infra/variables.tf:7–17` で prefix を3〜16字・正規表現検証、`infra/storage.tf:7–18,54–63` で両バケットに3〜63字・命名規則の precondition を追加。`infra/tests/deployment.tftest.hcl:284–322` に16字＋`ap-southeast-4` の境界値と17字の `expect_failures`。理論最大は site 49字／artifacts 54字との報告。quality 再確認報告、writer 静的確認、最終 mock test 3 passed が根拠 |
| QUALITY-2・軽微・修正済み | SPA 関連付け assertion が `function_arn` を比較せず、誤った関数を検出できない | `infra/tests/deployment.tftest.hcl:47–52,250–265` で mock ARN を定義し、関連付け先を `aws_cloudfront_function.spa_rewrite.arn` と比較。quality 再確認報告、writer 静的確認、最終 mock test 3 passed が根拠 |

仕様レビューは HTTP API／Lambda／IAM、2バケット分離、OAC、管理ポリシー ID、CORS 不追加、本番マイグレーション禁止、SPA Function 等の設計適合を確認したとの報告。品質レビューは命名境界値と assertion の有効性を含む正確性・テスト・安全性を確認したとの報告。

実装側の判断（`fixtures/api.zip.placeholder`、`disable_execute_api_endpoint=false` の明示、承認済み SAM 3ファイルの `git rm` による削除）は仕様レビューで妥当と評価。`opencode.jsonc` の `sam validate` エントリ残留は今回の対象外。両観点間で追加検証を要する食い違いは提供結果になく、多数決や推測による指摘の削除はしていない。

### 検証（実装者報告）

Terraform コマンドは `infra/` を対象とする。mock plan は実 AWS plan／apply とは区別する。

| コマンド・検証対象 | 報告結果・時点 |
|---|---|
| `terraform -chdir=infra fmt -check -recursive` | exit 0 |
| `terraform init -backend=false -input=false` | exit 0 |
| `terraform validate` | exit 0。Terraform 1.17.1 固定、AWS provider 解決版 6.71.0、`.terraform.lock.hcl` 追跡 |
| `terraform test`（`mock_provider`、`command=plan`） | 3 passed（修正後の最終状態） |
| `node --test infra/tests/spa-rewrite.test.mjs` | 4 passed |
| `docker compose run api dotnet test` | 90 passed。アプリコード不変のため Terraform 変更後の再実行なし |
| frontend `npm test` | 184 passed。同上、Terraform 変更後の再実行なし |
| `package-api.sh`／`generate-migration-sql.sh` | ともに exit 0 |
| SAM 実行依存の整理 | `template.yaml`／`samconfig.example.toml`／`deployment.test.mjs` 削除済み、docs に SAM 固有の実行指示なしとの報告。上記の設定エントリ残留は対象外 |

Docker 実行由来の root 所有 `api/obj` により一時ビルド失敗があったが、所有権復旧後に成功したとの報告（コード起因ではない）。旧 SAM 検証、以前のアプリ回帰結果、新しい Terraform 検証を区別し、変更後に未実行の検証を再成功扱いしない。

### 秘密情報・確認限界

- ソース・HCL・tfvars・tfvars.example・CI・docs に秘密実値はなく、例示はプレースホルダーのみとの報告。接続文字列の state／保存 plan 保管は承認済みであり、実値をレビューへ転記しない。
- `.gitignore` に `.terraform/`、`*.tfstate*`、`*.tfvars`、`*.tfvars.json`、`*.tfplan`、`crash.log`、`infra/backend.s3.hcl` を追加。`.terraform.lock.hcl`・`*.example` は追跡するとの報告。
- 実追跡ファイルに秘密がないことは実装者からの確認報告による。両レビュー担当は shell 制約で diff の網羅照合を未実施。writer も全追跡ファイル・差分の完全走査は行っておらず、除外設定だけで秘密情報なしを証明したとは扱わない。

### ユーザー実施・未検証・対象外

- **ユーザー実施・未検証**: 実 AWS への `terraform init -backend-config`／plan／apply、backend バケット bootstrap、Secrets Manager 実値登録、S3 配置、CloudFront 伝播。
- **R1–R5 未実施**: 公開 URL・ログイン・CRUD／永続化・401と非キャッシュ／HTML非変換・S3直アクセス拒否の実環境確認。本番受け入れ条件は達成済みとしない。
- **その他の未検証**: `prevent_destroy` の実際の destroy 挙動、保持・管理解除、実 IAM 権限・ヘッダー転送、Secret 更新の実反映、CI の実実行（YAML 検証・ローカル等価検証のみ）。R9–R12 も mock／静的確認／報告範囲と実環境・CI の確認を分ける。
- **未解決の必須指摘**: なし（提供された再確認結果と上記の静的確認範囲）。未検証事項は解消済みとはしない。
- **対象外**: `opencode.jsonc` の SAM エントリ整理、API 追加改修、CI/CD 自動デプロイ、独自ドメイン、監視・通知、業務機能・DB スキーマ変更。実 AWS 操作は実装担当の対象外であり、ユーザー実施事項として残す。

---

## SAM 版の履歴（以下は移行前の記録・原文保持）

以下の判定・ファイル名・行番号・未実施事項は SAM 版当時のもの。現行の手順は `docs/deployment.md`、現行の判定は上の Terraform 節を参照する。

## 1. 判定・確認範囲

- 承認済み計画: `docs/changes/issue-7/plan.md`。
- 実装範囲: SAM による IaC、デプロイ手順書、Lambda 稼働用の最小限 API 変更（`AddAWSLambdaHosting`、本番起動時マイグレーション停止、回帰テスト）、CI。
- 仕様レビュー（harness-review-spec）: **要修正 → OK**。必須指摘は修正・再確認済みとの報告。
- 品質レビュー（harness-review-quality）: **要修正 → 指摘1件が誤検知として解消**。親の実物確認により修正不要と確定。
- 統合結果: **未解決の必須指摘なし。ただし実 AWS 環境は未検証**。R1–R5 未実施の間は、issue の本番受け入れ条件を達成扱いしない。

本書は親から渡された両レビューと最終検証結果の統合記録。writer は計画、`infra/template.yaml`、`infra/tests/deployment.test.mjs`、`docs/deployment.md` の修正箇所を静的確認した。shell・テスト実行・追加 agent は使用していない。以下の実行結果は実装者報告であり、writer 自身の実行結果ではない。

仕様レビューでは SAM、CloudFront＋OAC、HTTP API、自己完結 ZIP、Neon の接続用途分離、Secrets Manager 動的参照、Cognito の IaC 対象外化、SPA フォールバック、CORS 不追加などの計画適合を確認。既存差分なし・対象外への踏み込みなしとの報告。品質レビューでは正確性・テスト・安全性の観点から確認し、Production 判定と `GetValue<bool>` による設定分岐を静的に妥当と評価した。環境判定の異常系の追加テストは任意とされた。

## 2. 検証

実施者は実装者。最終状態について次の結果が報告された。

| コマンド・検証対象 | 報告結果 |
| --- | --- |
| `node --test 'infra/tests/**/*.test.mjs'` | 12 passed / 0 failed |
| `sam validate --lint`（Docker 上の SAM CLI＋cfn-lint） | valid SAM Template |
| `dotnet build api/Kakeibo.slnx -v minimal` | 0 エラー。既存テストコード由来の CS8631 警告5件 |
| `docker compose run --rm api dotnet test Kakeibo.slnx`（クリーン状態） | 90 passed / 0 failed |
| `cd frontend && npm test` | 184 passed / 0 failed |
| 例示 `VITE_COGNITO_*` での `npm run build` | 成功。`dist` に DB 接続情報なし |
| Lambda ZIP | `.artifacts/api.zip` の `bootstrap` に実行権限あり。Lambda 外で `/health` が 200 |
| マイグレーション SQL・起動設定 | 冪等 SQL の2回適用成功。Production 設定では未実行、Development では実行を確認 |
| 修正後のシェルスニペット（aws スタブ） | argv にパスワードなし、一時ファイル mode 600、終了後の残存なし |
| `git diff --check` | 問題なし |

開発時のビルド成果物混在で MSB3030 が一時発生したが、クリーン再実行で解消し、コード問題ではないとの報告。ホストに `sam`・`psql` がないため、SAM 検証は Docker、SQL 適用は Docker の PostgreSQL で実施した。これらは実 AWS・Neon 上での成功を意味しない。

### 秘密情報の安全性

- ソース、テンプレート、IaC 既定値、手順書例に実値なし（プレースホルダーのみ）との報告。
- `.gitignore` に `.env.*`（`*.example` は例外）、`.aws-sam/`、`.artifacts/`、`infra/samconfig.toml`、`infra/parameters.local.json`、`infra/secrets/` を追加したとの報告。
- spec reviewer は shell 制限により `git status` / `git diff` の完全走査を実施できていない。実装者は `git diff --check` と除外確認を報告している。writer も完全走査は実施していないため、各担当の確認範囲を区別する。

## 3. 指摘と対応

修正済みの状態は親からの再確認結果と、writer の修正箇所の静的確認に基づく。テスト成功は前節の実装者報告による。

| ID・重要度・状態 | 当初の根拠・影響 | 対応・確認根拠 |
| --- | --- | --- |
| SPEC-1・重要・修正済み | CloudFront の自前 Origin Request Policy の allowlist に `Authorization` を含めており、認証ヘッダー転送の構成に問題 | AWS 管理ポリシー AllViewerExceptHostHeader（`b689b0a8-53d0-40ab-baf2-68738e2966ac`）へ変更。`infra/template.yaml:215–254` で3ビヘイビアへの適用、`infra/tests/deployment.test.mjs:127–135` で件数と自前ポリシー不使用のテストを確認。API Gateway 用とする公式ドキュメントの確認は親からの報告 |
| SPEC-2・重要・修正済み | `cd frontend` 後にルートへ戻らず、後続コマンドのパスが破綻 | `docs/deployment.md:370–377` でルート基準を明記し、ビルドをサブシェル化したことを確認 |
| SPEC-3・重要・修正済み | `jq --arg` によるパスワードの argv 露出、`chmod 600` 後置、Cognito `--password` の履歴残存 | `docs/deployment.md:131–148,216–236,520–534` で `$ENV.DB_PASSWORD` 等の環境変数参照、`umask 077`＋`mktemp`＋`trap`、`read -s`＋`--cli-input-json` を確認。修正後スニペットの aws スタブ検証結果は前節のとおり |
| SPEC-4・軽微・修正済み | `rollback-stack` を一般的な復旧手段として過信する記載 | `docs/deployment.md:549–557` で失敗トランジションに対する用途と、成功済みデプロイを旧テンプレート・旧パッケージの再デプロイで戻す手順の区別を確認。spec 再確認で解消との報告 |
| 追加確認・修正済み | SAM の `--config-file` はテンプレート基準で解決され、既存コマンド例では設定パスが誤る | `docs/deployment.md:339–342,505–507,541–542` で `(cd infra && sam deploy --config-file samconfig.toml --template-file template.yaml)` への変更を確認 |
| QUALITY-1・重要（当初判定のみ）・誤検知／不採用 | レビュー時の `docs/deployment.md:262` の `read -rsp ... PGPASSWORD; export PGPASSWORD` を「export が失敗し psql にパスワードが渡らない」と指摘 | 親が該当行を直接確認。`read` がシェル変数へ設定した後に `export` する構文は正しく、修正不要。writer も現行 `docs/deployment.md:281–282` の当該構文を静的確認。元の懸念と、不採用の根拠を保持する |

多数決による指摘の削除はしていない。QUALITY-1 は構文の実物確認に基づく誤検知として整理した。

## 4. ユーザー実施事項・未検証・対象外

### ユーザー実施・未検証

- 実際の `sam deploy`、S3 配置、CloudFront / HTTP API / Lambda の実動作、Secrets Manager 動的参照、Cognito / Neon 接続。
- 計画の本番受け入れシナリオ:
  - R1: 公開 URL・`/login`・画面パスの HTTPS 表示。
  - R2: ログイン・有効なアクセストークンによる一覧取得。
  - R3: CRUD・登録後の再取得による永続化確認。
  - R4: トークンなし・不正トークンで401、HTMLへの変換なし、認証付き応答のキャッシュなし。
  - R5: S3 への直接匿名アクセス拒否。
- コールドスタートおよび Neon 休止後の復帰時間。

**R1–R5 は未実施。本番受け入れ条件は未達成扱いとする。** R6（手順の再現性）はレビューと修正確認、R7（秘密情報）は報告された除外確認と上記の走査制限、R8（ローカル検証）は実装者の最終検証報告を根拠とし、実環境検証とは分ける。

### その他の未検証

- GitHub Actions の infra ジョブは定義のみで、実行結果は未確認。
- writer によるテスト・コマンド実行は未実施。API コード、全追跡ファイルの独立した完全走査は行っていない。

### 未解決・対象外

- 未解決の必須指摘: なし（親から提供された統合結果の範囲）。環境判定の異常系追加テストは任意であり、実施済みとは扱わない。
- 実装側の対象外: 実 AWS 操作、AWS 認証情報の設定、CI/CD 自動デプロイ、独自ドメイン、監視・通知、業務機能・DB スキーマ変更。実 AWS 操作は上記のユーザー実施事項として残す。

---

## 実デプロイ結果と途中修正（2026-11-01）

実 AWS・Neon への操作と環境チェックはユーザー実行の報告による。上の Terraform 移行レビュー・SAM 履歴は当時の記録として保持し、本節を後続の実施結果とする。writer は修正対象の HCL・assertion・手順書の該当箇所を静的確認したが、コマンド・テスト・実環境確認は実行していない。

### 実デプロイと承認済み修正

- task チャットのガイドに沿って、Neon DB・ロール作成、マイグレーション適用（冪等 SQL を2回適用し成功）、Secrets Manager 登録（`kakeibo/database`、`ap-northeast-1`）、Cognito User Pool／App Client（シークレットなし・SRP 有効・自己登録なし）、state バケット bootstrap、`terraform.tfvars`／`backend.s3.hcl` 設定を実施。
- 初回は `terraform plan` の21リソースを apply。Lambda の予約同時実行2が `InvalidParameterValueException` で失敗した。アカウント同時実行上限10に対し、未予約の最低枠10を確保する必要があったため。
- **修正1（ユーザー承認・反映済み）**: `infra/lambda.tf` の `reserved_concurrent_executions = 2` を削除。`infra/tests/deployment.tftest.hcl` の assertion を予約なし（null／-1）に変更。2回目 plan は **4 add／1 destroy**（tainted Lambda の再作成）となり、apply 成功。
- 実デプロイ後の500に対し、CloudWatch ログで `Couldn't find a valid ICU package` を確認。`provided.al2023` に libicu がないことが原因。
- **修正2（ユーザー承認・反映済み）**: `infra/lambda.tf` の環境変数へ `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` を追加し、`infra/tests/deployment.tftest.hcl` に assertion、`docs/deployment.md` 12章に切り分け説明を追加。アプリは `InvariantCulture` のみ使用のため互換との報告。3回目 plan は **1 to update** となり、apply 成功。

### 修正後の検証

- 報告結果: 変更ファイルの `terraform fmt -check`、`terraform validate` 成功、`terraform test` **3 passed**。
- API コード不変のため API 回帰は再実行なし。前回の API **90 passed**／フロント **184 passed** は既存結果であり、今回の再実行結果ではない。
- writer は `infra/lambda.tf` の予約設定削除・invariant 環境変数、`infra/tests/deployment.tftest.hcl` の対応 assertion、`docs/deployment.md` 12章の ICU 切り分けを静的確認した。

### ユーザー実施の環境チェック

| 確認対象 | 報告結果 |
|---|---|
| CloudFront の `/`・`/login` | ともに200、`/login` の直接表示も成功 |
| トークンなし `/api/entries` | **401** |
| ブラウザログイン・月次画面 | ログイン成功、月次画面表示 |
| 収支登録・一覧・永続化 | 登録が一覧へ反映され、リロード後も保持 |
| S3 直アクセス | **403 Forbidden** |

有効トークンによる curl の200／201明示取得は未確認（UI 内の取得・登録は確認済み）。未報告の確認項目は完了扱いにせず、本節だけで R1–R5 全項目の達成とは断定しない。

### 秘密情報

セッションに貼られたパスワードはローテーション済み（ユーザー承認・報告）。実値・ARN は本記録に記載しない。
