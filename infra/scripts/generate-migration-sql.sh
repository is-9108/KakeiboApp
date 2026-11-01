#!/usr/bin/env bash
# EF Core のマイグレーションから冪等（idempotent）な SQL を生成する。
# 生成した SQL は内容を確認したうえで、Neon の direct endpoint へ psql で明示適用する。
# Lambda の起動時にはマイグレーションを実行しない。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$ROOT_DIR/api"
OUT_DIR="$ROOT_DIR/.artifacts/migrations"
OUT_FILE="$OUT_DIR/migrate.sql"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "エラー: dotnet が見つかりません。" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

cd "$API_DIR"

# api/.config/dotnet-tools.json で固定した dotnet-ef を使う。
dotnet tool restore

dotnet ef migrations script \
  --idempotent \
  --project Kakeibo.Api.csproj \
  --startup-project Kakeibo.Api.csproj \
  --output "$OUT_FILE"

echo "マイグレーション SQL を生成しました: $OUT_FILE"
