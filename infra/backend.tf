terraform {
  backend "s3" {
    # 実環境の bucket / key / region は infra/backend.s3.hcl（.gitignore 済み）で渡す。
    # DynamoDB は使わず、S3 native lockfile で state をロックする。
    use_lockfile = true
    encrypt      = true
  }
}
