# SchedulerのテンプレートターゲットはLambdaを非同期起動する。
# 配信受理までの再試行と、Lambda処理失敗後の再試行は別の設定。
resource "aws_sns_topic" "monthly" {
  name = "${var.name_prefix}-monthly"
}

resource "aws_sns_topic_subscription" "monthly" {
  topic_arn = aws_sns_topic.monthly.arn
  protocol  = "email"
  endpoint  = var.monthly_notification_email
}

resource "aws_cloudwatch_log_group" "monthly" {
  name              = "/aws/lambda/${var.name_prefix}-monthly"
  retention_in_days = 30
}

resource "aws_iam_role" "monthly" {
  name = "${var.name_prefix}-monthly-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "monthly" {
  role = aws_iam_role.monthly.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "sns:Publish"
        Resource = aws_sns_topic.monthly.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.monthly.arn}:*"
      }
    ]
  })
}

resource "aws_s3_object" "monthly_zip" {
  bucket       = aws_s3_bucket.artifacts.bucket
  key          = "monthly/${filebase64sha256(var.monthly_batch_zip_path)}.zip"
  source       = var.monthly_batch_zip_path
  source_hash  = filebase64sha256(var.monthly_batch_zip_path)
  content_type = "application/zip"
}

resource "aws_lambda_function" "monthly" {
  function_name = "${var.name_prefix}-monthly"
  description   = "Kakeibo monthly notification on .NET 10"
  role          = aws_iam_role.monthly.arn
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
      MonthlyNotification__TopicArn         = aws_sns_topic.monthly.arn
    }
  }

  depends_on = [aws_iam_role_policy.monthly, aws_cloudwatch_log_group.monthly]
}

resource "aws_lambda_function_event_invoke_config" "monthly" {
  function_name          = aws_lambda_function.monthly.function_name
  maximum_retry_attempts = 2
}

resource "aws_scheduler_schedule_group" "monthly" {
  name = "${var.name_prefix}-monthly"
}

resource "aws_iam_role" "monthly_scheduler" {
  name = "${var.name_prefix}-monthly-scheduler"

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

resource "aws_iam_role_policy" "monthly_scheduler" {
  role = aws_iam_role.monthly_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.monthly.arn
    }]
  })
}

resource "aws_scheduler_schedule" "monthly" {
  name                         = "${var.name_prefix}-monthly"
  group_name                   = aws_scheduler_schedule_group.monthly.name
  schedule_expression          = "cron(10 0 1 * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.monthly.arn
    role_arn = aws_iam_role.monthly_scheduler.arn
    input    = jsonencode({ scheduledTime = "<aws.scheduler.scheduled-time>" })
    retry_policy {
      maximum_event_age_in_seconds = 86400
      maximum_retry_attempts       = 2
    }
  }

  depends_on = [aws_iam_role_policy.monthly_scheduler, aws_lambda_function_event_invoke_config.monthly]
}
