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
  target          = aws_lambda_function.receipt_stale
  values = {
    arn = "arn:aws:lambda:ap-northeast-1:123456789012:function:kakeibo-receipt-stale"
  }
}

override_resource {
  override_during = plan
  target          = aws_iam_role.receipt_stale
  values = {
    id  = "mock-stale-lambda"
    arn = "arn:aws:iam::123456789012:role/mock-stale-lambda"
  }
}

override_resource {
  override_during = plan
  target          = aws_iam_role.receipt_stale_scheduler
  values = {
    id  = "mock-stale-scheduler"
    arn = "arn:aws:iam::123456789012:role/mock-stale-scheduler"
  }
}

override_resource {
  override_during = plan
  target          = aws_cloudwatch_log_group.receipt_stale
  values = {
    arn = "arn:aws:logs:ap-northeast-1:123456789012:log-group:/aws/lambda/kakeibo-receipt-stale"
  }
}

run "receipt_stale_configuration" {
  command = plan

  assert {
    condition = (
      aws_scheduler_schedule.receipt_stale.schedule_expression == "rate(1 hour)" &&
      aws_scheduler_schedule.receipt_stale.state == "ENABLED" &&
      one(aws_scheduler_schedule.receipt_stale.flexible_time_window).mode == "OFF" &&
      aws_scheduler_schedule.receipt_stale.group_name == aws_scheduler_schedule_group.monthly.name &&
      one(aws_scheduler_schedule.receipt_stale.target).arn == aws_lambda_function.receipt_stale.arn &&
      one(aws_scheduler_schedule.receipt_stale.target).role_arn == aws_iam_role.receipt_stale_scheduler.arn &&
      jsondecode(one(aws_scheduler_schedule.receipt_stale.target).input).scheduledTime == "<aws.scheduler.scheduled-time>" &&
      one(one(aws_scheduler_schedule.receipt_stale.target).retry_policy).maximum_retry_attempts == 2 &&
      one(one(aws_scheduler_schedule.receipt_stale.target).retry_policy).maximum_event_age_in_seconds == 3600
    )
    error_message = "棚卸しは1時間ごとに専用Lambdaを予定日時付きで起動してください。"
  }

  assert {
    condition = (
      aws_lambda_function.receipt_stale.function_name == "${var.name_prefix}-receipt-stale" &&
      aws_lambda_function.receipt_stale.runtime == "provided.al2023" &&
      aws_lambda_function.receipt_stale.handler == "bootstrap" &&
      toset(aws_lambda_function.receipt_stale.architectures) == toset(["x86_64"]) &&
      aws_lambda_function.receipt_stale.memory_size == 512 &&
      aws_lambda_function.receipt_stale.timeout == 60 &&
      aws_lambda_function.receipt_stale.role == aws_iam_role.receipt_stale.arn &&
      aws_cloudwatch_log_group.receipt_stale.name == "/aws/lambda/${var.name_prefix}-receipt-stale" &&
      aws_cloudwatch_log_group.receipt_stale.retention_in_days == 30 &&
      aws_lambda_function_event_invoke_config.receipt_stale.function_name == aws_lambda_function.receipt_stale.function_name &&
      aws_lambda_function_event_invoke_config.receipt_stale.maximum_retry_attempts == 2 &&
      aws_lambda_function.receipt_stale.s3_bucket == aws_lambda_function.monthly.s3_bucket &&
      aws_lambda_function.receipt_stale.s3_key == aws_s3_object.monthly_zip.key &&
      aws_lambda_function.receipt_stale.source_code_hash == aws_s3_object.monthly_zip.source_hash
    )
    error_message = "棚卸し専用Lambdaの実行形式・共用ZIP・ログ保持・非同期再試行が不正です。"
  }

  assert {
    condition = nonsensitive(
      one(aws_lambda_function.receipt_stale.environment).variables["Database__RunMigrationsOnStartup"] == "false" &&
      one(aws_lambda_function.receipt_stale.environment).variables["MonthlyBatch__Job"] == "receipt-stale" &&
      one(aws_lambda_function.receipt_stale.environment).variables["ConnectionStrings__DefaultConnection"] == local.database_connection_string &&
      one(aws_lambda_function.receipt_stale.environment).variables["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] == "1"
    )
    error_message = "棚卸しジョブの選択とDB環境変数が不正です。"
  }

  assert {
    condition = (
      length(jsondecode(aws_iam_role.receipt_stale.assume_role_policy).Statement) == 1 &&
      jsondecode(aws_iam_role.receipt_stale.assume_role_policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role.receipt_stale.assume_role_policy).Statement[0].Principal.Service == "lambda.amazonaws.com" &&
      jsondecode(aws_iam_role.receipt_stale.assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      aws_iam_role_policy.receipt_stale.role == aws_iam_role.receipt_stale.id &&
      length(jsondecode(aws_iam_role_policy.receipt_stale.policy).Statement) == 1 &&
      jsondecode(aws_iam_role_policy.receipt_stale.policy).Statement[0].Effect == "Allow" &&
      toset(jsondecode(aws_iam_role_policy.receipt_stale.policy).Statement[0].Action) == toset(["logs:CreateLogStream", "logs:PutLogEvents"]) &&
      jsondecode(aws_iam_role_policy.receipt_stale.policy).Statement[0].Resource == "${aws_cloudwatch_log_group.receipt_stale.arn}:*" &&
      !strcontains(aws_iam_role_policy.receipt_stale.policy, "s3:") &&
      !strcontains(aws_iam_role_policy.receipt_stale.policy, "bedrock:")
    )
    error_message = "棚卸しLambdaの権限は対象ロググループ内のログ書込みだけに限定してください。"
  }

  assert {
    condition = (
      length(jsondecode(aws_iam_role.receipt_stale_scheduler.assume_role_policy).Statement) == 1 &&
      jsondecode(aws_iam_role.receipt_stale_scheduler.assume_role_policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role.receipt_stale_scheduler.assume_role_policy).Statement[0].Principal.Service == "scheduler.amazonaws.com" &&
      jsondecode(aws_iam_role.receipt_stale_scheduler.assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      jsondecode(aws_iam_role.receipt_stale_scheduler.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == local.account_id &&
      jsondecode(aws_iam_role.receipt_stale_scheduler.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceArn"] == aws_scheduler_schedule_group.monthly.arn &&
      aws_iam_role_policy.receipt_stale_scheduler.role == aws_iam_role.receipt_stale_scheduler.id &&
      length(jsondecode(aws_iam_role_policy.receipt_stale_scheduler.policy).Statement) == 1 &&
      jsondecode(aws_iam_role_policy.receipt_stale_scheduler.policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role_policy.receipt_stale_scheduler.policy).Statement[0].Action == "lambda:InvokeFunction" &&
      jsondecode(aws_iam_role_policy.receipt_stale_scheduler.policy).Statement[0].Resource == aws_lambda_function.receipt_stale.arn
    )
    error_message = "棚卸しSchedulerは信頼元を限定し棚卸し専用Lambdaだけを起動してください。"
  }
}
