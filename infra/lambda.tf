# Lambda 実行ロール。ログ書き込みだけを許可し、Secrets Manager の読み取り権限は付けない。
# 接続文字列は apply 時に環境変数へ解決される。
resource "aws_iam_role" "api" {
  name = "${var.name_prefix}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_basic_execution" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ZIP は package-api.sh が事前に作成する。Terraform ではビルドしない。
# key に内容ハッシュを含むため、更新時は新しいオブジェクトへ切り替わり、
# Terraform が管理する旧 key のオブジェクトは削除される。旧 ZIP の保持は
# docs/deployment.md の .artifacts/releases/ への退避で行う。
resource "aws_s3_object" "api_zip" {
  bucket       = aws_s3_bucket.artifacts.bucket
  key          = local.api_zip_key
  source       = var.api_zip_path
  source_hash  = local.api_zip_hash
  content_type = "application/zip"
}

resource "aws_lambda_function" "api" {
  function_name = "${var.name_prefix}-api"
  description   = "Kakeibo API on .NET 10 (provided.al2023)"
  role          = aws_iam_role.api.arn

  runtime       = "provided.al2023"
  handler       = "bootstrap"
  architectures = ["x86_64"]

  memory_size = 512
  timeout     = 25
  # アカウントの Lambda 同時実行上限が 10 のため、予約同時実行は設定しない。

  ephemeral_storage {
    size = 512
  }

  s3_bucket        = aws_s3_bucket.artifacts.bucket
  s3_key           = aws_s3_object.api_zip.key
  source_code_hash = aws_s3_object.api_zip.source_hash

  # provided.al2023 には libicu が無いため、.NET を invariant モードで起動させる。
  environment {
    variables = {
      ASPNETCORE_ENVIRONMENT                = "Production"
      Database__RunMigrationsOnStartup      = "false"
      DOTNET_SYSTEM_GLOBALIZATION_INVARIANT = "1"
      Cognito__Region                       = var.cognito_region
      Cognito__UserPoolId                   = var.cognito_user_pool_id
      Cognito__AppClientId                  = var.cognito_app_client_id
      ConnectionStrings__DefaultConnection  = local.database_connection_string
    }
  }

  depends_on = [aws_iam_role_policy_attachment.api_basic_execution]
}
