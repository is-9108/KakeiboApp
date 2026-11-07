#!/usr/bin/env bash
# AWS Lambda（provided.al2023 / linux-x64）用の .NET 自己完結パッケージを作成する。
# Docker は使わない。成果物は .artifacts/monthly-batch.zip（ZIP 直下に実行可能な bootstrap）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="$ROOT_DIR/api/batch/Kakeibo.MonthlyBatch.csproj"
ARTIFACTS_DIR="$ROOT_DIR/.artifacts"
PUBLISH_DIR="$ARTIFACTS_DIR/monthly-batch-package"
ZIP_PATH="$ARTIFACTS_DIR/monthly-batch.zip"
RID="${RID:-linux-x64}"

for command in dotnet zip unzip; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "エラー: $command が見つかりません。" >&2
    exit 1
  fi
done

if [[ ! -f "$PROJECT" ]]; then
  echo "エラー: バッチプロジェクトが見つかりません: $PROJECT" >&2
  exit 1
fi

rm -rf "$PUBLISH_DIR" "$ZIP_PATH"
mkdir -p "$PUBLISH_DIR"

# バッチ専用プロパティでAssemblyNameを変更し、参照先APIの名前は維持する。
# 実行ファイルと対応する DLL の名前が揃い、
# ZIP 直下の bootstrap がそのまま起動できる（apphost は bootstrap.dll を探す）。
dotnet publish "$PROJECT" \
  --configuration Release \
  --runtime "$RID" \
  --self-contained true \
  --output "$PUBLISH_DIR" \
  -p:MonthlyBatchAssemblyName=bootstrap \
  -p:PublishSingleFile=false \
  -p:DebugType=None \
  -p:DebugSymbols=false \
  -p:SatelliteResourceLanguages=en

if [[ ! -f "$PUBLISH_DIR/bootstrap" ]]; then
  echo "エラー: publish 成果物に bootstrap がありません: $PUBLISH_DIR" >&2
  exit 1
fi
chmod 0755 "$PUBLISH_DIR/bootstrap"

# ディレクトリ内容をそのまま固め、ZIP 直下に bootstrap が来るようにする。
# 本番 Lambda では Development 用設定を読み込ませない。
# デバッガー用の libmscordaccore.so / libmscordbi.so と createdump は通常実行に不要なため除外し、
# 50 MB 前後の ZIP サイズを抑える（アプリのトリミングは行わない）。
(cd "$PUBLISH_DIR" && zip -q -9 -r -X "$ZIP_PATH" . \
  -x '*.pdb' \
  -x 'appsettings.Development.json' \
  -x 'libmscordaccore.so' \
  -x 'libmscordbi.so' \
  -x 'createdump' \
  -x 'appsettings*.json' \
  -x '.env*' \
  -x '*.tfvars' \
  -x '*.hcl' \
  -x 'tests/*' \
  -x 'batch/*')

# pipefail 下で grep -q の早期終了が unzip の SIGPIPE と混ざらないよう、一覧を先に取得する。
ZIP_ENTRIES="$(unzip -Z1 "$ZIP_PATH")"
if ! grep -Fxq 'bootstrap' <<< "$ZIP_ENTRIES"; then
  echo "エラー: ZIP 直下に bootstrap がありません: $ZIP_PATH" >&2
  exit 1
fi

if grep -Eiq '(^|/)(appsettings[^/]*\.json|\.env[^/]*|[^/]*\.tfvars|[^/]*\.hcl|tests/|batch/)' <<< "$ZIP_ENTRIES"; then
  echo "エラー: ZIP に不要な設定・秘密ファイル候補があります。" >&2
  exit 1
fi

VERIFY_DIR="$(mktemp -d)"
trap 'rm -rf "$VERIFY_DIR"' EXIT
unzip -q "$ZIP_PATH" bootstrap -d "$VERIFY_DIR"
if [[ ! -x "$VERIFY_DIR/bootstrap" ]]; then
  echo "エラー: ZIP 内の bootstrap に実行権限がありません: $ZIP_PATH" >&2
  exit 1
fi

echo "Lambda パッケージを作成しました: $ZIP_PATH"
ls -lh "$ZIP_PATH"
