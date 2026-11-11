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

  mock_resource "aws_lambda_function" {
    override_during = plan
    defaults = {
      arn = "arn:aws:lambda:ap-northeast-1:123456789012:function:kakeibo-monthly"
    }
  }

  mock_resource "aws_iam_role" {
    override_during = plan
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock-role"
    }
  }

  mock_resource "aws_sns_topic" {
    override_during = plan
    defaults = {
      arn = "arn:aws:sns:ap-northeast-1:123456789012:kakeibo-monthly"
    }
  }

  mock_resource "aws_scheduler_schedule_group" {
    override_during = plan
    defaults = {
      arn = "arn:aws:scheduler:ap-northeast-1:123456789012:schedule-group/kakeibo-monthly"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    override_during = plan
    defaults = {
      arn = "arn:aws:logs:ap-northeast-1:123456789012:log-group:/aws/lambda/kakeibo-monthly"
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

variables {
  database_secret_arn        = "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:example"
  cognito_user_pool_id       = "ap-northeast-1_example"
  cognito_app_client_id      = "example"
  api_zip_path               = "tests/fixtures/api.zip.placeholder"
  monthly_batch_zip_path     = "tests/fixtures/monthly-batch.zip.placeholder"
  monthly_notification_email = "monthly@example.com"
}

override_resource {
  override_during = plan
  target          = aws_lambda_function.receipt_analysis
  values          = { arn = "arn:aws:lambda:ap-northeast-1:123456789012:function:kakeibo-receipt-analysis" }
}

override_resource {
  override_during = plan
  target          = aws_iam_role.receipt_analysis
  values = {
    id  = "receipt-analysis-role"
    arn = "arn:aws:iam::123456789012:role/receipt-analysis-role"
  }
}

override_resource {
  override_during = plan
  target          = aws_cloudwatch_log_group.receipt_analysis
  values          = { arn = "arn:aws:logs:ap-northeast-1:123456789012:log-group:/aws/lambda/kakeibo-receipt-analysis" }
}

run "receipt_analysis_configuration" {
  command = plan
  assert {
    condition = (
      aws_s3_bucket_notification.receipts.bucket == aws_s3_bucket.receipts.id &&
      one(aws_s3_bucket_notification.receipts.lambda_function).lambda_function_arn == aws_lambda_function.receipt_analysis.arn &&
      toset(one(aws_s3_bucket_notification.receipts.lambda_function).events) == toset(["s3:ObjectCreated:*"]) &&
      one(aws_s3_bucket_notification.receipts.lambda_function).filter_prefix == "receipts/" &&
      aws_lambda_permission.receipt_analysis_s3.action == "lambda:InvokeFunction" &&
      aws_lambda_permission.receipt_analysis_s3.function_name == aws_lambda_function.receipt_analysis.function_name &&
      aws_lambda_permission.receipt_analysis_s3.principal == "s3.amazonaws.com" &&
      aws_lambda_permission.receipt_analysis_s3.source_arn == aws_s3_bucket.receipts.arn &&
      aws_lambda_permission.receipt_analysis_s3.source_account == "123456789012"
    )
    error_message = "レシート用バケットから解析Lambdaへの通知と権限を限定してください。"
  }
  assert {
    condition = (
      aws_lambda_function.receipt_analysis.function_name == "${var.name_prefix}-receipt-analysis" &&
      aws_lambda_function.receipt_analysis.runtime == "provided.al2023" &&
      aws_lambda_function.receipt_analysis.handler == "bootstrap" &&
      toset(aws_lambda_function.receipt_analysis.architectures) == toset(["x86_64"]) &&
      aws_lambda_function.receipt_analysis.memory_size == 512 &&
      aws_lambda_function.receipt_analysis.timeout == 60 &&
      aws_lambda_function.receipt_analysis.role == aws_iam_role.receipt_analysis.arn &&
      aws_lambda_function.receipt_analysis.s3_bucket == aws_s3_bucket.artifacts.bucket &&
      aws_lambda_function.receipt_analysis.s3_key == aws_s3_object.monthly_zip.key &&
      aws_lambda_function.receipt_analysis.source_code_hash == aws_s3_object.monthly_zip.source_hash &&
      aws_cloudwatch_log_group.receipt_analysis.name == "/aws/lambda/${var.name_prefix}-receipt-analysis" &&
      aws_cloudwatch_log_group.receipt_analysis.retention_in_days == 30 &&
      aws_lambda_function_event_invoke_config.receipt_analysis.maximum_retry_attempts == 2 &&
      aws_lambda_function_event_invoke_config.receipt_analysis.function_name == aws_lambda_function.receipt_analysis.function_name
    )
    error_message = "解析Lambdaは共有ZIPと専用ロール・ログを使い、再試行は2回にしてください。"
  }
  assert {
    condition = nonsensitive(
      var.receipt_analysis_model_id == "jp.anthropic.claude-haiku-4-5-20251001-v1:0" &&
      one(aws_lambda_function.receipt_analysis.environment).variables["ReceiptAnalysis__ModelId"] == var.receipt_analysis_model_id &&
      one(aws_lambda_function.receipt_analysis.environment).variables["Receipts__BucketName"] == aws_s3_bucket.receipts.bucket &&
      one(aws_lambda_function.receipt_analysis.environment).variables["MonthlyBatch__Job"] == "receipt-analysis" &&
      one(aws_lambda_function.receipt_analysis.environment).variables["ConnectionStrings__DefaultConnection"] == local.database_connection_string &&
      one(aws_lambda_function.receipt_analysis.environment).variables["Database__RunMigrationsOnStartup"] == "false" &&
      one(aws_lambda_function.receipt_analysis.environment).variables["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] == "1"
    )
    error_message = "既定モデルと解析ジョブの環境変数が不正です。"
  }
  assert {
    condition = (
      length(jsondecode(aws_iam_role.receipt_analysis.assume_role_policy).Statement) == 1 &&
      jsondecode(aws_iam_role.receipt_analysis.assume_role_policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role.receipt_analysis.assume_role_policy).Statement[0].Principal.Service == "lambda.amazonaws.com" &&
      jsondecode(aws_iam_role.receipt_analysis.assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      aws_iam_role_policy.receipt_analysis.role == aws_iam_role.receipt_analysis.id &&
      length(jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement) == 4 &&
      alltrue([for statement in jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement : statement.Effect == "Allow"]) &&
      toset(flatten([for statement in jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement : statement.Action])) == toset(["bedrock:InvokeModel", "s3:GetObject", "logs:CreateLogStream", "logs:PutLogEvents"]) &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[0].Action == "bedrock:InvokeModel" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[0].Resource == "arn:aws:bedrock:ap-northeast-1:123456789012:inference-profile/${var.receipt_analysis_model_id}" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[1].Action == "bedrock:InvokeModel" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[1].Resource == "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[1].Condition.StringEquals["bedrock:InferenceProfileArn"] == "arn:aws:bedrock:ap-northeast-1:123456789012:inference-profile/${var.receipt_analysis_model_id}" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[2].Action == "s3:GetObject" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[2].Resource == "${aws_s3_bucket.receipts.arn}/receipts/*" &&
      toset(jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[3].Action) == toset(["logs:CreateLogStream", "logs:PutLogEvents"]) &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[3].Resource == "${aws_cloudwatch_log_group.receipt_analysis.arn}:*" &&
      !strcontains(aws_iam_role_policy.receipt_analysis.policy, "s3:PutObject") &&
      !contains(flatten([for statement in jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement : statement.Action]), "bedrock:*")
    )
    error_message = "解析ロールは条件付きモデル呼び出し・画像読み取り・専用ログだけに限定してください。"
  }
}

run "custom_model" {
  command = plan
  variables { receipt_analysis_model_id = "apac.anthropic.claude-sonnet-4-5-20250929-v1:0" }
  assert {
    condition = (
      one(aws_lambda_function.receipt_analysis.environment).variables["ReceiptAnalysis__ModelId"] == var.receipt_analysis_model_id &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[0].Resource == "arn:aws:bedrock:ap-northeast-1:123456789012:inference-profile/${var.receipt_analysis_model_id}" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[1].Resource == "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0" &&
      jsondecode(aws_iam_role_policy.receipt_analysis.policy).Statement[1].Condition.StringEquals["bedrock:InferenceProfileArn"] == "arn:aws:bedrock:ap-northeast-1:123456789012:inference-profile/${var.receipt_analysis_model_id}"
    )
    error_message = "モデルを差し替えた場合も環境変数とIAMを追従させてください。"
  }
}

run "reject_missing_profile_prefix" {
  command = plan
  variables { receipt_analysis_model_id = "anthropic.claude-haiku-4-5-20251001-v1:0" }
  expect_failures = [var.receipt_analysis_model_id]
}

run "reject_other_model" {
  command = plan
  variables { receipt_analysis_model_id = "gpt-4" }
  expect_failures = [var.receipt_analysis_model_id]
}
