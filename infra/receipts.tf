resource "aws_s3_bucket" "receipts" {
  bucket        = local.receipts_bucket_name
  force_destroy = false

  lifecycle {
    precondition {
      condition = (
        length(local.receipts_bucket_name) >= 3 &&
        length(local.receipts_bucket_name) <= 63 &&
        can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", local.receipts_bucket_name))
      )
      error_message = "レシート用 S3 バケット名が S3 の命名規則（3〜63 文字・小文字英数字とハイフン・先頭と末尾は英数字）を満たしません。name_prefix や aws_region を短くしてください。"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "receipts" {
  bucket = aws_s3_bucket.receipts.bucket

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.bucket

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "receipts" {
  bucket = aws_s3_bucket.receipts.bucket

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.bucket

  rule {
    id     = "delete-after-seven-days"
    status = "Enabled"
    filter {
      prefix = ""
    }
    expiration {
      days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.bucket

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = ["https://${aws_cloudfront_distribution.site.domain_name}"]
    allowed_headers = ["Content-Type"]
    max_age_seconds = 300
  }
}

resource "aws_iam_role_policy" "api_receipts" {
  name = "${var.name_prefix}-api-receipts"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = "${aws_s3_bucket.receipts.arn}/receipts/*"
    }]
  })
}
