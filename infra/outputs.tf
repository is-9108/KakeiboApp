# 秘密情報（接続文字列など）は output に出さない。

output "site_url" {
  description = "公開 URL（CloudFront のデフォルトドメイン）"
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "distribution_id" {
  description = "キャッシュ更新に使う CloudFront Distribution ID"
  value       = aws_cloudfront_distribution.site.id
}

output "site_bucket_name" {
  description = "フロント成果物の配置先 S3 バケット"
  value       = aws_s3_bucket.site.bucket
}

output "artifact_bucket_name" {
  description = "Lambda ZIP の配布用 S3 バケット"
  value       = aws_s3_bucket.artifacts.bucket
}

output "api_endpoint" {
  description = "API Gateway の直接エンドポイント（curl 検証用）"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "api_function_name" {
  description = "Lambda 関数名"
  value       = aws_lambda_function.api.function_name
}

output "spa_rewrite_function_name" {
  description = "SPA フォールバック用 CloudFront Function 名"
  value       = aws_cloudfront_function.spa_rewrite.name
}
