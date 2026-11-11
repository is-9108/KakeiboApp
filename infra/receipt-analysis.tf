# 通知・月初登録とZIPを共用し、解析のIAMとログを分離する。
locals {
  receipt_analysis_foundation_model_id = replace(var.receipt_analysis_model_id, "/^(jp|apac)\\./", "")
  receipt_analysis_profile_arn         = "arn:aws:bedrock:${var.aws_region}:${local.account_id}:inference-profile/${var.receipt_analysis_model_id}"
}

resource "aws_cloudwatch_log_group" "receipt_analysis" {
  name              = "/aws/lambda/${var.name_prefix}-receipt-analysis"
  retention_in_days = 30
}

resource "aws_iam_role" "receipt_analysis" {
  name = "${var.name_prefix}-receipt-analysis-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "receipt_analysis" {
  role = aws_iam_role.receipt_analysis.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "bedrock:InvokeModel"
        Resource = local.receipt_analysis_profile_arn
      },
      {
        Effect   = "Allow"
        Action   = "bedrock:InvokeModel"
        Resource = "arn:aws:bedrock:*::foundation-model/${local.receipt_analysis_foundation_model_id}"
        Condition = {
          StringEquals = { "bedrock:InferenceProfileArn" = local.receipt_analysis_profile_arn }
        }
      },
      {
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.receipts.arn}/receipts/*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.receipt_analysis.arn}:*"
      }
    ]
  })
}

resource "aws_lambda_function" "receipt_analysis" {
  function_name = "${var.name_prefix}-receipt-analysis"
  description   = "レシート画像のBedrock解析（.NET 10）"
  role          = aws_iam_role.receipt_analysis.arn
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
      MonthlyBatch__Job                     = "receipt-analysis"
      ReceiptAnalysis__ModelId              = var.receipt_analysis_model_id
      Receipts__BucketName                  = aws_s3_bucket.receipts.bucket
    }
  }
  depends_on = [aws_iam_role_policy.receipt_analysis, aws_cloudwatch_log_group.receipt_analysis]
}

resource "aws_lambda_function_event_invoke_config" "receipt_analysis" {
  function_name          = aws_lambda_function.receipt_analysis.function_name
  maximum_retry_attempts = 2
}

resource "aws_lambda_permission" "receipt_analysis_s3" {
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.receipt_analysis.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.receipts.arn
  source_account = local.account_id
}

resource "aws_s3_bucket_notification" "receipts" {
  bucket = aws_s3_bucket.receipts.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.receipt_analysis.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "receipts/"
  }
  depends_on = [aws_lambda_permission.receipt_analysis_s3]
}
