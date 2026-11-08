# AGENTS.md

Codex 向けの作業ルール。共通の開発フローとテンプレートは `docs/workflow.md` にある。

## 担当範囲と承認

Codex が要件具体化、Issue 作成、専用 Worktree 作成、実装・テスト（TDD）、承認済み指摘の修正、push・Draft PR 作成、CI 確認を担当し、Claude Code はプラン作成・独立レビュー、Muse は起動・進行管理、人間は要望提示、H1〜H4 の承認・マージを担当する。

Claude Code の起動方法は `docs/claude-code.md` を参照する。

- 1 Issue = 1 Worktree = 1 ブランチ = 1 PR。各工程の前に `docs/workflow.md` の該当節を読む。
- 記録された承認範囲内では自動実行してよい。Muse の定常指示や時間経過は承認を代替しない。
- H1 前の Issue 作成、H2 前の実装、H3 未承認指摘の修正は禁止。マージは人間（H4）が行う。
- H3 承認範囲内で修正・検証・独立再レビューを反復する。新規指摘は新たな H3 まで修正しない。指摘ゼロで、人間の個別指示を待たずに push・Draft PR を自動作成する。
- 引き継ぎは Issue と `.ai/` の Markdown に書く。チャットの決定も反映し、会話履歴に依存しない。

## 要件定義（H1）

- 既存コードで実現可能性・影響範囲を調べ、目的・検証可能な受け入れ条件・範囲外を明確にした Issue 案を提示する。
- 不明点は推測で埋めず、少数の質問に選択肢と推奨案を付ける。1 PR でレビューできない要望は分割を提案する。
- H1 の明示的承認までは `gh issue create` を実行しない。要件定義中はコード変更・commit・push をしない。承認後に Issue を作成する。

## 実装計画の引き継ぎ（H2）

1. Issue 本文と承認コメントを読む（`gh issue view <番号>`、`gh issue view <番号> --comments`）。読めなければ人間に内容を求める。
2. 計画作成前に専用 Worktree と `issue-<番号>-*` ブランチを作成・確認する。以降はこの Worktree で作業し、main では実装しない。
3. Claude Code が作成した `.ai/plan.md` が `状態: 承認済み (YYYY-MM-DD)` のときだけ実装に着手する。未作成なら Muse／人間に Claude Code（`plan-issue`）による作成を依頼する。承認済み状態への更新は人間の明示承認を受けた Muse が行う。
4. 計画の不備・矛盾は独断で変更せず報告する。作業前にテストを実行し、既存の失敗を記録する。

## 独立レビューの引き継ぎ（H3）

- Claude Code の `.ai/review-<n>.md` を読み、人間が `[x]` を付けた指摘だけを修正する。Codex は修正対象を選択しない。
- 指摘 ID ごとにコミット・報告し、`.ai/report.md` に追記する。
- 修正後の再レビューは Claude Code の新規セッションで行い、`review-<n+1>.md` に保存する。Codex の自己レビューで代替しない。
- H3 承認範囲内で修正・検証・独立再レビューを反復する。新規指摘は新たな H3 を待つ。
- 未対応指摘が残る間は push・Draft PR 作成へ進まない。指摘ゼロなら人間の個別指示を待たず自動で進める。作業単位の明示的な禁止指示には従う。

## TDD

- テスト計画の項目ごとに Red → Green → Refactor を繰り返す。
- 実装の前にテストを書き、そのテストが失敗することを確認する。
- 不具合の修正は、再現テストから始める。
- 既存のテストを削除・skip したり、条件を弱めたりしない。必要な場合は人間に確認する。

## テスト実行

- コマンドは下の「プロジェクト情報」に従う。
- 完了報告の前に、テスト全体・lint・型チェック（ある場合）を実行する。
- 失敗・skip・不安定なテストを隠さず報告する。

## コード品質

- 既存の規約・構成・ライブラリに合わせる。
- 計画にないリファクタリング・抽象化・機能追加をしない。
- 秘密情報をコード・テスト・ログに含めない。
- 変更は小さく保ち、意味のある単位でコミットする。

## Git 操作

- コミットは Issue ブランチにだけ行う。
- 独立レビューで指摘ゼロとなったら、人間の個別指示を待たずに push・Draft PR 作成まで自動で行う。明示された作業単位の禁止指示がある場合は従う。マージは人間（H4）が行う。
- 次の操作は禁止:
  - main への commit / push
  - force push
  - push 済み履歴の書き換え
  - PR のマージ
- 未コミットの変更を捨てる操作（`reset --hard`、`clean`、`checkout -- .` など）は、人間に確認してから行う。

## 人間への確認事項

次の場合は、作業を止めて確認する。

- Issue の範囲外の変更が必要になった
- 計画と異なる設計が必要になった（公開 API、データ構造、DB スキーマなど）
- 依存パッケージの追加・更新が必要になった
- 要件が曖昧、または計画とコードが矛盾している
- 同じ問題を 3 回試しても解決しない

確認するときは、「状況・選択肢・推奨案」を簡潔に示す。

## 完了時の報告

`docs/workflow.md` のテンプレートに従って `.ai/report.md` に書き、同じ要点をチャットでも報告する。

- 実施内容
- 変更ファイル
- テスト結果（コマンドと結果）
- 計画との差分
- 未解決事項・確認事項

レビュー指摘を修正したときは、指摘 ID ごとの対応内容を `.ai/report.md` に追記する。

## プロジェクト情報

個人用の家計簿 Web アプリ。要件は `docs/requirements.md` を参照する。

- 技術スタック:
  - API: .NET 10 の Minimal API（`api/`）、EF Core と Npgsql（PostgreSQL）、Cognito の JWT 認証。本番は `Amazon.Lambda.AspNetCoreServer.Hosting` で Lambda（`provided.al2023`）上で動く
  - フロントエンド: React 18、TypeScript、Vite、React Router、Amplify（Cognito ログイン）（`frontend/`）
  - DB: ローカルと CI は PostgreSQL 18（Docker）、本番は Neon
  - インフラ: Terraform 1.17.1（`infra/`）。Lambda、API Gateway、S3、CloudFront を管理する
  - テスト: API は xUnit と `WebApplicationFactory`、フロントエンドは Vitest と Testing Library
- セットアップ:
  - `cp .env.example .env` を実行し、`POSTGRES_PASSWORD` を設定する
  - `docker compose up -d` で起動する（API: http://localhost:8080 、フロントエンド: http://localhost:5173 ）
  - コマンドはすべて Docker Compose 経由で実行する（ホストに .NET / Node は不要）
- テスト:
  - API: `docker compose run --rm api dotnet test Kakeibo.slnx`（テスト用 PostgreSQL が必要。テストクラスごとに専用の DB を作成する）
  - フロントエンド: `docker compose run --rm --no-deps frontend sh -c "npm ci && npm test"`
  - infra: `node --test 'infra/tests/**/*.test.mjs'`、`terraform -chdir=infra test`
- lint / format:
  - GitHub Actions: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color`
  - API: `docker compose run --rm --no-deps api dotnet format Kakeibo.slnx --verify-no-changes`
  - フロントエンド: `docker compose run --rm --no-deps frontend sh -c "npm ci && npm run lint"`
  - infra: `terraform -chdir=infra fmt -check -recursive`
- 型チェック:
  - フロントエンド: `docker compose run --rm --no-deps frontend sh -c "npm ci && npx tsc --noEmit"`
  - API: ビルドとテストの実行時にコンパイルで確認する
- ビルド:
  - フロントエンド: `docker compose run --rm --no-deps frontend sh -c "npm run build"`
  - Lambda パッケージ: `./infra/scripts/package-api.sh`
  - マイグレーション SQL: `./infra/scripts/generate-migration-sql.sh`
- 規約・注意点:
  - コメント、ドキュメント、UI の文言、テスト名は日本語で書く
  - カテゴリはプリセット固定（`api/Models/Presets.cs`）。フロントエンド側の定義（`frontend/src/domain/entries.ts`）と一致させる
  - DB スキーマを変更するときは、EF Core のマイグレーションを追加する（`docker compose run --rm api dotnet ef migrations add <名前>`。ツールは `api/.config/dotnet-tools.json` で固定している）
  - 本番では起動時にマイグレーションを実行しない（`Database__RunMigrationsOnStartup=false`）。マイグレーションは、生成した冪等な SQL で適用する
  - フロントエンドの CSS はページ単位のファイルに書き、モバイルファーストで作る（例: `frontend/src/pages/AppHome.css`）
  - 秘密情報（`.env`、`*.tfvars`、`infra/backend.s3.hcl`）はコミットしない
  - デプロイ手順は `docs/deployment.md`、認証の構成は `docs/authentication.md` を参照する
