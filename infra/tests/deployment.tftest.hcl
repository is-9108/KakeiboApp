# Terraform の plan を mock provider で評価し、AWS を参照・変更せずに構成条件を検証する。
# 実行: terraform -chdir=infra test
#
# - command = plan のため、リソースは作成されない。
# - Secret は data 参照のため、mock の SecretString（ダミー値）を注入する。
# - ZIP は内容をハッシュするだけで、plan では展開・検証しない。テスト専用の
#   プレースホルダーを使い、package-api.sh の実行順に依存させない。

mock_provider "aws" {
  # plan 時点で computed 属性（ARN・ID など）を生成し、plan の assertion で比較できるようにする。
  override_during = plan

  # plan の assertion で参照する computed 属性は、意味の分かる固定値にする。
  mock_resource "aws_s3_bucket" {
    override_during = plan
    defaults = {
      id  = "mock-bucket-id"
      arn = "arn:aws:s3:::mock-bucket"
    }
  }

  mock_resource "aws_cloudfront_origin_access_control" {
    override_during = plan
    defaults = {
      id  = "mock-oac-id"
      arn = "arn:aws:cloudfront::123456789012:origin-access-control/mock-oac"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    override_during = plan
    defaults = {
      id            = "mockapi1"
      execution_arn = "arn:aws:execute-api:ap-northeast-1:123456789012:mockapi1"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    override_during = plan
    defaults = {
      id          = "MOCKDIST"
      arn         = "arn:aws:cloudfront::123456789012:distribution/MOCKDIST"
      domain_name = "mock.cloudfront.net"
    }
  }

  mock_resource "aws_cloudfront_function" {
    override_during = plan
    defaults = {
      arn = "arn:aws:cloudfront::123456789012:function/mock-spa-rewrite"
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_secretsmanager_secret_version" {
    defaults = {
      secret_string = "{\"connectionString\":\"Host=example-pooler.neon.tech;Port=5432;Database=kakeibo;Username=kakeibo_app;Password=placeholder;SSL Mode=VerifyFull;Pooling=true;Minimum Pool Size=0;Maximum Pool Size=5;Timeout=15\"}"
    }
  }
}

override_resource {
  target          = aws_s3_bucket.receipts
  override_during = plan
  values = {
    arn = "arn:aws:s3:::mock-receipts-bucket"
  }
}

run "deployment_plan" {
  command = plan

  variables {
    database_secret_arn        = "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:kakeibo/database-EXAMPLE"
    cognito_user_pool_id       = "ap-northeast-1_xxxxxxxxx"
    cognito_app_client_id      = "xxxxxxxxxxxxxxxxxxxxxxxxxx"
    api_zip_path               = "tests/fixtures/api.zip.placeholder"
    monthly_batch_zip_path     = "tests/fixtures/monthly-batch.zip.placeholder"
    monthly_notification_email = "monthly@example.com"
  }

  # --- レシート用バケット ---------------------------------------------------
  assert {
    condition = (
      aws_s3_bucket_public_access_block.receipts.block_public_acls &&
      aws_s3_bucket_public_access_block.receipts.block_public_policy &&
      aws_s3_bucket_public_access_block.receipts.ignore_public_acls &&
      aws_s3_bucket_public_access_block.receipts.restrict_public_buckets
    )
    error_message = "レシートの公開アクセスを全て拒否する必要があります。"
  }

  assert {
    condition = (
      !aws_s3_bucket.receipts.force_destroy &&
      length(aws_s3_bucket.receipts.bucket) <= 63 &&
      can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", aws_s3_bucket.receipts.bucket)) &&
      aws_s3_bucket.receipts.bucket != aws_s3_bucket.site.bucket &&
      aws_s3_bucket.receipts.bucket != aws_s3_bucket.artifacts.bucket
    )
    error_message = "レシートバケットの命名と削除保護が不正です。"
  }

  assert {
    condition = (
      one(aws_s3_bucket_server_side_encryption_configuration.receipts.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256" &&
      one(aws_s3_bucket_ownership_controls.receipts.rule).object_ownership == "BucketOwnerEnforced"
    )
    error_message = "暗号化と所有者強制が必要です。"
  }

  assert {
    condition = (
      length(aws_s3_bucket_lifecycle_configuration.receipts.rule) == 1 &&
      one(aws_s3_bucket_lifecycle_configuration.receipts.rule).status == "Enabled" &&
      one(aws_s3_bucket_lifecycle_configuration.receipts.rule).expiration[0].days == 7 &&
      one(aws_s3_bucket_lifecycle_configuration.receipts.rule).filter[0].prefix == "" &&
      one(aws_s3_bucket_lifecycle_configuration.receipts.rule).abort_incomplete_multipart_upload[0].days_after_initiation == 7
    )
    error_message = "全レシートと未完了アップロードを7日で削除する必要があります。"
  }

  assert {
    condition = (
      length(aws_s3_bucket_cors_configuration.receipts.cors_rule) == 1 &&
      one(aws_s3_bucket_cors_configuration.receipts.cors_rule).allowed_methods == toset(["PUT"]) &&
      one(aws_s3_bucket_cors_configuration.receipts.cors_rule).allowed_origins == toset(["https://${aws_cloudfront_distribution.site.domain_name}"]) &&
      one(aws_s3_bucket_cors_configuration.receipts.cors_rule).allowed_headers == toset(["Content-Type"])
    )
    error_message = "本番オリジンからのPUTだけを許可する必要があります。"
  }

  assert {
    condition = (
      length(jsondecode(aws_iam_role_policy.api_receipts.policy).Statement) == 1 &&
      jsondecode(aws_iam_role_policy.api_receipts.policy).Statement[0].Action == ["s3:PutObject"] &&
      jsondecode(aws_iam_role_policy.api_receipts.policy).Statement[0].Resource == "${aws_s3_bucket.receipts.arn}/receipts/*" &&
      aws_lambda_function.api.environment[0].variables["Receipts__BucketName"] == aws_s3_bucket.receipts.bucket
    )
    error_message = "署名権限とバケット設定が不正です。"
  }

  # --- Lambda の実行形式と承認済み初期値 -------------------------------------
  assert {
    condition = (
      aws_lambda_function.api.runtime == "provided.al2023" &&
      aws_lambda_function.api.handler == "bootstrap" &&
      length(aws_lambda_function.api.architectures) == 1 &&
      contains(aws_lambda_function.api.architectures, "x86_64") &&
      aws_lambda_function.api.memory_size == 512 &&
      aws_lambda_function.api.timeout == 25 &&
      one(aws_lambda_function.api.ephemeral_storage).size == 512 &&
      # 予約同時実行は設定しない（null = 未設定、-1 = 予約なし）。アカウント上限が 10 のため。
      coalesce(aws_lambda_function.api.reserved_concurrent_executions, -1) == -1
    )
    error_message = "Lambda の runtime / handler / architecture / 初期値が計画と一致しません（予約同時実行はなし）。"
  }

  # --- Lambda 環境変数と Secret 注入 ----------------------------------------
  assert {
    condition = (
      one(aws_lambda_function.api.environment).variables["ASPNETCORE_ENVIRONMENT"] == "Production" &&
      one(aws_lambda_function.api.environment).variables["Database__RunMigrationsOnStartup"] == "false" &&
      one(aws_lambda_function.api.environment).variables["Cognito__Region"] == "ap-northeast-1" &&
      one(aws_lambda_function.api.environment).variables["Cognito__UserPoolId"] == "ap-northeast-1_xxxxxxxxx" &&
      one(aws_lambda_function.api.environment).variables["Cognito__AppClientId"] == "xxxxxxxxxxxxxxxxxxxxxxxxxx" &&
      # provided.al2023 に libicu が無いため、invariant モードでの起動を必須にする。
      one(aws_lambda_function.api.environment).variables["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] == "1"
    )
    error_message = "Lambda の本番設定・Cognito 設定・グローバリゼーション設定が計画と一致しません。"
  }

  assert {
    condition = nonsensitive(
      one(aws_lambda_function.api.environment).variables["ConnectionStrings__DefaultConnection"]
    ) == "Host=example-pooler.neon.tech;Port=5432;Database=kakeibo;Username=kakeibo_app;Password=placeholder;SSL Mode=VerifyFull;Pooling=true;Minimum Pool Size=0;Maximum Pool Size=5;Timeout=15"
    error_message = "Secret の connectionString が Lambda 環境変数へ注入されていません。"
  }

  # --- ZIP 配布の配線（ハッシュ付き key / source_code_hash）------------------
  assert {
    condition = (
      aws_s3_object.api_zip.key == "api/${aws_s3_object.api_zip.source_hash}.zip" &&
      aws_lambda_function.api.source_code_hash == aws_s3_object.api_zip.source_hash &&
      aws_lambda_function.api.s3_bucket == aws_s3_bucket.artifacts.bucket &&
      aws_lambda_function.api.s3_key == aws_s3_object.api_zip.key
    )
    error_message = "ZIP の S3 配布と Lambda のコード更新の配線が計画と一致しません。"
  }

  # --- HTTP API / ルート / ステージ / permission ----------------------------
  assert {
    condition = (
      aws_apigatewayv2_api.api.protocol_type == "HTTP" &&
      aws_apigatewayv2_api.api.disable_execute_api_endpoint == false &&
      aws_apigatewayv2_integration.api.integration_type == "AWS_PROXY" &&
      aws_apigatewayv2_integration.api.payload_format_version == "2.0" &&
      aws_apigatewayv2_route.proxy.route_key == "ANY /{proxy+}" &&
      aws_apigatewayv2_stage.default.name == "$default" &&
      aws_apigatewayv2_stage.default.auto_deploy == true
    )
    error_message = "HTTP API・統合・ルート・$default ステージが計画と一致しません。"
  }

  assert {
    condition = (
      aws_lambda_permission.api.action == "lambda:InvokeFunction" &&
      aws_lambda_permission.api.principal == "apigateway.amazonaws.com" &&
      aws_lambda_permission.api.source_arn == "${aws_apigatewayv2_api.api.execution_arn}/*/*"
    )
    error_message = "Lambda permission が対象 API の execution ARN に限定されていません。"
  }

  assert {
    condition     = length(aws_apigatewayv2_api.api.cors_configuration) == 0
    error_message = "HTTP API に CORS 設定を追加しないでください（同一 CloudFront オリジンで運用）。"
  }

  # --- S3: 非公開・SSE-S3・所有権・フロントバケット保護 ----------------------
  assert {
    condition = (
      aws_s3_bucket.site.force_destroy == false &&
      aws_s3_bucket.artifacts.force_destroy == false
    )
    error_message = "S3 バケットの force_destroy は false にしてください。"
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.site.block_public_acls == true &&
      aws_s3_bucket_public_access_block.site.block_public_policy == true &&
      aws_s3_bucket_public_access_block.site.ignore_public_acls == true &&
      aws_s3_bucket_public_access_block.site.restrict_public_buckets == true &&
      aws_s3_bucket_public_access_block.artifacts.block_public_acls == true &&
      aws_s3_bucket_public_access_block.artifacts.block_public_policy == true &&
      aws_s3_bucket_public_access_block.artifacts.ignore_public_acls == true &&
      aws_s3_bucket_public_access_block.artifacts.restrict_public_buckets == true
    )
    error_message = "S3 の Block Public Access が全有効になっていません。"
  }

  assert {
    condition = (
      one(one(aws_s3_bucket_server_side_encryption_configuration.site.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256" &&
      one(one(aws_s3_bucket_server_side_encryption_configuration.artifacts.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256" &&
      one(aws_s3_bucket_ownership_controls.site.rule).object_ownership == "BucketOwnerEnforced" &&
      one(aws_s3_bucket_ownership_controls.artifacts.rule).object_ownership == "BucketOwnerEnforced"
    )
    error_message = "S3 の SSE-S3 暗号化・所有権設定が計画と一致しません。"
  }

  # --- CloudFront: OAC・オリジン・バケットポリシー ---------------------------
  assert {
    condition = (
      aws_cloudfront_origin_access_control.site.origin_access_control_origin_type == "s3" &&
      aws_cloudfront_origin_access_control.site.signing_behavior == "always" &&
      aws_cloudfront_origin_access_control.site.signing_protocol == "sigv4" &&
      [for origin in aws_cloudfront_distribution.site.origin :
        origin.origin_access_control_id if origin.origin_id == "S3Origin"
      ] == [aws_cloudfront_origin_access_control.site.id]
    )
    error_message = "CloudFront の S3 オリジンに OAC が設定されていません。"
  }

  assert {
    condition = (
      [for origin in aws_cloudfront_distribution.site.origin :
        origin.domain_name if origin.origin_id == "ApiOrigin"
      ][0] == "${aws_apigatewayv2_api.api.id}.execute-api.ap-northeast-1.amazonaws.com"
    )
    error_message = "CloudFront の API オリジンが HTTP API の execute-api を向いていません。"
  }

  assert {
    condition = (
      jsondecode(aws_s3_bucket_policy.site.policy).Statement[0].Principal.Service == "cloudfront.amazonaws.com" &&
      jsondecode(aws_s3_bucket_policy.site.policy).Statement[0].Action == "s3:GetObject" &&
      jsondecode(aws_s3_bucket_policy.site.policy).Statement[0].Condition.StringEquals["AWS:SourceArn"] == aws_cloudfront_distribution.site.arn
    )
    error_message = "S3 バケットポリシーが対象 Distribution だけに読み取りを許可していません。"
  }

  # --- CloudFront ビヘイビア: 3 つの API パス・キャッシュ無効 ----------------
  assert {
    condition = (
      length(aws_cloudfront_distribution.site.ordered_cache_behavior) == 3 &&
      sort([for b in aws_cloudfront_distribution.site.ordered_cache_behavior : b.path_pattern]) == tolist(["/api", "/api/*", "/health"])
    )
    error_message = "API のパスに対応する 3 つのビヘイビアがありません。"
  }

  assert {
    condition = (
      alltrue([for b in aws_cloudfront_distribution.site.ordered_cache_behavior : b.target_origin_id == "ApiOrigin"]) &&
      alltrue([for b in aws_cloudfront_distribution.site.ordered_cache_behavior : b.viewer_protocol_policy == "redirect-to-https"])
    )
    error_message = "API ビヘイビアのオリジンまたは HTTPS 強制が計画と一致しません。"
  }

  assert {
    condition = (
      alltrue([for b in aws_cloudfront_distribution.site.ordered_cache_behavior : b.cache_policy_id == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"]) &&
      alltrue([for b in aws_cloudfront_distribution.site.ordered_cache_behavior : b.origin_request_policy_id == "b689b0a8-53d0-40ab-baf2-68738e2966ac"])
    )
    error_message = "API ビヘイビアが CachingDisabled / AllViewerExceptHostHeader を使っていません。"
  }

  assert {
    condition = (
      alltrue([for b in aws_cloudfront_distribution.site.ordered_cache_behavior :
        b.path_pattern == "/health"
        ? toset(b.allowed_methods) == toset(["GET", "HEAD", "OPTIONS"])
        : toset(b.allowed_methods) == toset(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"])
      ])
    )
    error_message = "/health は GET/HEAD/OPTIONS のみ、/api 系は全 CRUD メソッドを許可してください。"
  }

  # --- SPA フォールバックは S3 ビヘイビアだけに関連付ける --------------------
  assert {
    condition = (
      aws_cloudfront_distribution.site.default_cache_behavior[0].target_origin_id == "S3Origin" &&
      aws_cloudfront_distribution.site.default_cache_behavior[0].cache_policy_id == "658327ea-f89d-4fab-a63d-7e88639e58f6" &&
      length(aws_cloudfront_distribution.site.default_cache_behavior[0].function_association) == 1 &&
      [for a in aws_cloudfront_distribution.site.default_cache_behavior[0].function_association : a.event_type] == ["viewer-request"] &&
      [for a in aws_cloudfront_distribution.site.default_cache_behavior[0].function_association : a.function_arn] == [aws_cloudfront_function.spa_rewrite.arn] &&
      length(flatten([for b in aws_cloudfront_distribution.site.ordered_cache_behavior : b.function_association])) == 0 &&
      strcontains(aws_cloudfront_function.spa_rewrite.code, "function handler(event)") &&
      strcontains(aws_cloudfront_function.spa_rewrite.code, "/index.html") &&
      aws_cloudfront_function.spa_rewrite.runtime == "cloudfront-js-2.0" &&
      aws_cloudfront_function.spa_rewrite.publish == true
    )
    error_message = "SPA フォールバック関数が S3 ビヘイビアだけに関連付いていません。"
  }

  # --- API のエラーを HTML に変換しない --------------------------------------
  assert {
    condition     = length(aws_cloudfront_distribution.site.custom_error_response) == 0
    error_message = "CloudFront 全体のカスタムエラー変換を設定しないでください（API の 401/404/500 を保護）。"
  }

  # --- IAM: Lambda 実行ロールはログ出力だけで Secret を読まない --------------
  assert {
    condition = (
      strcontains(aws_iam_role.api.assume_role_policy, "lambda.amazonaws.com") &&
      !strcontains(aws_iam_role.api.assume_role_policy, "secretsmanager") &&
      aws_iam_role_policy_attachment.api_basic_execution.policy_arn == "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    )
    error_message = "Lambda 実行ロールがログ出力用の基本ポリシーだけになっていません。"
  }
}

# prefix（16 文字上限）と長めのリージョン名を組み合わせても、S3 バケット名が
# 63 文字以内の命名規則に収まることを確認する。
run "long_names_stay_within_s3_limits" {
  command = plan

  variables {
    name_prefix                = "abcdefghijklmnop"
    aws_region                 = "ap-southeast-4"
    database_secret_arn        = "arn:aws:secretsmanager:ap-southeast-4:123456789012:secret:kakeibo/database-EXAMPLE"
    cognito_user_pool_id       = "ap-southeast-4_xxxxxxxxx"
    cognito_app_client_id      = "xxxxxxxxxxxxxxxxxxxxxxxxxx"
    api_zip_path               = "tests/fixtures/api.zip.placeholder"
    monthly_batch_zip_path     = "tests/fixtures/monthly-batch.zip.placeholder"
    monthly_notification_email = "monthly@example.com"
  }

  assert {
    condition = (
      length(aws_s3_bucket.site.bucket) <= 63 &&
      length(aws_s3_bucket.artifacts.bucket) <= 63 &&
      can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", aws_s3_bucket.site.bucket)) &&
      can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", aws_s3_bucket.artifacts.bucket))
    )
    error_message = "長い name_prefix / region でも S3 バケット名が 63 文字以内・命名規則内に収まっていません。"
  }
}

# prefix が 17 文字以上なら、バケット名の事前条件に達する前に変数検証で失敗する。
run "reject_too_long_name_prefix" {
  command = plan

  variables {
    name_prefix                = "abcdefghijklmnopq"
    database_secret_arn        = "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:kakeibo/database-EXAMPLE"
    cognito_user_pool_id       = "ap-northeast-1_xxxxxxxxx"
    cognito_app_client_id      = "xxxxxxxxxxxxxxxxxxxxxxxxxx"
    api_zip_path               = "tests/fixtures/api.zip.placeholder"
    monthly_batch_zip_path     = "tests/fixtures/monthly-batch.zip.placeholder"
    monthly_notification_email = "monthly@example.com"
  }

  expect_failures = [var.name_prefix]
}
