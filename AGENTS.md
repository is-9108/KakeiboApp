# KakeiboApp

このリポジトリは OpenCode と pi の両方で開発する。
共通ルールに加え、実行中の環境に対応する節だけを適用する。他方の環境の工程・エージェント・skill の規約は適用しない。

## 共通ルール

- 要件や設計を独断で変えない。判断が必要な点はPR本文かissueコメントで質問する
- `main` へ直接pushしない。最終確認とマージは人間が行う
- テストを実装に合わせて弱めない

### commit・PR・issue

- commitメッセージ、PRとissueのタイトルと本文はすべて日本語で書く
- commitの件名は種別の接頭辞（`feat:` `fix:` `docs:` `test:` `refactor:` `chore:`）の後ろを日本語にする
- PR本文は `.github/pull_request_template.md`、issue本文は `.github/ISSUE_TEMPLATE/` の見出しをそのまま使い、見出しを足したり削ったりしない。書くことがない見出しには「なし」と書く

## OpenCodeで作業する場合

この節の役割分担・開発フロー・規約は OpenCode にのみ適用する。
エージェントの定義（担当モデルと権限）は `opencode.jsonc`、工程ごとの手順は `.opencode/skills/` にある。

### 役割分担

| 工程 | 担当エージェント | 使う skill |
| --- | --- | --- |
| 要件定義・設計 | `design` | なし |
| issue分割（受け入れ条件つき） | `issue` | `create-issue` |
| 実装プラン作成（テストケース一覧を含む） | `plan` | `write-plan` |
| 実装・テストコード作成・テスト実行・PR作成 | `implement` | `create-pr` |
| PRレビュー（メインセッション） | `review` | `review-pr` |
| 観点別レビュー（独立セッション） | `review-spec`・`review-code` | `spec-review`・`code-review` |
| レビュー指摘の修正 | `fix` | `create-pr` |
| 実装中に見つけたバグ・追加タスクのissue作成 | `implement` / `fix` | `create-issue` |
| 最終確認・マージ | 人間 | — |

担当する工程の作業を始める前に、表の skill を読み込んで手順に従う。
観点別レビューの2つ（仕様・テストを見る `review-spec` と、コードを見る `review-code`）は `review` が `scripts/review/run-reviewers.sh` で独立したセッションとして起動する。人間が直接起動しない。
やり取りは `.review/pr-<PR番号>/round-<回数>/` のmdファイルで行う（依頼は `request.md`、結果は `spec.md`・`code.md`）。
自分の担当外の工程は行わない。担当外の作業が必要になったら、どのエージェントに渡すべきかを人間に伝えて止まる。

### 開発フロー

1. 要件定義・設計を `docs/` に保存する
2. 設計をissueに分割し、各issueに受け入れ条件を書く
3. issueごとに実装プランを `docs/plans/issue-<番号>.md` に書く
4. issueごとにブランチを切り、プランに沿ってテストと実装を書き、テストを実行する
5. PRを作成する（本文に `Closes #<番号>` を含める）
6. PRをレビューし、指摘をPRコメントとして投稿する
7. 指摘を修正して再pushする。レビューと修正の往復は3回までとし、それでも解決しなければ人間に判断を仰ぐ
8. 人間が最終確認してマージする

### 守ること

- `design`・`issue`・`plan`・`review` は実装コードとテストコードを書かない
- 実装はプランに従う。プランから外れる場合は、PR本文の「プランからの逸脱」に理由を書く
- プランのテストケース一覧をすべてテストコードにする

### ブランチ

- `main` から `<種別>/issue-<番号>-<短い説明>` で切る（例：`feat/issue-12-expense-form`）

## piで作業する場合

- piHarness のワークフローを使う
- 工程・担当モデル・承認手順は piHarness のコマンドと注入される指示に従う
- 設定は piHarness の設定優先順位（共有既定値 → 個人設定 → メインworktreeの `workflow.config.json`）に従う
- ブランチ・worktree・文書の保存先・レビュー手順は piHarness の規約に従う
- `opencode.jsonc` と `.opencode/skills/` は参照しない
- 初期化はメインworktreeで `/workflow-init` を実行する。既存の要件・設計・作業記録は保持する

<!-- pi-workflow:start -->
## Pi開発ワークフロー

- 工程はグローバル拡張のコマンドから開始し、工程・レビュー観点ごとに新規セッション。引き継ぎはmdのみ。
- 有効設定は共有既定値→個人設定→メインworktreeのworkflow.config.json。stageModelsで工程別モデルを優先し、nullなら3役へ継承する。役割は責務の区分。test/lint・ベースブランチは必ず当該プロジェクトで設定する。
- 開始はメインworktreeのwork/status.md（絶対パス）→当該Issue/テーマの必要なmdだけを読む。他Issueを探索しない。
- req-draftの要件情報源は承認済みinterview.mdだけ。ヒアリングは3〜5問ずつ記録し、最大10ラウンド。
- 承認は人間のみ。本文変更後の承認は無効。AIは承認を代行しない。
- Issueは1機能の1縦切り、Given/When/ThenのACを仕様へそのまま引き継ぐ。機能を勝手に追加しない。
- TDDで1タスク1commit。検証はrun_tests、status更新はupdate_status。同じエラー2回で方針変更、修正5回・レビュー3回で人間判断。
- レビューは1機能で完結なら仕様適合/正しさ、それ以外は5観点。行数では判定しない。
- 終了時はplan.md/progress.mdとstatusの対象行を更新し、決定と理由を残す。要件工程は当該テーマの記録を更新する。
- mdにコードを貼らずファイル:関数名で参照。レビュー位置はファイル:行。
- main等への直接push・force push、他Issue/範囲外編集、カウンターの無断リセットは禁止。完了はマージ確認後のみ。
- /workflow-initは初期化だけ。/issue-startと/issue-finishは人間の機械操作コマンド。プロジェクト固有の既存ルールも併せて守る。
<!-- pi-workflow:end -->
