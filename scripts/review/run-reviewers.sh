#!/usr/bin/env bash
# 観点別レビュー（review-spec・review-code）を独立したセッションで並行実行する。
# review が使う。
#
# 使い方: scripts/review/run-reviewers.sh <PR番号> <レビュー回数> [観点...]
#   観点は spec・code から選ぶ。省略すると両方実行する。
#
# 実行前に .review/pr-<PR番号>/round-<回数>/request.md を置いておく。
# 各レビューは同じディレクトリの <観点>.md に結果を書く。
# レビューしたコミットを head.txt に記録する（次回、前回からの差分を見るのに使う）。
# 実行した観点の結果ファイルの最後の行がすべて「<!-- 完了 -->」なら終了コード0、そうでなければ1を返す。
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "使い方: $0 <PR番号> <レビュー回数> [観点...]" >&2
  exit 2
fi
pr=$1
round=$2
shift 2
angles=("$@")
if [[ ${#angles[@]} -eq 0 ]]; then
  angles=(spec code)
fi
for angle in "${angles[@]}"; do
  case $angle in
    spec | code) ;;
    *)
      echo "観点は spec・code のどちらか: $angle" >&2
      exit 2
      ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
base=".review/pr-$pr"
dir="$base/round-$round"
request="$dir/request.md"
if [[ ! -f $request ]]; then
  echo "$request がありません" >&2
  exit 2
fi

# PRの最新コードを、作業中のブランチに触れずに $base/src へ取り出す
git fetch -q origin "+pull/$pr/head:refs/review/pr-$pr"
git worktree remove --force "$base/src" 2>/dev/null || true
git worktree add -q --detach "$base/src" "refs/review/pr-$pr"
git rev-parse "refs/review/pr-$pr" >"$dir/head.txt"

pids=()
for angle in "${angles[@]}"; do
  out="$dir/$angle.md"
  # `opencode run --agent` がエージェントの model 設定を反映しないことがあるため、観点ごとのモデルを明示する。
  # opencode.jsonc の review-spec / review-code の model と一致させること。
  case "$angle" in
    spec) model="opencode-go/deepseek-v4-flash" ;;
    code) model="opencode-go/qwen3.8-flash" ;;
  esac
  rm -f "$out"
  opencode run --agent "review-$angle" --model "$model" --auto \
    --title "PR #$pr レビュー${round}回目 $angle" \
    --file "$request" \
    "依頼ファイル $request に従ってレビューし、結果を $out に書いてください。" \
    >"$dir/$angle.log" 2>&1 &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid" || true
done

status=0
for angle in "${angles[@]}"; do
  out="$dir/$angle.md"
  if [[ -f $out ]] && [[ $(tail -n 1 "$out") == "<!-- 完了 -->" ]]; then
    echo "完了: $out"
  else
    echo "未完了: $out（ログ: $dir/$angle.log）"
    tail -n 20 "$dir/$angle.log" 2>/dev/null | sed 's/^/  /'
    status=1
  fi
done
exit "$status"
