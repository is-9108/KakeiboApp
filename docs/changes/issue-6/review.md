# issue #6 月次画面・収支フォーム 完了レビュー

## 1. 変更概要・確認範囲

- 承認済み計画: `docs/changes/issue-6/plan.md`。**PR #19・`origin/feat/issue-6-monthly-screen` を閲覧しない独立実装**。
- ブランチ: `feat/issue-6-monthly-screen-pi`、main `d9fd8ff` 基点。未コミット・push未実施・PR未作成。
- 変更: `frontend/src/pages/AppHome.tsx`、`frontend/src/api/client.ts`・`client.test.ts`、`frontend/src/App.test.tsx`。
- 新規: `frontend/src/pages/AppHome.css`・`AppHome.test.tsx`、`frontend/src/components/{MonthNavigation,MonthlySummary,EntryList,EntryForm,DeleteEntryDialog}.tsx`、同ディレクトリの `EntryForm.test.tsx`・`DeleteEntryDialog.test.tsx`、`frontend/src/domain/{entries,month}.ts`・各テスト。
- 対象外・非変更: `api/`、認証実装、CI、`docker-compose.yml`、依存定義（`package.json`）。ハーネス移行の未コミット変更（`AGENTS.md`・`opencode.jsonc`・`.opencode/` 配下・`docs/changes/`）は本実装と無関係のまま保全。本issueの計画・レビュー文書は区別する。
- 窓口報告: `git status` / `git diff --stat` で上記の差分範囲との一致を確認済み。

本書は窓口から渡されたimplementerの検証結果と、互い非公開の独立レビュー2ラウンドを統合したもの。writerは計画、修正箇所のコード・関連テスト記述、APIの検証辞書を静的確認した。shell・テスト実行・追加agentは使用していない。以下の実行結果はimplementer報告であり、writer自身の実行結果ではない。

## 2. 実行コマンド・検証結果

実施者はimplementer。

| 時点 | コマンド | 報告結果 |
| --- | --- | --- |
| 開始時 | `docker compose run --rm --no-deps frontend sh -c "npm ci && npm test"` | 40 passed / 3 files |
| 開始時 | `docker compose run --rm --no-deps frontend npm run build` | 成功 |
| 開始時 | `docker compose run --rm api dotnet test Kakeibo.slnx` | 85 passed / 0 failed |
| 修正後最終 | `POSTGRES_PASSWORD=localdev docker compose run --rm --no-deps frontend sh -c "npm test"` | **184 passed / 8 files** |
| 修正後最終 | `POSTGRES_PASSWORD=localdev docker compose run --rm --no-deps frontend npm run build` | 成功（tsc -b + vite build、exit 0） |

開始時コマンドは報告の表記。補足として「`.env` が存在せず `POSTGRES_PASSWORD` が必要なため、環境変数をコマンド前置のみで与えた（`.env` は作成していない）」との報告があった。開始時の環境変数前置の完全な文字列は引継ぎにないため補完しない。

修正後のAPIテストは**再実行していない**。APIは未変更で、窓口/implementer報告では `git status --short api` はクリーン。開始時の成功を修正後の実行成功とは扱わない。

横スクロール補助検証: Chrome 156 headlessで実際のDOM＋ビルドCSS、最大金額2,147,483,647・改行なし長文・長URL・削除ダイアログ表示の状態で計測した旨の報告。375px / 1280px双方で `scrollWidth <= clientWidth`、横スクロールなしを確認した。意味を推測して補完しない。**実アプリ起動下の操作検証ではない**。

## 3. 独立レビュー・指摘の状態

### 1回目

| 観点・判定 | 必須指摘 | 根拠・影響 |
| --- | --- | --- |
| spec: 修正が必要 | SPEC-1 | 初回 `AppHome.tsx:79-81` の通信断案内が再送を促し、処理済みの可能性の確認を求める計画§3.5と不整合。重複更新につながり得る |
| spec: 修正が必要 | SPEC-2 | 初回 `EntryForm.tsx:42-50` のeffect依存が `mode` のみ。編集対象切替時にスクロール・フォーカスが発火しない |
| quality: 要修正 | QUALITY-1 | 初回 `client.ts:102-113`・`entries.ts:127-145`。400 ValidationProblemの `errors` キー形式と実APIとの一致が未検証、正規化欠落。項目に対応した案内が出ない可能性 |

specの推奨は一覧・集計の取得失敗時に常設フォームも非表示。qualityの推奨はdialogの `open` 属性フォールバックにフォーカストラップがない点と、`Promise.all` の片方失敗後ももう片方の取得が継続する点。

**両レビューアーともshell不可のため、独立したテスト実行は未実施。静的確認のみ**であり、implementerの実行結果とは別である。

### 修正と新しい根拠

| ID・状態 | implementerの対応 | writerの静的確認・新しい証拠 |
| --- | --- | --- |
| SPEC-1: 修正済み | `describeMutationError` で `{message, canReload}` を返す。通信断は「処理が完了している可能性があります。一覧を再読み込みして結果を確認してください。」とGETのみの導線。フォーム編集値を保持し、削除側はダイアログを閉じてGET。サーバー4xx/5xxは従来の案内を維持。POST/PUT/DELETEを再送しない | `AppHome.tsx:63-94,241-269`、`EntryForm`・`DeleteEntryDialog` の `onReload` を確認。`AppHome.test.tsx` に登録・編集・削除の通信断と再読み込みのテスト記述あり。最終184 passedの報告とspec再レビューで解消確認 |
| SPEC-2: 修正済み | `editKey` を追加。`handleEdit` ごとに加算しeffect依存を `[mode, editKey]` に変更。同一対象の再編集でも発火、入力中は発火しない | `AppHome.tsx:223-231`、`EntryForm.tsx:48-57`、関連する編集対象切替テスト記述を確認。最終テスト報告とspec再レビューで解消確認 |
| QUALITY-1: 修正済み | 一時APIテストで実APIの400キーが小文字と実測。`readValidationErrors` で非オブジェクトを汎用扱い、不正項目を除外。有効項目なしは汎用400表示。キーをtrim・先頭小文字化・全体小文字フォールバックで正規化 | 実測はimplementer報告。writerは `EntriesEndpoints.cs:178-195` の手動辞書、`client.ts:102-142`、`entries.ts:141-150` を確認。有効項目なしは空オブジェクトの `ApiValidationError` を経て汎用文言になる。client/domain/画面の関連テスト記述、最終テスト報告、quality再レビューが新しい根拠 |

### 2回目（修正差分に焦点を当てた独立再レビュー）

- spec: **修正適合/マージ可能、ただし差分範囲・テスト成功を条件**。SPEC-1・SPEC-2は解消、QUALITY-1の仕様面も適合。新規必須・推奨指摘なし。
- quality: **マージ可能**。QUALITY-1の修正は適当、修正起因の新規必須指摘なし。
- qualityの参考意見: 非通信例外（バグ由来のTypeError等）も結果不明と扱う可能性は残る。ただしGETのみの再読み込みで状態確認できるため必須とはしない。根拠と非必須とする理由を保持する。
- spec側の条件である差分範囲確認とテスト実行は窓口/implementerにより実施済み（§1・§2）。**この条件は閉じている**。ただし§6の未検証項目まで検証済みとする判定ではない。

## 4. 受け入れ条件との対応

Test IDは計画§4・§7に統一する。引継ぎにimplementerの個別対応表そのものは含まれていないため、以下は**計画の対応表と報告済みの検証範囲の整理**であり、未提供の対応表の引用ではない。自動項目は最終テスト成功の報告に基づく。writerによる各IDの独立実行を意味しない。

| 受け入れ条件・検証対象 | Test ID | 状態・根拠の範囲 |
| --- | --- | --- |
| 前月・次月で表示月と一覧・集計が切り替わる | T01–T03 | 自動テスト成功報告（初期月、月境界、応答競合） |
| 一覧が日付の新しい順 | T04 | API順序を維持する描画の自動テスト成功報告 |
| 合計・差額・カテゴリ別支出内訳の金額と構成比、空状態 | T05・T06 | 自動テスト成功報告 |
| 必須4項目の未入力時に送信せず日本語エラー | T07 | 自動テスト成功報告 |
| 金額0以下・小数・範囲外等を拒否、境界値を許容 | T08・T09 | 自動テスト成功報告 |
| 日付・種別別カテゴリ・任意メモの検証 | T10 | 自動テスト成功報告 |
| 登録・編集・削除後に一覧・集計を更新、月外日付も扱う | T11・T13–T15 | モックによる画面結合テスト成功報告。実APIでのCRUD成功を意味しない |
| 編集既存値・編集開始フォーカス・取消 | T12 | 自動テスト成功報告、SPEC-2再レビューで解消 |
| 日本語の削除確認、キャンセル・EscでDELETEしない | T14 | 自動テスト成功報告。**実ブラウザのネイティブ `<dialog>` モーダル表示は未検証**（jsdomは `open` 属性フォールバック） |
| 重複更新防止・API失敗・成功後再取得失敗 | T16–T18 | 自動テスト成功報告、SPEC-1・QUALITY-1再レビューで解消 |
| APIクライアント契約・既存認証への接続 | T19・T20 | モックによる自動テスト成功報告 |
| 375pxで横スクロールなく一覧・フォームを操作 | T21 | 横スクロール補助検証の報告あり。**実アプリ操作は未検証** |
| 1280pxで一覧・集計・フォームを操作 | T22 | 横スクロール補助検証の報告あり。**実アプリ操作は未検証** |
| 画面文言が日本語、英語例外等を露出しない | T07・T17・T23 | 自動テスト・静的レビューの報告。実アプリでの手動確認は未実施 |
| 実Cognito＋実APIで登録→編集→削除・永続化確認 | T24相当 | **未検証**。モックテストでは代替しない |
| 全体回帰・ビルド・既存smoke・PR CI | T25 | フロント最終テスト/ビルド成功、APIは開始時のみ成功。修正後API再実行・PR CIは未確認。smoke個別の実行結果は提供なし |

## 5. 逸脱・軽微な実装判断・推奨指摘

計画は承認済み。次は引継ぎで軽微な実装判断として挙げられた記録であり、新たな要件承認を意味しない。

1. CSSは計画§5どおり `AppHome.css` 1ファイル。依頼文の「各コンポーネントCSS」という誤記に対して計画準拠を採用し是正された。
2. 画面系テストは作成→実装→初回実行（4 failed / 66 passed）の順で、未実装に対するRED実行記録がない。domain/clientにはRED（13 failed / 5 passed）の記録あり。
3. 計画未指定の日本語文言（「金額は1円以上2,147,483,647円以下で入力してください。」等）を採用。
4. 画面見出しに「家計簿」を採用。
5. フォームに「保存先は入力した日付の月です。」を常時表示。
6. `canShiftMonth` 等の補助関数を追加。
7. jsdom用のdialog `open` 属性フォールバックを追加。実ブラウザのネイティブmodal動作の検証根拠にはならない。
8. データ月不一致ガードを追加（`data.month === month` の場合のみ集計を描画）。

### 対応せず記録に残す推奨指摘（引継ぎの分類を保持）

| 推奨指摘 | 影響・留保と状態 |
| --- | --- |
| 取得失敗時・読込中に常設フォームも非表示 | 未対応のまま。親（窓口）の実物確認: `AppHome.tsx:353-380` で `EntryForm` は `loadState === 'ready'` かつ月一致の条件内にあり、読込中・取得失敗時はフォームも非表示。**未対応のままである記録は正確**と確定 |
| `DeleteEntryDialog` フォールバックのフォーカストラップなし | 未対応。`showModal` 非対応環境では `open` 属性表示のみ。ネイティブmodalと同等のフォーカス制御は保証しない |
| `Promise.all` の片方失敗後も他方の取得が継続 | 未対応。残りの通信はキャンセルされない。一方、両方成功時のみ一組で描画する制御とは別の推奨事項 |

推奨指摘は必須指摘と区別して残す。上記の常設フォームの食い違いは親（窓口）の実物確認で解消済み。

## 6. 未検証・未解決・対象外

- **未検証:** 375px / 1280pxの実アプリでの月切替・CRUD・ダイアログ操作。T21/T22の操作面は実ブラウザ補助検証＋自動テストで代替した報告であり、計画の実アプリ操作検証自体は未実施。
- **未検証:** 実Cognito＋実APIの結合（T24相当）。
- **未検証:** 実ブラウザのネイティブ `<dialog>` モーダル表示・フォーカス制御。jsdomフォールバックや横スクロール補助検証で成功とは扱わない。
- **未実施:** 修正後のAPIテスト実行。API未変更のため省略したとの報告だが、実行済みにはしない。
- **未確認:** PR作成後のCIチェック（PR未作成）。既存smokeの個別実行結果も提供なし。
- **未実施:** 両独立レビューアーによるテスト実行（静的確認のみ）。writerも実行していない。
- **未解決の記録上の確認事項:** implementer個別対応表の未提供。§5の常設フォーム非表示は親（窓口）の実物確認で未対応と確定済み。新たな必須コード指摘とは断定しない。
- **対象外:** API/DB・認証実装・CI・依存の変更、ハーネス移行の整理、コミット・push・PR作成・マージ。実施していない操作を本書の保存で完了扱いにしない。

必須指摘3件は修正・焦点再レビュー済み。独立レビューのマージ可能判定と、残る未検証・推奨事項・記録上の確認事項を分けて引き継ぐ。
