# 実装レポート: #1 並行実装用の共通契約を確定する

## 概要

既存の共通契約を保持し、再送の原子処理、エラー詳細、独立拡張点の疑似シグネチャと配備調整を補強した。今回の明示回答に基づきAWS東京・Neonシンガポールへ要件書を整合更新し、公式一次資料9件を再取得した。アプリ/DTO/SQL/IaCコードは作成していない。

## 受け入れ条件の充足

| 受け入れ条件 | 対応テスト | 状態 |
|-------------|-----------|------|
| AC-1 | 文書契約レビュー T1/T2/T3、設計§2/3/9 | ✅ API・DTO・年月・50件・エラーを文書化 |
| AC-2 | 文書契約レビュー T1〜T9/T11、設計§4〜7、要件§6/8/10 | ✅ 業務要件と照合、地域のみ今回の回答で変更 |
| AC-3 | 文書契約レビュー T10、設計§8、既存分割案の依存表 | ✅ 所有/入出力/組込み担当/調整手順を固定 |
| AC-4 | 一次資料取得と文書レビュー T11、設計§1、今回qa.md | ✅ 提供確認・元地域不適合の相談回答・未検証ゲートを区別 |

上記は本Issueの文書契約としての充足であり、API/DB/UIの実行合格や実環境の性能/費用適合を意味しない。

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| docs/design/personal-kakeibo.md | §1今回の地域合意/資料証跡、§2/3入口/エラー詳細、§5カテゴリ競合、§6完成記録のみ保存するlock手順、§7丸め境界、§8型/slot/配備順 |
| docs/requirements/personal-kakeibo.md | §6/8/10の地域整合と遅延/転送費リスク。ドラフト表示・業務要件・数値目標は不変更 |
| .pi/harness/issue-1-r4/implementation.md | 本レポート、11件の手動レビュー結果と後続引継ぎ |
| .pi/harness/issue-1-r4/logs/sources/1.txt〜9.txt | 公式URL/取得UTC時刻/HTTP 200/HTMLから抽出した本文（公開例示値は実アカウント情報ではない） |
| .pi/harness/issue-1-r4/qa.md | ツール記録: 今回だけ既存差分込み300行超を認める回答 |

開始時から設計は176行の共通契約で、基準537b1997bf8aとの差分は追加176/削除110行あった。API表/DTO/入力境界/FR追跡/所有パスの大部分はその既存内容を保持した。今回の最終設計は205行、要件変更は追加4/削除3行。`.pi/harness.json`、他セッションのusage/成果物等の既存変更には手を加えていない。全Issue差分は `git diff 537b1997bf8a` と `git status` で確認する。

## テストの変更（削除・スキップ・アサーションの削減）

なし。実行テストファイルの作成/変更なし。

## プランからの逸脱

- 規模: 既存差分込みで300行超の見込みを着手前に相談し、本人が「今回に限り既存差分を含む300行超を承認し、承認済みプランの文書補強を続行する」と回答（今回qa.md）。再分割なし、行圧縮で制限回避せず文書のみの例外として記録する。
- 文書のみの承認プランに従い、実行Redテストは作らず手動で不足を検出→文書修正→再照合。書式検査が成功するだけのRed実行や擬似アプリテストは作っていない。
- HTTP API概要にはJWTの明示根拠がないため、追加で公式JWT authorizerページを取得。業務スコープ変更なし。

## テスト結果

- 全体書式検査: PASS（`git diff --check`、ログ: `.pi/harness/issue-1-r4/logs/test-2026-10-09_12-08-27-798.log`）。配備順追記/本レポート作成後の最終再実行は同ディレクトリの次のtestログに記録する。
- 追加した実行テスト数: 0。手動契約レビュー: 11件、全件適合。以下は文書の期待結果照合であり、API/DB/UIに実データを送っていない。
- 修正ループで遭遇した問題と原因: 実行テスト失敗なし。資料取得で`python`コマンド不在を確認し`python3`へ変更、全9資料HTTP 200。文書レビューの不足は以下に記録。

| テスト | 確認結果・根拠・不足からの修正 |
|---|---|
| T1 | FR-001〜003=POST/単件GET/検証/再送、004/005=月一覧/AND、006/007=PUT/確認DELETE、008/009=月集計2本/表横棒、010/011=初期13件/カテゴリCRUD、012/013=エラー/SDK認証と本人入口。全13要件を要件§4と設計§2〜9の表で照合、永続化/再取得/成功statusが存在。既存のFR対応を保持 |
| T2 | 設計§2/5: 2000-01〜2100-12、2100-12の検索上限2101-01-01、JST当月（UTC月不使用）。0件空、50件page1、51件page2に1件、最大pageのoffset=107374182300を64bit、0/符号/小数拒否。同日同timestampは一意連番DESC、編集不変。条件AND/カテゴリ種別不整合400、静的順とページ間変更の非保証/reset/snapshotが明記。既存契約適合 |
| T3 | 設計§2/3: 204はparseなし、401/403/404/409/429/5xxの保持/案内、非JSON/通信/取消に期待結果あり。不足だったerrors内code、field、空/重複/未知body/queryとDB違反変換を追記。成功DTO不正もINVALID_RESPONSEで保持し登録は同キー。生入力/例外を表示/ログへ出さない |
| T4 | 設計§3/4/5: 必須欠落/null/空拒否、1/999999999許可、0/負/小数/文字列拒否、2000/2100両端/未来許可、2000閏日許可/2100閏日拒否。UI/API合成検証＋DB最終制約、登録/編集共用、暦日のdate保存と変換禁止。エラーcodeを具体化 |
| T5 | 設計§4/5: memo未指定/null/空→null、500許可/501拒否、name固定trim→NFC後1/30許可/31/空白のみ拒否。絵文字1スカラー、結合文字はmemo未正規化/name NFC、U+0000/不正サロゲート拒否。大小区別/C collation、同種別同名のみ禁止を照合。既存契約保持 |
| T6 | 設計§2/3/5: 支出10＋収入3の名称を要件と照合、migration原子的/再適用防止、現在名称参照、使用中削除409、別ownerは検索不在、複合FKで越境/種別不整合防止。編集後勝ち/不変列/削除競合を照合し、ロック/0行404/制約変換を具体化 |
| T7 | 設計§5/6: 旧「同キー行確保」はNOT NULL結果列と手順が矛盾するため廃止。READ COMMITTED→transaction advisory lock→別statement照合→カテゴリ→取引/完成記録同transaction→commit。別キーは2件、同キー逐次/同時1件、異payload409、lock待機1秒503、失敗rollbackで未消費。pool対応/安定hash/PK防御と失敗transaction外での再照合を机上確認 |
| T8 | 設計§3/6/8: 応答喪失/401/同入力検証失敗でキー維持、入力変更して戻しても次送信は新キー、201後破棄。同キー再確認導線/結果不明警告あり。編集後の古いsnapshotは上書きなし、削除後201は復活なし→GET404表示。証跡無期限・backup対象、メモリのみを確認。UI delegate接続を補強 |
| T9 | 設計§7: 空月全0/収入のみ支出0/支出のみ負差額、100000×999999999=99999999900000、9007199254740993は文字列/BigInt精度保持。numeric→BigInteger→JSON string、月全体独立。1:1:1=33.3%×3（補正なし）、1/2000=0.1%・1/2001=0.0%、ゼロ/未使用も0.0%、表/横棒同items。丸め境界/逆算禁止を補強 |
| T10 | 設計§8/分割案: route/DI/token provider、項目validator合成順、唯一の登録transaction wrapper/save、検索options/parse、画面slot/集計propsの入出力と組込み担当を追加。各担当が専用export/テストを変更し共有組込みは直列の机上経路を確認。migration採番/履歴/checksum/配備順、IaC root queue/同stack同時deploy禁止、変更停止→レビュー→再開あり。依存表は不変更 |
| T11 | 設計§1＋要件§6/8/10＋今回qa: 9資料を再取得して下記本文根拠を確認。元Neon東京不適合を今回の明示回答で解決し要件も更新。.NET10/pool/TLSの提供確認は配備成功でない。地域間遅延/転送費・月3000円・p95/休止後性能は未検証、後続28/33/36で確定し不適合見込みは実装前相談、公開は40の全検証後 |

一次資料証跡（全件2026-10-09 UTC取得、HTTP 200、URL全文/取得時刻は各txtと設計§1。以下は確認した本文の抜粋）:
- 1 AWS地域提供: “The following core services are included in all Region launches”にAPI Gateway/Lambda/S3/Secrets Manager/CloudWatch/SNS/KMSが列挙。
- 2 Cognito endpoints: “Asia Pacific (Tokyo) ap-northeast-1 cognito-idp.ap-northeast-1.amazonaws.com HTTPS”。
- 3 HTTP API: “You can use HTTP APIs to send requests to AWS Lambda functions”。9 JWT追加: JWT authorizers、issuer/audience検証手順を掲載。
- 4 Microsoft: “.NET 10 … LTS Active November 14, 2028”。5 Lambda: “.NET 10 dotnet10 Amazon Linux 2023 Nov 14, 2028 Dec 14, 2028 Jan 15, 2029”。
- 6 Neon regions: “AWS Asia Pacific (Singapore) — aws-ap-southeast-1”。一覧にTokyoなし。
- 7 Neon pool: “PgBouncer in transaction mode (pool_mode=transaction)”、hostnameの-pooler、session-level advisory locks不可。今回はtransaction-scoped lock/SET LOCALのみ。
- 8 Neon TLS: “Neon requires that all connections use SSL/TLS”、verify-full/hostname verification推奨。

## レビューで特に見てほしい点

- §6: NOT NULL完成記録とadvisory lockの原子性、既存キーをカテゴリ検証より先に照合すること、rollback後の再読込、pool適合。DB実行証明は後続2/17で必要。
- §8: 疑似型はまだ実装されていない。1/13/18/9の合成管理者と各担当の境界、17だけがwrapperを完成させること、未完成経路非公開を確認してほしい。
- 地域変更/規模例外の根拠は今回qa.md。要件のドラフト表示や過去承認を推測して書き換えていない。

## 既知の制約・スコープ外で気づいたこと

- 実クラウド配備/費用見積/性能/DB競合/ブラウザ/認証/TLS/CORS/ログ/復旧/通知は未実施。提供ページは取得時点の情報であり配備時に再確認する。
- 日次backup/再送証跡保持の容量増・hash衝突による直列化・接続上限は後続で測定する。バックアップ方式/合計費用/性能詳細は分割案28/33/36、公開判定40に残す。
- アプリの自動テスト基盤は未作成。書式検査だけを契約適合や業務の動作保証とみなさない。
