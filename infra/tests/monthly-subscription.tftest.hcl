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
  target          = aws_lambda_function.monthly_subscription
  values = {
    arn = "arn:aws:lambda:ap-northeast-1:123456789012:function:kakeibo-monthly-subscriptions"
  }
}

override_resource {
  override_during = plan
  target          = aws_iam_role.monthly_subscription
  values = {
    id  = "mock-subscription-lambda"
    arn = "arn:aws:iam::123456789012:role/mock-subscription-lambda"
  }
}

override_resource {
  override_during = plan
  target          = aws_iam_role.monthly_subscription_scheduler
  values = {
    id  = "mock-subscription-scheduler"
    arn = "arn:aws:iam::123456789012:role/mock-subscription-scheduler"
  }
}

override_resource {
  override_during = plan
  target          = aws_cloudwatch_log_group.monthly_subscription
  values = {
    arn = "arn:aws:logs:ap-northeast-1:123456789012:log-group:/aws/lambda/kakeibo-monthly-subscriptions"
  }
}

run "monthly_subscription_configuration" {
  command = plan

  assert {
    condition = (
      aws_scheduler_schedule.monthly_subscription.schedule_expression == "cron(5 0 1 * ? *)" &&
      aws_scheduler_schedule.monthly_subscription.schedule_expression_timezone == "Asia/Tokyo" &&
      aws_scheduler_schedule.monthly_subscription.state == "ENABLED" &&
      one(aws_scheduler_schedule.monthly_subscription.flexible_time_window).mode == "OFF" &&
      aws_scheduler_schedule.monthly_subscription.group_name == aws_scheduler_schedule_group.monthly.name &&
      one(aws_scheduler_schedule.monthly_subscription.target).arn == aws_lambda_function.monthly_subscription.arn &&
      one(aws_scheduler_schedule.monthly_subscription.target).role_arn == aws_iam_role.monthly_subscription_scheduler.arn &&
      jsondecode(one(aws_scheduler_schedule.monthly_subscription.target).input).scheduledTime == "<aws.scheduler.scheduled-time>" &&
      one(one(aws_scheduler_schedule.monthly_subscription.target).retry_policy).maximum_retry_attempts == 2 &&
      one(one(aws_scheduler_schedule.monthly_subscription.target).retry_policy).maximum_event_age_in_seconds == 86400
    )
    error_message = "登録処理は毎月1日0:05 JSTに登録専用Lambdaを予定日時付きで起動してください。"
  }

  assert {
    condition = (
      aws_lambda_function.monthly_subscription.function_name == "${var.name_prefix}-monthly-subscriptions" &&
      aws_lambda_function.monthly_subscription.runtime == "provided.al2023" &&
      aws_lambda_function.monthly_subscription.handler == "bootstrap" &&
      toset(aws_lambda_function.monthly_subscription.architectures) == toset(["x86_64"]) &&
      aws_lambda_function.monthly_subscription.memory_size == 512 &&
      aws_lambda_function.monthly_subscription.timeout == 60 &&
      aws_lambda_function.monthly_subscription.role == aws_iam_role.monthly_subscription.arn &&
      aws_cloudwatch_log_group.monthly_subscription.name == "/aws/lambda/${var.name_prefix}-monthly-subscriptions" &&
      aws_cloudwatch_log_group.monthly_subscription.retention_in_days == 30 &&
      aws_lambda_function_event_invoke_config.monthly_subscription.function_name == aws_lambda_function.monthly_subscription.function_name &&
      aws_lambda_function_event_invoke_config.monthly_subscription.maximum_retry_attempts == 2 &&
      aws_lambda_function.monthly_subscription.s3_bucket == aws_lambda_function.monthly.s3_bucket &&
      aws_lambda_function.monthly_subscription.s3_key == aws_s3_object.monthly_zip.key &&
      aws_lambda_function.monthly_subscription.source_code_hash == aws_s3_object.monthly_zip.source_hash
    )
    error_message = "登録専用Lambdaの実行形式・共用ZIP・ログ保持・非同期再試行が不正です。"
  }

  assert {
    condition = nonsensitive(
      one(aws_lambda_function.monthly_subscription.environment).variables["Database__RunMigrationsOnStartup"] == "false" &&
      one(aws_lambda_function.monthly_subscription.environment).variables["MonthlyBatch__Job"] == "subscription" &&
      one(aws_lambda_function.monthly_subscription.environment).variables["ConnectionStrings__DefaultConnection"] == local.database_connection_string &&
      one(aws_lambda_function.monthly_subscription.environment).variables["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] == "1"
    )
    error_message = "登録ジョブの選択とDB環境変数が不正です。"
  }

  assert {
    condition = (
      length(jsondecode(aws_iam_role.monthly_subscription.assume_role_policy).Statement) == 1 &&
      jsondecode(aws_iam_role.monthly_subscription.assume_role_policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role.monthly_subscription.assume_role_policy).Statement[0].Principal.Service == "lambda.amazonaws.com" &&
      jsondecode(aws_iam_role.monthly_subscription.assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      aws_iam_role_policy.monthly_subscription.role == aws_iam_role.monthly_subscription.id &&
      length(jsondecode(aws_iam_role_policy.monthly_subscription.policy).Statement) == 1 &&
      jsondecode(aws_iam_role_policy.monthly_subscription.policy).Statement[0].Effect == "Allow" &&
      toset(jsondecode(aws_iam_role_policy.monthly_subscription.policy).Statement[0].Action) == toset(["logs:CreateLogStream", "logs:PutLogEvents"]) &&
      jsondecode(aws_iam_role_policy.monthly_subscription.policy).Statement[0].Resource == "${aws_cloudwatch_log_group.monthly_subscription.arn}:*" &&
      !strcontains(aws_iam_role_policy.monthly_subscription.policy, "sns:Publish")
    )
    error_message = "登録Lambdaの権限は対象ロググループ内のログ書込みだけに限定してください。"
  }

  assert {
    condition = (
      length(jsondecode(aws_iam_role.monthly_subscription_scheduler.assume_role_policy).Statement) == 1 &&
      jsondecode(aws_iam_role.monthly_subscription_scheduler.assume_role_policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role.monthly_subscription_scheduler.assume_role_policy).Statement[0].Principal.Service == "scheduler.amazonaws.com" &&
      jsondecode(aws_iam_role.monthly_subscription_scheduler.assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      jsondecode(aws_iam_role.monthly_subscription_scheduler.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == local.account_id &&
      jsondecode(aws_iam_role.monthly_subscription_scheduler.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceArn"] == aws_scheduler_schedule_group.monthly.arn &&
      aws_iam_role_policy.monthly_subscription_scheduler.role == aws_iam_role.monthly_subscription_scheduler.id &&
      length(jsondecode(aws_iam_role_policy.monthly_subscription_scheduler.policy).Statement) == 1 &&
      jsondecode(aws_iam_role_policy.monthly_subscription_scheduler.policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role_policy.monthly_subscription_scheduler.policy).Statement[0].Action == "lambda:InvokeFunction" &&
      jsondecode(aws_iam_role_policy.monthly_subscription_scheduler.policy).Statement[0].Resource == aws_lambda_function.monthly_subscription.arn
    )
    error_message = "登録Schedulerは信頼元を限定し登録専用Lambdaだけを起動してください。"
  }
}

run "monthly_configuration" {
  command = plan

  assert {
    condition = (
      aws_scheduler_schedule.monthly.schedule_expression == "cron(10 0 1 * ? *)" &&
      aws_scheduler_schedule.monthly.schedule_expression_timezone == "Asia/Tokyo" &&
      aws_scheduler_schedule.monthly.state == "ENABLED" &&
      one(aws_scheduler_schedule.monthly.flexible_time_window).mode == "OFF" &&
      aws_scheduler_schedule.monthly.group_name == aws_scheduler_schedule_group.monthly.name &&
      one(aws_scheduler_schedule.monthly.target).arn == aws_lambda_function.monthly.arn &&
      one(aws_scheduler_schedule.monthly.target).role_arn == aws_iam_role.monthly_scheduler.arn &&
      jsondecode(one(aws_scheduler_schedule.monthly.target).input).scheduledTime == "<aws.scheduler.scheduled-time>"
    )
    error_message = "毎月1日0:10 JSTの非同期起動設定が不正です。"
  }

  assert {
    condition = (
      aws_lambda_function.monthly.runtime == "provided.al2023" &&
      aws_lambda_function.monthly.handler == "bootstrap" &&
      toset(aws_lambda_function.monthly.architectures) == toset(["x86_64"]) &&
      aws_lambda_function.monthly.memory_size == 512 &&
      aws_lambda_function.monthly.timeout == 60 &&
      aws_lambda_function.monthly.role == aws_iam_role.monthly.arn &&
      aws_cloudwatch_log_group.monthly.retention_in_days == 30 &&
      aws_lambda_function_event_invoke_config.monthly.function_name == aws_lambda_function.monthly.function_name &&
      aws_lambda_function_event_invoke_config.monthly.maximum_retry_attempts == 2
    )
    error_message = "バッチの実行形式・ログ・非同期再試行が不正です。"
  }

  assert {
    condition = nonsensitive(
      one(aws_lambda_function.monthly.environment).variables["ConnectionStrings__DefaultConnection"] == local.database_connection_string &&
      one(aws_lambda_function.monthly.environment).variables["MonthlyNotification__TopicArn"] == aws_sns_topic.monthly.arn &&
      one(aws_lambda_function.monthly.environment).variables["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] == "1" &&
      one(aws_lambda_function.monthly.environment).variables["Database__RunMigrationsOnStartup"] == "false"
    )
    error_message = "DB・SNS環境変数が配線されていません。"
  }

  assert {
    condition = (
      aws_s3_object.monthly_zip.source_hash == filebase64sha256(var.monthly_batch_zip_path) &&
      aws_s3_object.monthly_zip.key == "monthly/${filebase64sha256(var.monthly_batch_zip_path)}.zip" &&
      aws_s3_object.monthly_zip.bucket == aws_s3_bucket.artifacts.bucket &&
      aws_lambda_function.monthly.s3_bucket == aws_s3_bucket.artifacts.bucket &&
      aws_lambda_function.monthly.s3_key == aws_s3_object.monthly_zip.key &&
      aws_lambda_function.monthly.source_code_hash == aws_s3_object.monthly_zip.source_hash &&
      aws_sns_topic_subscription.monthly.protocol == "email" &&
      aws_sns_topic_subscription.monthly.endpoint == var.monthly_notification_email &&
      aws_sns_topic_subscription.monthly.topic_arn == aws_sns_topic.monthly.arn
    )
    error_message = "ZIP更新とemail購読の配線が不正です。"
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.monthly.assume_role_policy).Statement[0].Principal.Service == "lambda.amazonaws.com" &&
      jsondecode(aws_iam_role.monthly.assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      length(jsondecode(aws_iam_role_policy.monthly.policy).Statement) == 2 &&
      jsondecode(aws_iam_role_policy.monthly.policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role_policy.monthly.policy).Statement[0].Action == "sns:Publish" &&
      jsondecode(aws_iam_role_policy.monthly.policy).Statement[0].Resource == aws_sns_topic.monthly.arn &&
      jsondecode(aws_iam_role_policy.monthly.policy).Statement[1].Effect == "Allow" &&
      toset(jsondecode(aws_iam_role_policy.monthly.policy).Statement[1].Action) == toset(["logs:CreateLogStream", "logs:PutLogEvents"]) &&
      jsondecode(aws_iam_role_policy.monthly.policy).Statement[1].Resource == "${aws_cloudwatch_log_group.monthly.arn}:*"
    )
    error_message = "Lambdaの権限は対象SNS Publishと指定ログのみとしてください。"
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.monthly_scheduler.assume_role_policy).Statement[0].Principal.Service == "scheduler.amazonaws.com" &&
      jsondecode(aws_iam_role.monthly_scheduler.assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      jsondecode(aws_iam_role.monthly_scheduler.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == local.account_id &&
      jsondecode(aws_iam_role.monthly_scheduler.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceArn"] == aws_scheduler_schedule_group.monthly.arn &&
      length(jsondecode(aws_iam_role_policy.monthly_scheduler.policy).Statement) == 1 &&
      jsondecode(aws_iam_role_policy.monthly_scheduler.policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role_policy.monthly_scheduler.policy).Statement[0].Action == "lambda:InvokeFunction" &&
      jsondecode(aws_iam_role_policy.monthly_scheduler.policy).Statement[0].Resource == aws_lambda_function.monthly.arn
    )
    error_message = "Schedulerの信頼条件・対象関数の限定が不正です。"
  }
}

