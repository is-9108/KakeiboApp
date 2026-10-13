# issue-2 開発環境の構築

## 概要

docker-compose.yml に db（postgres:18）・api（.NET 10）・frontend（Vite + React + TypeScript）の3サービスを定義し、bind mount でソースを差し替えるホットリロード開発環境を作る。APIには疎通確認用の `GET /health` を実装し、xUnit・Vitest のサンプルテストをコンテナ内で実行できるようにする。GitHub Actions のCIから docker compose 経由で両テストを実行する。

## 受け入れ条件との対応

| 受け入れ条件 | 満たす方法 | 検証するテストID |
| --- | --- | --- |
| `docker compose up` でPostgreSQL・API・フロントエンドのコンテナが起動する | docker-compose.yml に db（ヘルスチェック付き）・api・frontend の3サービスを定義 | T1 |
| APIの疎通確認用エンドポイントにGETで200が返る | Program.cs に `GET /health` を実装 | T2 |
| フロントのサンプルテストがコンテナ内で実行でき、成功する | Vitest + Testing Library のテストと `npm test` スクリプトを追加 | T3 |
| .NETのテストプロジェクトが実行でき、成功する | xUnit テストプロジェクト（WebApplicationFactory で /health を検証）を追加 | T4 |
| CIでAPI・フロントのテストが実行され、失敗するとジョブが失敗する | .github/workflows/ci.yml で compose 経由で両テストを実行し、exit code を伝播 | T5, T6 |

## 変更するファイル

| ファイル | 新規/変更/削除 | 変更内容 |
| --- | --- | --- |
| `docker-compose.yml` | 新規 | 3サービス＋ db-data ボリューム。db は pg_isready ヘルスチェック、api は db healthy 待ち・8080番、frontend は5173番。api/frontend は bind mount |
| `api/Dockerfile` | 新規 | sdk:10.0 ベース・WORKDIR /src・CMD `dotnet watch run` |
| `api/Kakeibo.sln` | 新規 | Kakeibo.Api と Kakeibo.Api.Tests を含む |
| `api/Kakeibo.Api.csproj` | 新規 | net10.0 の Web プロジェクト |
| `api/Program.cs` | 新規 | `GET /health` が 200 と `{"status":"ok"}` を返す。WebApplicationFactory 用に `public partial class Program` |
| `api/tests/Kakeibo.Api.Tests.csproj` | 新規 | xUnit + Microsoft.AspNetCore.Mvc.Testing |
| `api/tests/HealthEndpointTests.cs` | 新規 | /health のステータスコードとボディを検証 |
| `frontend/Dockerfile` | 新規 | node:22-alpine・WORKDIR /app・CMD `npm ci && npm run dev` |
| `frontend/package.json` | 新規 | react・vite・vitest・@testing-library。scripts は dev と test（`vitest run`） |
| `frontend/vite.config.ts` | 新規 | React用 + Vitest設定（jsdom・setupFiles） |
| `frontend/src/test/setup.ts` | 新規 | jest-dom の読み込み |
| `frontend/tsconfig.json` / `frontend/index.html` / `frontend/src/main.tsx` | 新規 | TypeScript設定・エントリ一式 |
| `frontend/src/App.tsx` | 新規 | 「家計簿」の見出しを表示 |
| `frontend/src/App.test.tsx` | 新規 | App が「家計簿」見出しを描画することを検証 |
| `.github/workflows/ci.yml` | 新規 | push(main)・PR をトリガーに、compose ビルド→api/frontend 両テスト |
| `.gitignore` | 変更 | `node_modules/`・`bin/`・`obj/`・`dist/` 等を追加 |

## 手順

1. main から `feat/issue-2-dev-env` を切り、compose・両Dockerfile・雛形（ビルドが通る空の Program/App）を追加し、`docker compose up -d --build` で3コンテナ起動を確認する（T1）
2. xUnit テストプロジェクトを追加し、`/health` のテストを先に書いて失敗を確認する
3. `Program.cs` に `/health` を実装してテストを通し、`docker compose run --rm --no-deps api dotnet test` の成功を確認する（T2, T4）
4. Vitest 環境と「家計簿」見出しのテストを先に書いて失敗を確認する
5. `App.tsx` に見出しを実装してテストを通し、`docker compose run --rm --no-deps frontend sh -c "npm ci && npm test"` の成功を確認する（T3）
6. `ci.yml` を追加してpushし、PRのCIで両テストが実行・成功することを確認する（T5）
7. 一時的に失敗するテストを含むcommitをpushしてCIジョブが失敗することを確認し、revert して green に戻す（T6）
8. db-data ボリューム削除後の初回起動でも、api が db のヘルスチェック通過後に起動し `/health` が 200 になることを確認する（T7）
9. PRを作成する（本文に `Closes #2`）

## テストケース一覧

| ID | 種別 | 対象 | 前提・入力 | 期待結果 |
| --- | --- | --- | --- | --- |
| T1 | 正常系 | compose起動 | `docker compose up -d --build` | db・api・frontend の3コンテナが起動し、`docker compose ps` ですべて running（db は healthy） |
| T2 | 正常系 | API疎通 | compose起動後 `curl http://localhost:8080/health` | ステータス 200 と body `{"status":"ok"}` |
| T3 | 正常系 | フロントのテスト | `docker compose run --rm --no-deps frontend sh -c "npm ci && npm test"` | Vitest が1件以上実行され全て成功、exit code 0 |
| T4 | 正常系 | .NETのテスト | `docker compose run --rm --no-deps api dotnet test` | xUnit が1件以上実行され全て成功、exit code 0 |
| T5 | 正常系 | CI（成功時） | 全テスト成功の状態でPRを更新 | ci.yml のジョブが成功し、PRのチェックが green |
| T6 | 異常系 | CI（失敗伝播） | フロントのテストを1つ意図的に失敗させたcommitをpush | CIジョブが失敗しチェックが red（確認後 revert して green に戻す） |
| T7 | 境界値 | 起動順序・初回起動 | `docker compose down -v` でボリューム削除後に `docker compose up -d` | api は db のヘルスチェック通過後に起動し、初回でも最終的に `/health` が 200 |

## 対象外

- 収支・集計・認証などの業務機能
- 本番デプロイ（S3・Lambda・Neon・Cognito）
- DBへの実際の接続・マイグレーション（db は起動のみ。compose に接続文字列の環境変数の定義だけ行う）
- ホストマシンでの直接実行（dotnet / npm をホストで使う手順）の整備
- CIのキャッシュ最適化

## 確認事項・リスク

- issue #7 で Lambda の .NET 10 マネージドランタイムが使えない場合は、カスタムランタイムか .NET 8 変更をそこで検討する（本issueでは影響なし）
- CIの初回実行は npm ci・NuGet restore に数分かかる。キャッシュは必要になったら別issue
- `dotnet watch` のファイル監視は bind mount 上で動作する想定。動かない場合は都度再ビルドに切り替え
