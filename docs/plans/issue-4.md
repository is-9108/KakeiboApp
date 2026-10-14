# issue-4 月次集計API

## 概要

`GET /api/entries/summary?month=YYYY-MM` を追加し、指定月の収入合計・支出合計・収支差額・カテゴリ別支出内訳（金額と構成比）を返す。集計は月の収支をEF Coreで取得してLINQで行い、構成比はdecimalで四捨五入（小数第1位）する。月の解釈は一覧APIと同じ厳密YYYY-MM検証を共通ヘルパに切り出して両者で使う。

### API仕様（プランで決定した点）

| 項目 | 決定 |
| --- | --- |
| エンドポイント | `GET /api/entries/summary?month=YYYY-MM`（entriesの集計サブリソース） |
| レスポンス | `{"month":"2031-01","incomeTotal":53000,"expenseTotal":1700,"balance":51300,"expenseBreakdown":[{"category":"外食費","amount":1200,"percentage":70.6},...]}` |
| 収支差額 | 収入合計 − 支出合計（負もあり得る・int） |
| 内訳の対象 | その月に支出があるカテゴリのみ（支出0件のカテゴリ行は作らない） |
| 構成比 | 支出合計に対する割合。`Math.Round(金額×100m/支出合計, 1, MidpointRounding.AwayFromZero)`（四捨五入。banker's rounding でない） |
| 内訳の並び順 | 金額降順。同額はカテゴリ名昇順（ordinal） |
| 支出合計0の月 | `expenseBreakdown: []`（構成比0相当＝内訳行なし） |
| 0件の月 | 200で全項目0・内訳空 |
| month検証 | 一覧APIと同一（必須・厳密YYYY-MM・不正は400）。パース処理を共通ヘルパ化 |

## 受け入れ条件との対応

| 受け入れ条件 | 満たす方法 | 検証するテストID |
| --- | --- | --- |
| 指定月の収入合計が収入の金額合計と一致 | 月の収入をSUM | T1 |
| 指定月の支出合計が支出の金額合計と一致 | 月の支出をSUM | T2 |
| 収支差額が「収入合計 − 支出合計」と一致 | incomeTotal − expenseTotal | T3 |
| カテゴリ別支出内訳（金額と構成比・四捨五入） | カテゴリGroupBy＋decimal丸め | T4, T5 |
| 支出合計が0の月の構成比は0 | 内訳を行わない（空配列） | T6 |
| 収支が1件もない月は0・空で200 | 集計の既定値 | T7 |
| 他の月の収支は集計結果に含まれない | 月範囲フィルタ（一覧と同じ） | T1, T2, T9 |
| 月の指定がYYYY-MMでないリクエストは400 | 共通ヘルパの検証 | T8 |

## 変更するファイル

| ファイル | 新規/変更 | 変更内容 |
| --- | --- | --- |
| `opencode.jsonc` | 変更 | design の担当モデルを kimi-k3 → glm-5.2 に変更（コメントも更新）。本issueのスコープ外だが人間の指示により同一PRに含める |
| `api/Endpoints/EntriesEndpoints.cs` | 変更 | `GET /summary` の追加、`MonthlySummaryResponse`・`ExpenseCategoryBreakdown` のDTO追加、月範囲パースの共通ヘルパ化（GET一覧を載せ替え） |
| `api/tests/Entries/SummaryTests.cs` | 新規 | T1〜T11 |

（Program.cs・テスト基盤・CI・既存テストは変更なし。リファクタで既存テストが壊れないことを全テスト実行で確認）

## 手順

1. `main` から `feat/issue-4-monthly-summary-api` を切る。opencode.jsonc のdesignモデル変更（本issue外・人間の指示で同PRに含める）を最初にコミットし、続けてプラン `docs/plans/issue-4.md` をコミット、issue #4 の「実装プラン」欄を更新する
2. 月範囲パースを共通ヘルパに切り出し、GET一覧を載せ替える（リファクタ。全テストgreen維持を確認）
3. 正常系テスト（T1〜T7）を書いてred確認 → `GET /api/entries/summary` を実装（合計・差額・内訳・構成比）→ green
4. 異常系・境界値テスト（T8〜T11）を追加（T8・T9は共通ヘルパで通る見込み、T10で四捨五入を固定、T11は100%）→ green確認
5. 全テスト再実行と `docker compose up -d` でのsmoke（summaryをcurlで確認）
6. PRを作成する（本文に `Closes #4`、CI全緑確認）

## テストケース一覧

| ID | 種別 | 対象 | 前提・入力 | 期待結果 |
| --- | --- | --- | --- | --- |
| T1 | 正常系 | 収入合計 | 2031-01に収入2件（給与50000・副収入3000）＋前月末・翌月初に収入各1件 | 200。month=2031-01、incomeTotal=53000（隣接月を含まない） |
| T2 | 正常系 | 支出合計 | 2031-01に支出3件（外食費1000・食費500・外食費200）＋前月末・翌月初に支出各1件 | 200。expenseTotal=1700 |
| T3 | 正常系 | 収支差額 | 収入2件（53000）＋支出3件（1700） | 200。incomeTotal=53000・expenseTotal=1700・balance=51300 |
| T4 | 正常系 | 内訳の金額 | T2のデータ | expenseBreakdownは外食費=1200（2件合算）・食費=500 の2行 |
| T5 | 正常系 | 内訳の構成比と並び順 | T2のデータ | 外食費=70.6・食費=29.4（小数第1位で四捨五入）、金額降順 |
| T6 | 正常系 | 支出合計0の月 | 収入のみの月（給与50000） | 200。expenseTotal=0・balance=50000・expenseBreakdown=[] |
| T7 | 正常系 | 0件の月 | 何も登録しない | 200。incomeTotal=0・expenseTotal=0・balance=0・expenseBreakdown=[] |
| T8 | 異常系 | month不正 | 未指定 / "2031-1" / "2031-13" / "2031-00" / "abc" | いずれも400 |
| T9 | 境界値 | 月跨ぎ | 前月末・月初・月末・翌月初に支出各100 → month=2031-01 | expenseTotal=200（月初・月末を含め、前月末・翌月初を含まない） |
| T10 | 境界値 | 四捨五入の境界 | 支出 外食費53・食費27（合計80） | 外食費 66.25% → 66.3（ちょうど中間が繰り上がる＝banker's roundingでない）・食費 33.75% → 33.8 |
| T11 | 境界値 | 構成比100% | 支出 外食費のみ1000 | expenseBreakdown 1行・percentage=100 |

## 対象外

- 集計結果の画面表示（issue #6）・認証ガード（issue #5）… issue #4 の対象外の通り
- 収入カテゴリ別内訳（要件4.4は支出内訳のみ）
- SQL側での集計（GroupByクエリ）。月単位の件数が少なく個人利用のためメモリ内集計で十分
- 合計のオーバーフロー保護（int合計。現実的な金額では発生しない）

## 確認事項・リスク

- エンドポイントパス・レスポンスのフィールド名・内訳の並び順は要件に規定がなくプランで決定（フロントのissue #6で調整可）
- 構成比はdecimal演算＋`MidpointRounding.AwayFromZero`。doubleの丸め誤差とbanker's rounding（66.25→66.2）を避ける（T10で固定）
- issue #4 のPRには opencode.jsonc のdesignモデル変更が含まれる（人間の指示）。PR却下・revert時はモデル変更も一緒に戻る点に留意
