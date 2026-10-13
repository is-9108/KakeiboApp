# issue-3 収支CRUD API

## 概要

収支をPostgreSQLのentriesテーブルに保存し、`/api/entries` にPOST（登録）・GET（月次一覧）・PUT（編集）・DELETE（削除）を実装する。EF Core + Npgsqlでテーブルを作成し（API起動時にマイグレーション適用）、種別・カテゴリは日本語のプリセット値をコード内に持ってAPI境界で検証する。テストはWebApplicationFactoryでcomposeのPostgreSQLを使う結合テストとする。

### API仕様（プランで決定した点）

| 項目 | 決定 |
| --- | --- |
| エンドポイント | `POST /api/entries`、`GET /api/entries?month=YYYY-MM`、`PUT /api/entries/{id}`、`DELETE /api/entries/{id}` |
| 種別・カテゴリの値 | 日本語をそのまま使用（`type: "収入"/"支出"`、`category: "外食費"` など） |
| 登録成功 | 201 + 保存された収支（id付き）を返す |
| 一覧の並び | `ORDER BY date DESC, id ASC`（日付の新しい順。同日付は登録順） |
| monthパラメータ | 必須。`YYYY-MM` 厳密形式以外（未指定・`2031-1`・`2031-13`・`abc` など）は400 |
| 編集 | PUTは全項目送信の完全置換（POSTと同じバリデーションを再適用。メモ省略時は空に更新される） |
| 削除成功 | 204・bodyなし |
| エラー時 | 400はProblemDetails（`application/problem+json`）。JSONバインド失敗も400 |
| メモ | 任意。省略・null・空文字はすべて `""` として保存 |
| カテゴリAPI | 一切作らない（追加・編集・削除・一覧のいずれも。プリセットはコード内定義のみ） |

プリセット（確定版・`docs/requirements.md` 4.3と同一）：

- 支出： 外食費、食費、日用品、交通費、住居費、光熱費、通信費、趣味・娯楽、医療・健康、その他（10種）
- 収入： 給与、副収入、その他（3種）
- バリデーションは「categoryがそのtypeのプリセットに含まれるか」で行う（プリセット外と種別不一致を1つのルールで包含）

## 受け入れ条件との対応

| 受け入れ条件 | 満たす方法 | 検証するテストID |
| --- | --- | --- |
| 日付・種別・金額・カテゴリを指定して登録すると、保存された内容が返る | POSTで201+保存エンティティ返却 | T1 |
| メモを省略して登録すると、メモが空の状態で登録される | メモを `""` に正規化 | T2 |
| 日付・種別・金額・カテゴリのいずれかが未指定の登録リクエストは400を返す | DTOをnull許容にして必須チェック | T7 |
| 種別が「収入」「支出」以外の値の登録リクエストは400を返す | 種別の白名单チェック | T8 |
| 金額が0以下、または整数でない登録リクエストは400を返す | 必須・`>=1` チェック＋JSONバインド失敗で400 | T9 |
| カテゴリが4.3のプリセットに含まれない登録リクエストは400を返す | 種別ごとのプリセット一致チェック | T10 |
| 収入の収支に支出用カテゴリ、支出の収支に収入用カテゴリの登録・編集は400を返す | 同上（PUTも同じバリデーション） | T11, T16 |
| 月を指定して一覧を取得すると、その月の収支だけが日付の新しい順で返る | 日付範囲フィルタ＋`ORDER BY date DESC, id ASC` | T3, T20 |
| 存在する収支を編集すると、変更内容が反映された収支が返る | PUTで全項目更新 | T4 |
| 存在しない収支のIDを指定した編集・削除は404を返す | 該当なし時に404 | T14, T17 |
| 存在する収支を削除すると、その後の一覧に含まれない | DELETEで行削除 | T5 |
| カテゴリを追加・編集・削除するAPIは存在しない | 該当ルートを定義しない | T6 |

## 変更するファイル

| ファイル | 新規/変更/削除 | 変更内容 |
| --- | --- | --- |
| `api/Kakeibo.Api.csproj` | 変更 | `Npgsql.EntityFrameworkCore.PostgreSQL`（net10.0対応の最新安定版）と `Microsoft.EntityFrameworkCore.Design` を追加 |
| `api/.config/dotnet-tools.json` | 新規 | `dotnet-ef` をローカルツールとして導入 |
| `api/Models/Entry.cs` | 新規 | エンティティ（Id / Date / Type / Amount / Category / Memo） |
| `api/Models/Presets.cs` | 新規 | 種別定数とカテゴリプリセット（支出10種・収入3種） |
| `api/Data/KakeiboDbContext.cs` | 新規 | DbContext（entriesテーブルへのマッピング） |
| `api/Migrations/` | 新規 | `dotnet ef migrations add AddEntries` が生成する初期マイグレーション一式 |
| `api/Endpoints/EntriesEndpoints.cs` | 新規 | `/api/entries` の4ルートとバリデーション |
| `api/Program.cs` | 変更 | DbContextのDI登録、起動時 `Migrate()`、エンドポイントのマップ |
| `api/tests/Infrastructure/KakeiboApiTestFactory.cs` | 新規 | WebApplicationFactory。ユニークなテストDBを `CREATE DATABASE` で作り接続文字列を差し替え、Disposeで `DROP DATABASE` |
| `api/tests/Infrastructure/ApiTestBase.cs` | 新規 | クラスfixtureでファクトリを共有し、テストごとに `TRUNCATE entries RESTART IDENTITY` で隔離。HttpClientと接続文字列を提供 |
| `api/tests/Entries/CreateEntryTests.cs` | 新規 | T1, T2, T7〜T12, T18, T19 |
| `api/tests/Entries/ListEntriesTests.cs` | 新規 | T3, T13, T20 |
| `api/tests/Entries/UpdateEntryTests.cs` | 新規 | T4, T14〜T16, T21 |
| `api/tests/Entries/DeleteEntryTests.cs` | 新規 | T5, T17 |
| `api/tests/Entries/CategoryApiAbsenceTests.cs` | 新規 | T6 |
| `api/tests/HealthEndpointTests.cs` | 変更 | 既存2テストを新テスト基盤に載せ替え（アサーションは不变。起動時にDBへ接続するため） |
| `api/tests/Kakeibo.Api.Tests.csproj` | 変更 | テストインフラ用に `Npgsql` を追加 |
| `.github/workflows/ci.yml` | 変更 | APIテストから `--no-deps` を外し、db（ヘルスチェック通過待ち）を起動してテスト |

## 手順

1. `main` から `feat/issue-3-entries-crud-api` を切る。EF Core関連パッケージと `dotnet-ef` ツールを追加し、`Entry` モデル・`KakeiboDbContext`・初期マイグレーション `AddEntries` を作成する（Program.csはまだ変更しない。ビルドとマイグレーション生成を確認）
2. テスト基盤を作る。`KakeiboApiTestFactory`（ユニークDB作成・差し替え・破棄）と `ApiTestBase`（テストごとのTRUNCATE）を追加し、`Program.cs` にDbContext登録と起動時 `Migrate()` を入れ、HealthEndpointTestsを載せ替え、CIから `--no-deps` を外す。`docker compose run --rm api dotnet test` で全テスト成功を確認
3. POSTの正常系テスト（T1, T2, T18, T19の201側）を先に書いて失敗を確認 → POSTを実装（201 + 保存内容返却）して通す
4. POSTの異常系テスト（T7〜T12, T19の400側）を先に書いて失敗を確認 → バリデーション（必須・種別・金額・カテゴリ・不一致）を実装して通す
5. GET一覧のテスト（T3, T13, T20）を先に書いて失敗を確認 → GETを実装（月フィルタ・並び順・month形式検証）して通す
6. PUTのテスト（T4, T14〜T16, T21）を先に書いて失敗を確認 → PUTを実装（404・バリデーション再適用）して通す
7. DELETEのテスト（T5, T17）を先に書いて失敗を確認 → DELETEを実装（204・404）して通す
8. カテゴリAPI不在のテスト（T6）を追加する（ルートを追加しないため最初から通るはず＝契約の固定）。全テスト再実行と `docker compose up -d` でのsmoke確認（/healthが200、dbにマイグレーションが当たる）
9. PRを作成する（本文に `Closes #3`、CI全緑を確認）

## テストケース一覧

| ID | 種別 | 対象 | 前提・入力 | 期待結果 |
| --- | --- | --- | --- | --- |
| T1 | 正常系 | POST登録 | 空DB。date=2031-01-15, type=支出, amount=1500, category=外食費, memo=昼食 | 201。bodyはidが正の整数、他は入力どおり（memo=昼食）。一覧にも同一内容で現れる |
| T2 | 正常系 | POSTメモ省略 | メモを省略 / null / 空文字 の3パターンで登録 | いずれも201でmemo="" として保存される（bodyと一覧の両方で確認） |
| T3 | 正常系 | GET一覧の並び | 2031-01-01, 01-10, 01-20（外食費1500を先、交通費200を後）, 01-31 を登録 → `?month=2031-01` | 5件が 01-31 → 01-20(外食費) → 01-20(交通費) → 01-10 → 01-01 の順（日付降順・同日付はid昇順） |
| T4 | 正常系 | PUT編集 | 前提： 1件登録（2031-01-15, 支出, 1500, 外食費, 昼食）。date=2031-02-01, type=収入, amount=50000, category=給与, memo=月給 でPUT | 200。idは不変で変更後の内容。`?month=2031-02` に変更後の1件、`?month=2031-01` は空 |
| T5 | 正常系 | DELETE削除 | 前提： 1件登録。DELETEする | 204・bodyなし。その後の `?month=その月` は空配列 |
| T6 | 正常系 | カテゴリAPI不在 | `POST /api/categories`、`PUT /api/categories/1`、`DELETE /api/categories/1` | いずれも404 |
| T7 | 異常系 | POST必須欠落 | 有効なリクエストから date / type / amount / category を1つずつ欠落（または空文字）させたパターン | いずれも400。`?month=対象月` の一覧は空（保存されない） |
| T8 | 異常系 | POST種別不正 | type=貯蓄 / type=空文字 | いずれも400、保存されない |
| T9 | 異常系 | POST金額不正 | amount=0 / -1 / 1000.5 / "千" | いずれも400、保存されない |
| T10 | 異常系 | POSTカテゴリ不正 | type=支出, category=旅行（プリセット外） | 400、保存されない |
| T11 | 異常系 | POST種別カテゴリ不一致 | type=収入+category=外食費 / type=支出+category=給与 の両方向 | いずれも400、保存されない |
| T12 | 異常系 | POST日付不正 | date="2031/01/15" / "2031-13-01" / "abc" | いずれも400（JSONバインド失敗を含む） |
| T13 | 異常系 | GET month不正 | month未指定 / "2031-1" / "2031-13" / "2031-00" / "abc" | いずれも400 |
| T14 | 異常系 | PUT存在しないID | 空DBでid=9999に有効なbody | 404 |
| T15 | 異常系 | PUT種別不正 | 前提： 1件登録。type=貯蓄 でPUT | 400。`?month=` 一覧で既存データが元のまま |
| T16 | 異常系 | PUT種別カテゴリ不一致 | 前提： 1件登録。type=収入+category=外食費 でPUT | 400。既存データは元のまま |
| T17 | 異常系 | DELETE存在しないID | 空DBでid=9999 | 404 |
| T18 | 境界値 | POST金額下限 | amount=1 | 201、amount=1で保存 |
| T19 | 境界値 | POST金額上限 | amount=2147483647 → 201で保存 / amount=2147483648 → 400 | それぞれ保存される・400 |
| T20 | 境界値 | GET月跨ぎ | 2030-12-31, 2031-01-01, 2031-01-31, 2031-02-01 を登録 → `?month=2031-01` | 2031-01-01と2031-01-31の2件のみ（前月末・翌月初を含まない） |
| T21 | 境界値 | id非数値 | `PUT /api/entries/abc` / `DELETE /api/entries/abc` | いずれも404 |

## 対象外

- 月次集計API（issue #4）・認証ガード（issue #5）・フロントエンド画面（issue #6）… issue #3の対象外の通り
- 単一収支の `GET /api/entries/{id}`、カテゴリ一覧を返すAPI（プリセットはコード内定義のみ。フロントで必要になったら別issue）
- ページネーション、作成・更新日時列
- 本番デプロイ・Neon接続（issue #7）

## 確認事項・リスク

- Npgsql.EntityFrameworkCore.PostgreSQLのバージョンはnet10.0対応の最新安定版を実装時に確認して指定する
- テストはクラス単位でユニークDBを作り、テスト間はTRUNCATEで隔離する（クラス並列実行でも干渉しない）。テスト全体の実行時間がやや伸びる
- 同日付の並び順（id昇順）・POST成功時のステータス201・month必須・PUTは全項目置換（メモ省略でクリア）は、受け入れ条件に規定がなくプランで決定した
- `dotnet-ef` のインストールとパッケージ復元でNuGetへのネットワーク参照が発生する（ローカル・CIとも可）
