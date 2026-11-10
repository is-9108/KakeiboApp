data "aws_caller_identity" "current" {}

# Secret はユーザー管理。Terraform は AWSCURRENT を参照するだけで作成・更新しない。
# secret_string は sensitive のため、jsondecode の結果も sensitive として扱われる。
data "aws_secretsmanager_secret_version" "database" {
  secret_id = var.database_secret_arn
}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # バケット名はグローバルに一意にする必要があるため、アカウント ID とリージョンを含める。
  receipts_bucket_name = "${var.name_prefix}-receipts-${local.account_id}-${var.aws_region}"
  site_bucket_name     = "${var.name_prefix}-site-${local.account_id}-${var.aws_region}"
  artifact_bucket_name = "${var.name_prefix}-artifacts-${local.account_id}-${var.aws_region}"

  # ZIP の内容ハッシュを key と Lambda の source_code_hash に使い、内容が変わったときだけ更新する。
  api_zip_hash = filebase64sha256(var.api_zip_path)
  api_zip_key  = "api/${local.api_zip_hash}.zip"

  database_connection_string = jsondecode(data.aws_secretsmanager_secret_version.database.secret_string)["connectionString"]

  tags = {
    Project   = var.name_prefix
    ManagedBy = "terraform"
  }
}
