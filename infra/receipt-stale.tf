# 既存バッチとZIP・スケジュールグループを共用する。
resource "aws_cloudwatch_log_group" "receipt_stale" {
  name              = "/aws/lambda/${var.name_prefix}-receipt-stale"
  retention_in_days = 30
}

resource "aws_iam_role" "receipt_stale" {
  name = "${var.name_prefix}-receipt-stale-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "receipt_stale" {
  role = aws_iam_role.receipt_stale.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.receipt_stale.arn}:*"
      }
    ]
  })
}

resource "aws_lambda_function" "receipt_stale" {
  function_name = "${var.name_prefix}-receipt-stale"
  description   = "滞留したレシート解析ジョブの棚卸し（.NET 10）"
  role          = aws_iam_role.receipt_stale.arn
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
      MonthlyBatch__Job                     = "receipt-stale"
    }
  }

  depends_on = [aws_iam_role_policy.receipt_stale, aws_cloudwatch_log_group.receipt_stale]
}

resource "aws_lambda_function_event_invoke_config" "receipt_stale" {
  function_name          = aws_lambda_function.receipt_stale.function_name
  maximum_retry_attempts = 2
}

resource "aws_iam_role" "receipt_stale_scheduler" {
  name = "${var.name_prefix}-receipt-stale-scheduler"

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

resource "aws_iam_role_policy" "receipt_stale_scheduler" {
  role = aws_iam_role.receipt_stale_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.receipt_stale.arn
    }]
  })
}

resource "aws_scheduler_schedule" "receipt_stale" {
  name                = "${var.name_prefix}-receipt-stale"
  group_name          = aws_scheduler_schedule_group.monthly.name
  schedule_expression = "rate(1 hour)"
  state               = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.receipt_stale.arn
    role_arn = aws_iam_role.receipt_stale_scheduler.arn
    input    = jsonencode({ scheduledTime = "<aws.scheduler.scheduled-time>" })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 2
    }
  }

  depends_on = [aws_iam_role_policy.receipt_stale_scheduler, aws_lambda_function_event_invoke_config.receipt_stale]
}
