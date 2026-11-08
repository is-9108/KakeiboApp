---
name: plan-issue
description: Issue の実装プランとテスト計画を .ai/plan.md に作成する。H2 の前にプランを作るときに使う。
argument-hint: "[Issue 番号]"
disable-model-invocation: true
---

# プラン作成

作業ルールは `CLAUDE.md`、工程・テンプレートの正本は `docs/workflow.md` §3。担当はプラン作成のみ。

1. 引数、または既存の `.ai/plan.md` から Issue 番号を決め、`gh issue view <番号>` と `gh issue view <番号> --comments` を読む。読めなければ人間に内容を求める。
2. cwd が専用 Worktree、ブランチが `issue-<番号>-*` であることを確認する。未作成なら Muse／人間に Codex による作成を依頼する。
3. 関連コード、既存テスト、`docs/requirements.md` を読み取りのみで調査する。不明点は推測で埋めず、少数の選択肢と推奨案で確認する。
4. `docs/workflow.md` のテンプレートで `.ai/plan.md` を作成する。状態は `承認待ち`。変更ファイル、手順、テストケース、リスクを会話履歴なしで引き継げる粒度に書く。コードそのものは書かない。
5. 全受け入れ条件がテスト計画に対応し、コードを書いていないか確認する。実装・レビュー・commit・push・PR 作成は行わない。禁止事項は `CLAUDE.md` に従う。
6. チャットに計画のパスと未決事項を報告する。H2 の承認は人間が行い、承認済み状態への更新は Muse が行うことを明記する。
