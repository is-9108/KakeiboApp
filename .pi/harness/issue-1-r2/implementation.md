# 実装レポート: #1 並行実装用の共通契約を確定する

## 概要

公式資料調査のT12で、承認済み要件のNeon東京に不適合の見込みを検出し、契約作成を保留した。ユーザー回答は「要件変更としてAWS東京＋Neon Singaporeを検討する（費用・性能も再確認）」であり、Singapore採用や性能・予算制約緩和の承認とは扱わない。

## 受け入れ条件の充足

| 受け入れ条件 | 対応テスト | 状態 |
|-------------|-----------|------|
| AC-1 | T1〜4 | 未実施、契約未作成 |
| AC-2 | T5〜9 | 未実施、契約未作成 |
| AC-3 | T10〜11 | 未実施、契約未作成 |
| AC-4 | T12 | 不適合見込みを相談済み、代替構成検討待ち |

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `.pi/harness/issue-1-r2/implementation.md` | 保留理由・調査・引き継ぎ |
| `.pi/harness/issue-1-r2/qa.md` | harness_askによる相談記録 |

## テストの変更（削除・スキップ・アサーションの削減）

なし。

## プランからの逸脱

T12で地域制約に不適合の見込みが出たため、プランの停止・相談方針に従い手順2以降へ進んでいない。impl_spec_gapへの遷移を申請したが、ツールはimpl_tddからimpl_reviewのみ許可として拒否した。未完了のためレビュー移行で迂回しない。

## テスト結果

- 自動テスト未実行（設定なし、文書レビュー対象）。T1〜T11未実施。T12は下記公式資料をHTTP 200で実取得して照合、東京不適合見込みのため合格扱いしない。
- 確認日: 2026-10-09。https://neon.com/docs/introduction/regions の「AWS regions」はVirginia/Ohio/Oregon/Frankfurt/London/Singapore/Sydney/São Pauloのみ。アジアは `aws-ap-southeast-1` と `aws-ap-southeast-2`、東京の掲載なし。地域は作成後変更不可。
- https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html のSupported runtimes: .NET10、`dotnet10`、Amazon Linux 2023、廃止予定2028-11-14。https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core のSupported versions: .NET10 LTS、Active、終了2028-11-14。現時点の候補は.NET10。
- https://neon.com/docs/connect/connection-pooling のConnection pooling in transaction mode: PgBouncer transaction pooling、セッション機能制限あり。https://neon.com/docs/connect/connect-securely のSSL modes: `verify-full` 推奨、ホスト名検証を含む。疎通/.NETドライバ検証は未実施。
- AWS Regional Servicesページも取得済みだが東京の個別サービス照合は未完了。取得資料の一時保存先は `/tmp/kakeibo-contract-evidence/`（次セッションでは再取得すること）。

## レビューで特に見てほしい点

- 完了レポートではなく保留の引き継ぎ。地域変更案の影響と費用・性能の再確認が先行必須。共通契約がないため後続実装を開始しない。

## 既知の制約・スコープ外で気づいたこと

- 次工程はAWS東京＋Neon Singapore案の公式提供状況、費用、越境遅延/休止後性能リスクを調査し、要件・設計・プランの変更を承認手順に沿って確定する。月3,000円目標、通常p95 2秒/休止後10秒は維持し、達成済みとはしない。
- アプリ/DB/IaC実装、実環境測定は未実施。既存のハーネス成果物/usage変更は編集していない。
