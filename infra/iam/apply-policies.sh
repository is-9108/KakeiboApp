#!/usr/bin/env bash
# Git の正本を検証し、管理者の AWS_PROFILE でデプロイロールに反映する。
# デプロイロール・CD では実行しない。AWS CLI v2、jq、diff、AWS_REGION が必要。
# 権限: access-analyzer:ValidatePolicy、sts:GetCallerIdentity、
# iam:GetPolicy/GetPolicyVersion/ListPolicyVersions/CreatePolicy/CreatePolicyVersion/
# DeletePolicyVersion/ListAttachedRolePolicies/AttachRolePolicy/ListRolePolicies/
# GetRolePolicy/PutRolePolicy。ログには ARN が含まれる。
set -euo pipefail
ACCOUNT=255737342820
ROLE=kakeibo-github-deploy
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/policies"
custom=false
allow_dirty=false
mode=apply
error() { echo "エラー: $*" >&2; }
usage() { echo "使い方: $0 [--validate-only | --check] [--policies-dir <dir>] [--allow-dirty]"; }
while (($#)); do
  case "$1" in
    --validate-only|--check)
      if [[ "$mode" != apply ]]; then error "モードは同時に指定できません"; exit 1; fi
      mode="${1#--}"; shift ;;
    --policies-dir)
      if (($# < 2)) || [[ "$2" == --* ]]; then error "ディレクトリが必要です"; exit 1; fi
      DIR="$2"; custom=true; shift 2 ;;
    --allow-dirty) allow_dirty=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) error "未知の引数: $1"; usage >&2; exit 1 ;;
  esac
done
for tool in aws jq diff; do
  if ! command -v "$tool" >/dev/null; then error "$tool が必要です"; exit 1; fi
done
if [[ -z "${AWS_REGION:-}" ]]; then error "AWS_REGION が必要です"; exit 1; fi
export AWS_PAGER=""
if $custom && ! $allow_dirty && [[ "$mode" == apply ]]; then
  error "反映モードの --policies-dir には --allow-dirty が必要です"; exit 1
fi
if ! $custom && ! $allow_dirty; then
  if ! dirty=$(git status --porcelain -- "$DIR"); then error "Git 状態を取得できません"; exit 1; fi
  if [[ -n "$dirty" ]]; then error "正本に未コミットの変更があります: $dirty"; exit 1; fi
fi
shopt -s nullglob
files=("$DIR"/*.json)
if (("${#files[@]}" == 0)); then error "ポリシーがありません"; exit 1; fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
names=() kinds=() lengths=() managed=() inline=()
bad=0
total_inline=0
for file in "${files[@]}"; do
  name="${file##*/}"; name="${name%.json}"; kind=管理
  if [[ "$name" == *.inline ]]; then name="${name%.inline}"; kind=インライン; inline+=("$name"); else managed+=("$name"); fi
  names+=("$name"); kinds+=("$kind")
  if [[ ! "$name" =~ ^[a-zA-Z0-9+=,.@_-]{1,128}$ ]]; then error "$file: 不正なポリシー名"; bad=1; fi
  if ! jq -e 'type == "object" and .Version == "2012-10-17" and (.Statement | type == "array")' "$file" >/dev/null 2>&1; then
    error "$file: JSON・Version・Statement が不正です"; bad=1; lengths+=(0); continue
  fi
  compact=$(jq -c . "$file"); length=${#compact}; lengths+=("$length")
  if [[ "$kind" == 管理 ]]; then
    if ((length > 6144)); then error "$file: 文字数 $length が 6144 を超過"; bad=1
    elif ((length * 100 > 6144 * 80)); then echo "警告: $file: 文字数 $length は上限の80%超" >&2; fi
  else total_inline=$((total_inline + length)); fi
done
if (("${#managed[@]}" > 10)); then error "管理ポリシーが10本を超過"; bad=1
elif (("${#managed[@]}" > 8)); then echo "警告: 管理ポリシーが8本超" >&2; fi
if ((total_inline > 10240)); then error "インライン合計が10240文字を超過"; bad=1
elif ((total_inline * 100 > 10240 * 80)); then echo "警告: インライン合計が上限の80%超" >&2; fi
if ((bad)); then exit 2; fi
aws_json() { aws "$@" --output json; }
if [[ "$mode" != validate-only ]]; then
  if ! identity=$(aws_json sts get-caller-identity); then error "主体確認に失敗"; exit 1; fi
  if [[ "$(jq -r .Account <<<"$identity")" != "$ACCOUNT" || "$(jq -r .Arn <<<"$identity")" == *assumed-role/kakeibo-github-deploy/* ]]; then
    error "アカウント不一致またはデプロイロールでの実行"; exit 1
  fi
fi
bad=0
api_failed=0
for file in "${files[@]}"; do
  if ! findings=$(aws_json accessanalyzer validate-policy --policy-type IDENTITY_POLICY --policy-document "file://$file"); then
    error "$file: ValidatePolicy に失敗"; api_failed=1; continue
  fi
  jq -r --arg file "$file" '.findings[] | "\($file): \(.findingType) \(.issueCode) \(.findingDetails) \(.locations | tojson)"' <<<"$findings" >&2
  if ! jq -e '[.findings[] | select(.findingType == "ERROR" or .findingType == "SECURITY_WARNING")] | length == 0' <<<"$findings" >/dev/null; then bad=1; fi
done
if ((api_failed)); then exit 6; fi
if ((bad)); then exit 3; fi
if [[ "$mode" == validate-only ]]; then exit 0; fi

# NoSuchEntity だけを未作成として扱い、認可・通信エラーは伝播させる。
fetch() {
  local response
  if response=$(aws_json "$@" 2>"$tmp/aws-error"); then printf '%s\n' "$response"
  elif [[ "$(cat "$tmp/aws-error")" == *NoSuchEntity* ]]; then echo null
  else cat "$tmp/aws-error" >&2; return 1; fi
}
get_document() {
  local data
  version=-
  remote=null
  if [[ "$kind" == 管理 ]]; then
    data=$(fetch iam get-policy --policy-arn "$arn") || return 1
    if [[ "$data" != null ]]; then
      version=$(jq -er .Policy.DefaultVersionId <<<"$data") || return 1
      data=$(fetch iam get-policy-version --policy-arn "$arn" --version-id "$version") || return 1
      remote=$(jq -c 'if . == null then null else .PolicyVersion.Document end' <<<"$data") || return 1
    fi
  else
    data=$(fetch iam get-role-policy --role-name "$ROLE" --policy-name "$name") || return 1
    remote=$(jq -c 'if . == null then null else .PolicyDocument end' <<<"$data") || return 1
  fi
}
same() { [[ "$(jq -S -c . "$file")" == "$(jq -S -c . <<<"$remote")" ]]; }
apply_one() {
  local data oldest
  get_document || return 1
  if same; then echo "$name: 変更なし"
  elif [[ "$kind" == インライン ]]; then
    aws_json iam put-role-policy --role-name "$ROLE" --policy-name "$name" --policy-document "file://$file" >/dev/null || return 1
  elif [[ "$remote" == null ]]; then
    aws_json iam create-policy --policy-name "$name" --description "infra/iam/policies で管理。コンソールで編集しない" --policy-document "file://$file" >/dev/null || return 1
  else
    data=$(aws_json iam list-policy-versions --policy-arn "$arn") || return 1
    if (($(jq '.Versions | length' <<<"$data") >= 5)); then
      oldest=$(jq -er '.Versions | map(select(.IsDefaultVersion == false)) | sort_by(.CreateDate) | .[0].VersionId' <<<"$data") || return 1
      aws_json iam delete-policy-version --policy-arn "$arn" --version-id "$oldest" >/dev/null || return 1
      echo "$name: 版 $oldest を削除"
    fi
    aws_json iam create-policy-version --policy-arn "$arn" --policy-document "file://$file" --set-as-default >/dev/null || return 1
  fi
  if [[ "$kind" == 管理 ]]; then
    data=$(aws_json iam list-attached-role-policies --role-name "$ROLE") || return 1
    if ! jq -e --arg arn "$arn" '.AttachedPolicies | any(.PolicyArn == $arn)' <<<"$data" >/dev/null; then
      aws_json iam attach-role-policy --role-name "$ROLE" --policy-arn "$arn" >/dev/null || return 1
    fi
  fi
}
select_policy() {
  file="${files[$1]}"; name="${names[$1]}"; kind="${kinds[$1]}"
  arn="arn:aws:iam::$ACCOUNT:policy/$name"
}
completed=()
if [[ "$mode" == apply ]]; then
  for i in "${!files[@]}"; do
    select_policy "$i"
    if ! apply_one; then
      error "反映失敗: $name（処理途中の変更が残る可能性があります）"
      echo "反映済み: ${completed[*]:-なし}" >&2
      echo "未反映: ${names[*]:$i}" >&2
      exit 4
    fi
    completed+=("$name")
  done
fi
compare_sets() {
  local label="$1" expected="$2" actual="$3" item
  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    if ! jq -e --arg name "$item" 'index($name) != null' <<<"$expected" >/dev/null; then echo "$label 余分: $item"; mismatch=1; fi
  done < <(jq -r '.[]' <<<"$actual")
  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    if ! jq -e --arg name "$item" 'index($name) != null' <<<"$actual" >/dev/null; then echo "$label 不足: $item"; mismatch=1; fi
  done < <(jq -r '.[]' <<<"$expected")
}
check_all() {
  local attached listed expected i limit result
  mismatch=0
  attached=$(aws_json iam list-attached-role-policies --role-name "$ROLE") || return 6
  listed=$(aws_json iam list-role-policies --role-name "$ROLE") || return 6
  expected=$(printf '%s\n' "${managed[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')
  compare_sets 管理 "$expected" "$(jq '[.AttachedPolicies[].PolicyName]' <<<"$attached")"
  expected=$(printf '%s\n' "${inline[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')
  compare_sets インライン "$expected" "$(jq '.PolicyNames' <<<"$listed")"
  echo "ポリシー名 / 種別 / 既定版 ID / 文字数 / 上限比 / 結果"
  for i in "${!files[@]}"; do
    select_policy "$i"
    get_document || return 6
    result=一致
    if ! same; then
      mismatch=1; result=不一致
      jq -S . "$file" >"$tmp/local"
      jq -S . <<<"$remote" >"$tmp/remote"
      diff -u --label "正本/$name" --label "AWS/$name" "$tmp/local" "$tmp/remote" || true
    fi
    limit=6144
    if [[ "$kind" == インライン ]]; then limit=10240; fi
    echo "$name / $kind / $version / ${lengths[$i]} / $((lengths[i] * 100 / limit))% / $result"
  done
  ((mismatch == 0))
}
attempts=5
if [[ "$mode" == check ]]; then attempts=1; fi
for ((attempt=1; attempt<=attempts; attempt++)); do
  if check_all; then echo "差分なし"; exit 0; else result_code=$?; fi
  if ((attempt < attempts)); then sleep 3; fi
done
if ((result_code == 6)); then error "比較 API の取得に失敗しました"; exit 6; fi
error "取得・比較が一致しません"
exit 5
