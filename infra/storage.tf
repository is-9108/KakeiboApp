# フロント用バケット。意図しない削除・置換を防ぐため prevent_destroy を付け、
# force_destroy は false のままにする（空でないバケットは destroy できない）。
resource "aws_s3_bucket" "site" {
  bucket        = local.site_bucket_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true

    precondition {
      condition = (
        length(local.site_bucket_name) >= 3 &&
        length(local.site_bucket_name) <= 63 &&
        can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", local.site_bucket_name))
      )
      error_message = "フロント用 S3 バケット名が S3 の命名規則（3〜63 文字・小文字英数字とハイフン・先頭と末尾は英数字）を満たしません。name_prefix や aws_region を短くしてください。"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.bucket

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.bucket

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.bucket

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Lambda ZIP 配布用バケット。フロント用とは分離する。
# 旧 ZIP を復旧用に残せるよう force_destroy は false。削除時は手動で空にする。
resource "aws_s3_bucket" "artifacts" {
  bucket        = local.artifact_bucket_name
  force_destroy = false

  lifecycle {
    precondition {
      condition = (
        length(local.artifact_bucket_name) >= 3 &&
        length(local.artifact_bucket_name) <= 63 &&
        can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", local.artifact_bucket_name))
      )
      error_message = "コード配布用 S3 バケット名が S3 の命名規則（3〜63 文字・小文字英数字とハイフン・先頭と末尾は英数字）を満たしません。name_prefix や aws_region を短くしてください。"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.bucket

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.bucket

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.bucket

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
