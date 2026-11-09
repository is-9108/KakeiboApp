# 通知とZIP・スケジュールグループを共用し、登録処理の権限と再試行を分離する。
resource "aws_cloudwatch_log_group" "monthly_subscription" {
  name              = "/aws/lambda/${var.name_prefix}-monthly-subscriptions"
  retention_in_days = 30
}

resource "aws_iam_role" "monthly_subscription" {
  name = "${var.name_prefix}-monthly-subscriptions-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "monthly_subscription" {
  role = aws_iam_role.monthly_subscription.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.monthly_subscription.arn}:*"
      }
    ]
  })
}

resource "aws_lambda_function" "monthly_subscription" {
  function_name = "${var.name_prefix}-monthly-subscriptions"
  description   = "月初のサブスク自動登録（.NET 10）"
  role          = aws_iam_role.monthly_subscription.arn
  runtime       = "provided.al2023"
  handler       = "bootstrap"
  architectures = ["x86_64"]
  memory_size   = 512
  timeout       = 60

  s3_bucket        = aws_s3_bucket.artifacts.bucket
  s3_key           = aws_s3_object.monthly_zip.key
  source_code_hash = aws_s3_object.monthly_zip.source_hash

  environment {
    variables = {
      DOTNET_SYSTEM_GLOBALIZATION_INVARIANT = "1"
      Database__RunMigrationsOnStartup      = "false"
      ConnectionStrings__DefaultConnection  = local.database_connection_string
      MonthlyBatch__Job                     = "subscription"
    }
  }

  depends_on = [aws_iam_role_policy.monthly_subscription, aws_cloudwatch_log_group.monthly_subscription]
}

resource "aws_lambda_function_event_invoke_config" "monthly_subscription" {
  function_name          = aws_lambda_function.monthly_subscription.function_name
  maximum_retry_attempts = 2
}

resource "aws_iam_role" "monthly_subscription_scheduler" {
  name = "${var.name_prefix}-monthly-subscriptions-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = local.account_id
          "aws:SourceArn"     = aws_scheduler_schedule_group.monthly.arn
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "monthly_subscription_scheduler" {
  role = aws_iam_role.monthly_subscription_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.monthly_subscription.arn
    }]
  })
}

resource "aws_scheduler_schedule" "monthly_subscription" {
  name                         = "${var.name_prefix}-monthly-subscriptions"
  group_name                   = aws_scheduler_schedule_group.monthly.name
  schedule_expression          = "cron(5 0 1 * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.monthly_subscription.arn
    role_arn = aws_iam_role.monthly_subscription_scheduler.arn
    input    = jsonencode({ scheduledTime = "<aws.scheduler.scheduled-time>" })
    retry_policy {
      maximum_event_age_in_seconds = 86400
      maximum_retry_attempts       = 2
    }
  }

  depends_on = [aws_iam_role_policy.monthly_subscription_scheduler, aws_lambda_function_event_invoke_config.monthly_subscription]
}
