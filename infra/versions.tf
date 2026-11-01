terraform {
  # CI・docs/deployment.md・検証で使う CLI は 1.17.1 に固定している。
  # この制約は S3 native lockfile / mock tests / removed block を満たす下限。
  required_version = ">= 1.11.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }
}
