# Claude Code の起動・運用

## 導入と認証

この VM では 2026-11-07 に公式ネイティブインストーラ（stable）で導入・認証済み。実体は `~/.local/bin/claude`（2.1.311 で確認）、自動更新は stable チャンネル。PATH に `~/.local/bin` が含まれないため、絶対パスで起動する。

認証はサブスクリプション＋ `claude setup-token` の1年有効 OAuth トークン。保管先は `~/.config/claude-code/oauth-token.env`（0600、`export CLAUDE_CODE_OAUTH_TOKEN=...` 形式）、保管ディレクトリ `~/.config/claude-code/` は 0700 とする。読み込みと実行は同じサブシェル内で行う。読み込まない場合、`claude auth status` は未ログインになる。トークンの値は文書・チャット・メモリ・成果物に書かず、表示もしない。ローテーション時は保管ファイルだけ差し替える。

## 非対話実行

対象 Issue の Worktree を cwd にする。`.ai/` はその直下に置く。

```sh
(
  source ~/.config/claude-code/oauth-token.env
  ~/.local/bin/claude -p "<指示>" --output-format json < /dev/null
)
```

stdin は必ず閉じる。開いたままだと EOF 待ちで止まることがある。`--bare` は OAuth トークンを読まないため使わない。

プロンプトには Issue 番号とスキルを指定する（`/plan-issue <番号>`、`/review-merge <番号>` 相当）。長い指示は Issue と `.ai/` に保存し、それらを読むよう指示する。会話履歴に依存しない。プロジェクトスキルのスラッシュ呼び出しは、検証用コピーで `/plan-issue` の読み込みと前提不足での停止のみ確認済み（`.ai/plan.md` は未作成）。`/review-merge` の呼び出し実行は未確認（下記）。万一呼べない場合は「`.claude/skills/plan-issue/SKILL.md`（または `review-merge`）の手順に従う」と文章で指示する。

非対話では許可プロンプトに応答できない。権限確認を全て省略する設定は使わず、許可は読み取りと `.ai/` への書き込みに限る。工程に必要な読み取りと、プラン／レビュー成果物だけの書き込みを許可する権限設定が必要だが、`--allowedTools`／`--permission-mode` の具体的な設定は未確定。読み取り専用確認は特別な権限フラグなしの既定設定で実施できた一方、検証用コピーでのスキル試行では `gh issue view` の実行が承認待ちとなり実行できなかった。実運用では読み取り系の Bash（`gh` 含む）にも許可設定が要る場面がある。成果物の書き込み権限は未確認。本 Issue では `.claude/settings.json` を追加しない。必要な設定は別 Issue で扱う。

## 停止の検知

起動後は数十秒以内に出力・ログが出るか確認する。出なければ停止を疑い、まず stdin を閉じたか確認する。JSON は終了時まで出ない場合もあるため、出力がないことだけで成功・失敗を断定しない。

バックグラウンド実行でも終了コードと JSON の `is_error`・`result` を確認する。終了コード0だけで完了とせず、レビュー本文などの必要な結果があるか確かめる。ハング時は対象プロセスを止め、stdin、トークン読み込み、egress プロキシのトークンローテーションを確認する。秘密情報をログに出さない。

## 確認済みの事実と未確認事項

以下は司令塔が実施した読み取り専用確認の記録（2026-11-09）。今回の文書実装で再実行した結果ではない。

- `~/.local/bin/claude --version`: `2.1.311 (Claude Code)`。
- トークン読み込み後の `claude auth status`: `loggedIn: true`、`authMethod: oauth_token`。
- 読み取り専用スモークテスト: 終了コード0、ファイル変更なし、コスト約 $0.026。
- `claude -p "/security-review" --output-format json < /dev/null`: 終了コード0、`is_error=false`。main との差分なし・作業ツリーがクリーンであると正しく認識し、`No vulnerabilities found` を返した。非対話実行で使用できた。
- `claude -p "/code-review low" --output-format json < /dev/null`: 終了コード0、`is_error=false` だが、`result` は `(none)`、`num_turns=0` でレビュー本文なし。この環境での実質的な利用は未確認。使える場合は使い、結果が得られない場合は `docs/review.md` の同じ観点で手動レビューする。
- プロジェクトスキルのスラッシュ呼び出し: 検証用コピーで `claude -p "/plan-issue 44" --output-format json < /dev/null` を実行し、スキルの読み込みと前提不足での停止を確認した。前提（Issue の読み取り、専用 Worktree・ブランチ、参照文書）が不足する状態では、推測で進めず理由を挙げて停止し、`.ai/plan.md` を作成・変更しなかった。結果は `--output-format json` の `result` で取得できた。
- サブエージェント（Agent ツール）: 非対話実行で1つ起動し、ファイル読み取りタスクの結果を正確に取得できた。観点別サブエージェント3つの並列実行は未確認。
- 未確認: `/review-merge` の呼び出し実行、観点別サブエージェント3つの並列実行、未コミット差分を `/code-review` が拾うか、`.ai/` への書き込みを伴う実行とその権限（スキル試行は書き込み前に停止したため未検証）。

- 追跡事項: 権限設定の具体化は別 Issue の追跡事項（上記「非対話実行」参照）。起票状況・追跡先は未確認。

公式コマンドが対象差分を取得できない場合も、`git diff main` と未追跡ファイルを読み、同じ観点で手動レビューする。実施手順は `docs/review.md` を参照する。
