variable "aws_region" {
  description = "Lambda・API Gateway・S3・Secrets Manager を配置する AWS リージョン。"
  type        = string
  default     = "ap-northeast-1"
}

variable "name_prefix" {
  description = "リソース名の接頭辞。アカウント内で一意になるようにする。"
  type        = string
  default     = "kakeibo"

  # バケット名は prefix + アカウント ID + リージョンを連結するため、
  # 63 文字上限に収まるよう prefix は 16 文字までに制限する。
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,14}[a-z0-9]$", var.name_prefix))
    error_message = "name_prefix は 3〜16 文字の小文字英数字とハイフンで指定し、先頭と末尾は英数字にしてください。"
  }
}

variable "database_secret_arn" {
  description = "Neon の API 用接続文字列を JSON {\"connectionString\":\"...\"} で格納した Secrets Manager シークレットの ARN。"
  type        = string
}

variable "cognito_region" {
  description = "Cognito User Pool のリージョン。"
  type        = string
  default     = "ap-northeast-1"
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID（例 ap-northeast-1_xxxxxxxxx）。"
  type        = string
}

variable "cognito_app_client_id" {
  description = "SPA 用（シークレットなし）Cognito App Client ID。"
  type        = string
}

variable "api_zip_path" {
  description = "package-api.sh が作成する Lambda ZIP のパス（infra/ からの相対）。"
  type        = string
  default     = "../.artifacts/api.zip"
}
