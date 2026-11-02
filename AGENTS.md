# AGENTS.md

Codex 向けの作業ルール。共通の開発フローとテンプレートは `docs/workflow.md` にある。

## 担当範囲

- 承認済み Issue の実装
- テストコードの作成（TDD）と実行
- 不具合の修正
- 承認済みレビュー指摘の修正

要件定義・計画・レビューは Claude Code が担当する。
計画の不備や矛盾に気づいた場合は、自分で計画を変えずに報告する。

## 着手前の確認

1. Issue を読む（`gh issue view <番号>`）。読めない場合は人間に内容を求める。
2. `.ai/plan.md` を読み、`状態: 承認済み` であることを確認する。承認済みでなければ着手しない。
3. 現在のブランチが Issue 用（`issue-<番号>-*`）であることを確認する。main では作業しない。
4. 作業前にテストを実行し、既存の失敗があれば記録しておく。

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
- push と PR 作成は、人間の指示があった場合だけ行う。PR は Draft で作成する。
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
