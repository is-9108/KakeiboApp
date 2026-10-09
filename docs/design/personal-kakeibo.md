# 共通契約: 個人用家計簿アプリ

関連要件: `docs/requirements/personal-kakeibo.md`。本書はIssue #1が定める後続実装の唯一の具体契約。コード・リソース・実行試験は本Issueでは作らない。

## 1. 全体構成と提供状況

本人のReact/TypeScriptブラウザ → CloudFront既定ドメイン/S3、およびCognito/TOTP → API Gateway HTTP API → .NET Lambda → Neon PostgreSQL（TLSプール接続）。秘密はSecrets Manager、ログはCloudWatch。日次バックアップは暗号化・非公開S3へ30日保持し手動復旧。通知は本人メール。
AWSリージョナルリソースは東京 `ap-northeast-1`。CloudFront/IAMはグローバルサービスであり東京限定とはしない。
**今回の変更合意（2026-10-09）**: 本人が「AWS東京・Neonシンガポールを正とし、今回要件書も整合更新する」と明示回答した（`.pi/harness/issue-1-r4/qa.md`）。Neonは `aws-ap-southeast-1`。本Issueで要件書§6/8/10も整合更新し、過去セッションの承認を今回の根拠として推測しない。

以下は今回2026-10-09 UTCに一次資料を再取得・本文照合した結果。取得URL/時刻/HTTP 200/本文証跡は `.pi/harness/issue-1-r4/logs/sources/1.txt`〜`9.txt`（表順、.NETは4/5、JWT追加資料は9）。提供確認と実環境・費用・性能合格を区別する。

| 対象 | 一次資料URL・確認内容 | 判定 |
|---|---|---|
| AWS東京 | https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/ : API Gateway/Lambda/S3/Secrets Manager/CloudWatch/SNS/KMSは全地域のcore services | 構成の提供を確認、実アカウント作成は未実施 |
| Cognito東京 | https://docs.aws.amazon.com/general/latest/gr/cognito_identity.html : user poolsの東京endpoint掲載 | 提供確認 |
| HTTP API | https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html : Lambda連携、https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html : JWT/issuer/audience検証 | 機能確認、東京への配備試験は分割案3 |
| .NET LTS | https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core : .NET 10はLTS。https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html : `dotnet10` / Amazon Linux 2023、非推奨予定2028-11-14、作成停止2028-12-14、更新停止2029-01-15 | .NET 10採用。8は2026-11-10非推奨予定で新規採用しない。配備時に再確認 |
| Neon地域 | https://neon.com/docs/introduction/regions : 東京なし、Singapore `aws-ap-southeast-1`あり | 元要件不適合を相談済み、変更先提供確認 |
| Neon pool | https://neon.com/docs/connect/connection-pooling : `-pooler` endpoint、PgBouncer transaction mode | 対応確認。セッション依存のSET/ロックに頼らず単一transaction内で処理 |
| Neon TLS | https://neon.com/docs/connect/connect-securely : TLS、`verify-full` | 対応確認。NpgsqlはSSL Mode=VerifyFull、証明書/hostname検証、平文fallback禁止 |

**実装前/公開前ゲート**: 地域間通信の遅延・転送課金、Lambda/Neon休止、接続上限を含め通常API p95 2秒・初回10秒、合計月3,000円は未検証。変更合意は制約緩和や適合保証ではない。分割案28/33/36でバックアップ・合計費用・性能手順を確定し、不適合見込みなら該当実装前に再相談、無合意のDB/地域変更禁止。公開は全検証完了後（分割案40）。Pi 5は使用しない。

## 2. JSON/RESTと認証

共通prefix `/api/v1`、HTTPS、UTF-8 JSON（camelCase、Content-Type application/json）。UUIDは小文字ハイフン付き標準文字列、入力は大小を受理し正規化。`kind`は`income|expense`のみ。日時はUTC RFC3339、業務日付は時刻なし暦日。
全業務APIはCognito access tokenをBearerで送る。HTTP API JWT authorizerでissuer/audience/期限を検証し、Lambda共通入口でtoken_use=access、client_id、許可本人subを照合する。本人subはクライアント入力から採らない。CORSは本番CloudFront originのみ、Authorization/Content-Type/Idempotency-Keyと必要methodを許可。
公開サインアップなし、本人1アカウントを運用者が作成、TOTP MFA必須。WebはCognito SDKのサインイン/TOTP初期設定・challenge/ログアウトを使用、独自認証RESTパスは作らない。APIの権限はトークン検証だけでなく本人subで保証する。

### DTO（全出力項目は必須、nullableのみnull可）

| 名称 | 項目・JSON型 |
|---|---|
| TransactionInput | `date:string, kind:string, categoryId:string, amount:number`必須、`memo:string|null`任意 |
| Transaction | `id:string, date:string, kind:string, categoryId:string, categoryName:string, amount:number, memo:string|null, createdAt:string, updatedAt:string` |
| Category | `id:string, kind:string, name:string` |
| TransactionPage | `items:Transaction[], month:string, page:number, pageSize:number(50), totalCount:number, hasNext:boolean` |
| MonthTotals | `month:string, income:string, expense:string, balance:string`（整数十進文字列） |
| ExpenseBreakdown | `month:string, totalExpense:string, items:{categoryId:string, categoryName:string, amount:string, percentage:string}[]` |

`categoryName`は現在のカテゴリ参照から返す。登録順連番は内部のみ、日時を順序キーにしない。Mutation出力はその保存時点の値で、再取得までに別更新があり得る。

| method / path（prefix省略） | 入力 | 成功 |
|---|---|---|
| POST /transactions | TransactionInput、Idempotency-Key必須 | 201 Transaction、Location=`/api/v1/transactions/{id}`（再送も201） |
| GET /transactions/{id} | path UUID | 200 Transaction |
| GET /transactions | `month`必須、`page`任意(default 1)、`kind/categoryId`任意 | 200 TransactionPage |
| PUT /transactions/{id} | TransactionInputによる全置換、再送キー不要 | 200 Transaction（後のDB保存優先、version/If-Match不要） |
| DELETE /transactions/{id} | bodyなし | 204 bodyなし、既に不在は404 |
| GET /summaries/monthly | `month`必須、他条件不可 | 200 MonthTotals |
| GET /summaries/expenses | `month`必須、他条件不可 | 200 ExpenseBreakdown |
| GET /categories | `kind`任意、ページなし | 200 `{items:Category[]}` |
| POST /categories | `{kind:string,name:string}`両方必須 | 201 Category、Location=`/api/v1/categories/{id}` |
| PATCH /categories/{id} | `{name:string}`必須、kind不可 | 200 Category |
| DELETE /categories/{id} | bodyなし | 204 bodyなし、使用中409、不在404 |

未知のbody/queryプロパティ、重複queryキー、null必須値、型不正、JSON構文不正は400。body必須methodは単一JSON objectのみ（空body/JSON null/配列不可）、GET/DELETEはbody不可。重複JSONプロパティも400。全パスで表にないqueryは不可。application/json以外の必須bodyは400で扱う。ID形式不正は400、有効IDの対象不在は404（他ownerも不在扱い）。カテゴリ一覧はincome→expense、各種別はカテゴリ登録連番ASC。
例: 登録body `{"date":"2026-10-09","kind":"expense","categoryId":"00000000-0000-4000-8000-000000000001","amount":100,"memo":null}`（架空ID）。収支出力 `{"month":"2026-10","income":"0","expense":"100","balance":"-100"}`。

### 一覧/年月契約

`month`は厳密`YYYY-MM`、2000-01〜2100-12。ブラウザはAsia/Tokyoで当月を計算（端末local timezoneやUTCの月を使用しない）。当月が許容外なら範囲外案内を表示し、APIへ範囲外送信しない。
`page`は十進数字のみの1〜2147483647（空/符号/小数/0不可）、50件固定offset `(page-1)*50`を64bit計算。pageSize指定は400。SQLの同一request内items/countはREPEATABLE READの同一snapshot。
日付DESC、DB生成登録連番DESC。同日・同timestampでも連番一意なので静的データのページ間重複/欠落なし。登録順はINSERT時sequence割当順（commit順でなく、同時要求の到着順は保証しない）、編集でも不変、欠番許容。
0件はitems=[]/totalCount=0/hasNext=false、50件はpage1のみ、51件はpage2に1件。範囲外pageは200空配列、totalCountは実件数、hasNext=false。種別/カテゴリ両方はAND、片方だけも可。存在しないカテゴリ絞込は404、種別と不整合な組合せは400 `CATEGORY_KIND_MISMATCH`。
月/条件変更はpage1にreset。ページ間で変更が起きるとoffsetの欠落/重複は保証しない。UIは保存/削除後page1から一覧と月集計を再取得し、古い並行fetch結果は破棄する。

## 3. エラーとUI接続

LambdaエラーJSONは `{code:string, errors:{field:string,code:string}[], requestId:string}`。messageや入力値/SQL/例外/秘密を含めない。UIは安定codeから日本語へ変換、未知codeは一般エラー。fieldは入力/query名、ヘッダは`idempotencyKey`、全体は`request`。

| status / code | errorsとUI |
|---|---|
| 400 VALIDATION_FAILED | 項目別 REQUIRED/INVALID_TYPE/INVALID_FORMAT/OUT_OF_RANGE/TOO_LONG/UNKNOWN_FIELD、画面内保持し修正 |
| 400 CATEGORY_KIND_MISMATCH | categoryId、種別に合うカテゴリ再選択 |
| 401 UNAUTHENTICATED | []、未認証/期限切れ/無効token、入力を画面内保持し再ログイン案内 |
| 403 FORBIDDEN | []、有効tokenの本人以外、再試行ではなく拒否表示 |
| 404 NOT_FOUND | []、単件/カテゴリ不在。編集入力は保持し対象再取得案内 |
| 409 CATEGORY_NAME_EXISTS | name、別名へ修正 |
| 409 CATEGORY_IN_USE | []、使用中削除不可を表示 |
| 409 IDEMPOTENCY_CONFLICT | idempotencyKey、キーと入力の不一致。自動新キー再試行禁止 |
| 503 IDEMPOTENCY_IN_PROGRESS | []、競合待機timeout、Retry-After: 1、同じキーで再試行 |
| 500 INTERNAL_ERROR / 503 SERVICE_UNAVAILABLE | []、入力保持し再試行、内部原因は非公開 |

項目エラーの`errors[].code`は項目検証では表の短縮code、業務400/409ではトップレベルと同じcode（例 `{field:"categoryId",code:"CATEGORY_KIND_MISMATCH"}`）。必須欠落/null/必須文字列の空はREQUIRED、型違いはINVALID_TYPE、enum/UUID/暦日不正/整数でない金額はINVALID_FORMAT、範囲外整数/日付/page/月はOUT_OF_RANGE、長さ超過はTOO_LONG、正規化後の空名称はREQUIRED。
未知body/query名はその名前＋UNKNOWN_FIELD、重複queryはその名前＋INVALID_FORMAT、重複JSON名はその名前＋INVALID_FORMAT。壊れたJSONはrequest＋INVALID_FORMAT、空bodyはrequest＋REQUIRED、非object/null bodyはrequest＋INVALID_TYPE、禁止body/Content-Type不正はrequest＋INVALID_FORMAT。path UUID不正はid＋INVALID_FORMAT、再送ヘッダ欠落/不正はidempotencyKey＋REQUIRED/INVALID_FORMAT。
共通入口は認証→構文/形状→項目検証→DB参照の順。形状エラーがあれば項目/DBへ進まない。項目エラーは全項目を合成し同一field/codeを重複排除、field/codeのordinal昇順で返す。カテゴリ不在は404 errors=[]、種別不整合は400 categoryId、未知DB違反は500 errors=[]に閉じる。
DB制約は名前をschema担当が固定して共通変換表へ渡す。SQLSTATE 23505のカテゴリ名称一意制約だけ409 CATEGORY_NAME_EXISTS/name、23503のカテゴリ削除RESTRICTだけ409 CATEGORY_IN_USE/[]。登録/編集のFK競合はrollback後本人カテゴリを再照合し不在404または種別不整合400へ変換。既知CHECK/NOT NULLは§4の対応項目codeへ変換、制約名/SQLSTATE/詳細を応答に出さない。creation_requests PK違反は§6の防御処理で扱う。
HTTP API入口の401/403/429/5xxは独自JSON/空bodyになり得る。共通clientは非2xxを先にstatusで分類し、401再ログイン・403拒否・429/5xx再試行案内、DTO解析不能でもクラッシュしない。requestId未提供ならUI内部はnull。通信timeout/offlineはHTTP DTOでなくローカル`NETWORK_ERROR`。成功204はJSON parseしない。
clientは成功bodyも必須DTO形状を検証し、非204の非JSON/解析不能/形状違いはローカル`INVALID_RESPONSE`として入力保持・再試行案内（登録は結果不明として同キー維持）。非2xxでエラーDTO不正ならstatus由来の一般エラー、未知statusも一般エラーとし、生bodyを表示/ログ出力しない。
共通送信状態はidle→submitting→success/error。送信中は送信/二重操作を無効、入力変更も無効。失敗時にフォームをclear/unmountしない。認証切れ案内はフォームを同画面に保持する再ログイン導線（メモリ保持、遷移/リロード後復元なし）。オフライン永続保存なし。
取引削除は専用確認UI、取消はrequestなし、確定のみDELETE。応答喪失後の再DELETEで404ならGETの404で削除完了を確認可。編集再試行は後勝ち保存になり他変更を上書きし得る旨を表示。カテゴリ操作成功後はカテゴリ・表示中一覧・集計を再取得する。
ログはrequestId/処理時間/結果・エラー分類のみ30日。HTTPアクセス/認証/DB例外/バックアップを含めbody、金額、メモ、token、接続文字列、本人IDを記録しない。

## 4. 共通入力検証

UIとAPIの登録/編集は同じ合成検証を利用し、保存側が最終権威。型変換による文字列金額や小数の切捨て禁止。

| 項目 | 正規化・許可・拒否 |
|---|---|
| 必須/kind/categoryId | date/kind/categoryId/amount欠落/null/空を拒否、kind enum、UUID形式、カテゴリ存在と種別整合を保存transaction内検証 |
| amount | JSON numberの数学的整数1〜999999999。1/999999999許可、0/-1/1000000000/1.5/文字列拒否。通貨はJPY固定で入力フィールドなし |
| date | 厳密YYYY-MM-DD、Gregorian実在日2000-01-01〜2100-12-31。両端/未来許可、2000-02-29許可、2100-02-29/範囲外/時刻付き拒否。JSTの暦日をdateとして保存、UTC変換しない |
| memo | 未指定/null/空文字はnull。非空はUnicodeスカラー値500まで、空白/改行を保持、trim/NFCしない。500許可/501拒否 |
| name | 下記固定空白を前後除去→NFC、Unicodeスカラー値1〜30。空白のみ/31拒否、1/30許可。内部空白と大小は保持、同種別内は正規化後の大小区別完全一致 |

前後除去対象はU+0009〜000D、0020、0085、00A0、1680、2000〜200A、2028、2029、202F、205F、3000に固定（実行環境のtrim差に依存しない）。全テキストはU+0000と不正サロゲートを400 INVALID_FORMATで拒否（PostgreSQL保存不能を事前検出）。
文字数はgraphemeでなくUnicodeスカラー値: 日本語1、絵文字U+1F600は1、結合濁点はメモでは別文字、名称はNFC後。JSはArray.from/.NETはEnumerateRunes、UTF-16 lengthは使わない。DB UTF-8 char_lengthと一致させる。名称比較はPostgreSQL `COLLATE "C"`、API/UIもlocaleのcase foldingをしない。

## 5. 物理データとカテゴリ

全テーブルは本人sub `owner_sub:text NOT NULL`を持つ。APIは検証済みsubで全検索/更新を制限。DB UTF-8、UUID生成はサーバ、登録連番はDB bigint GENERATED ALWAYS AS IDENTITY（UNIQUE）、時刻はtimestamptz。以下はDDL実装担当への必須契約。

| テーブル | キー・列・制約 |
|---|---|
| categories | id uuid PK、owner_sub、kind text CHECK enum、name text COLLATE C、registration_seq bigint UNIQUE。UNIQUE(owner_sub,id,kind)、UNIQUE(owner_sub,kind,name)。CHECK nameがtrim/NFC済み・char_length 1〜30（上記固定trimを使うimmutable関数をschema担当が用意）、kind更新は禁止（DB trigger） |
| transactions | id uuid PK、owner_sub、date date CHECK範囲、kind text CHECK enum、category_id uuid、amount integer CHECK 1〜999999999、memo text nullable CHECK nullまたはchar_length 1〜500、registration_seq bigint UNIQUE、created_at/updated_at timestamptz NOT NULL。FK(owner_sub,category_id,kind)→categories(owner_sub,id,kind) ON DELETE RESTRICT/ON UPDATE RESTRICT |
| creation_requests | PK(owner_sub,key uuid)、canonical_payload text NOT NULL、transaction_id uuid NOT NULL、response_json jsonb NOT NULL、created_at timestamptz NOT NULL。transaction_idはFKなし（削除後も識別結果保持） |

DB側もメモ空文字をnullに正規化して保存する。NOT NULL/型/CHECK/FK/一意制約で直接DB不正保存を防ぐ。取引id/owner_sub/registration_seq/created_at、カテゴリid/owner_sub/registration_seqは更新不可trigger。updated_atは保存時更新、編集は行ロックで直列化し後の保存が優先。登録/編集は保存transaction内でカテゴリを本人sub/idでSELECT FOR KEY SHAREし種別検証、削除との競合はFKのロック/RESTRICTで整合保証し、制約違反を§3へ変換する。カテゴリ名snapshotはカテゴリ行のSELECT FOR SHAREでrenameとも直列化して取得する（同じtransaction）。編集/削除対象が並行削除された場合は影響0行を404にする。
索引: transactions(owner_sub,date DESC,registration_seq DESC)、(owner_sub,kind,date DESC,registration_seq DESC)、(owner_sub,category_id,date DESC,registration_seq DESC)およびFK参照用(owner_sub,category_id,kind)。月検索はdate>=月初 AND date<翌月初（2100-12も翌月境界2101-01-01を計算）、DB側集計。最終効果はEXPLAIN/負荷試験で検証。
名称を取引に複製しないので名前変更は過去一覧/集計にも反映。未使用カテゴリのみ物理削除、種別変更不可。異種別の「その他」等同名は可。
初期migrationは支出「食費、外食費、日用品、住居、水道光熱、通信、交通、医療、娯楽、その他」、収入「給与、副収入、その他」を各記載順で投入。本人subは秘密でない設定入力だが文書に実値を置かない。transaction＋migration履歴で全件原子的適用、一部失敗で公開禁止、再適用で二重作成しない。

## 6. 登録再送の識別と原子性

ブラウザが新規入力セッションの初送信前にcrypto.randomUUID()でIdempotency-Keyを生成。本人sub+キーだけが同一要求を識別し、同額同日でも別キーは別取引。POSTのみ必須、欠落/不正UUIDは400。canonical_payloadは検証・正規化後のdate/kind/categoryId/amount/memoを固定順JSONで表現し全文比較（hashだけに依存しない）。未知項目拒否、memo未指定/空/null、UUID大小は同一payloadになる。
canonical_payloadの生成はAPI共通処理だけが所有し、固定順date/kind/categoryId/amount/memo、余白なし、整数十進、memoは常にキーを含める。文字列のquote/backslashはバックスラッシュでescape、U+0001〜001Fは小文字hexの`\u00xx`、他のスカラーはUTF-8そのまま、slashはescapeしない（配備間で変更禁止）。ブラウザはキー管理に正規化済み入力の比較を使うが、DB保存文字列を自作しない。
原子手順（17が完成、13のwrapperだけがtransactionを所有）:
1. 認証・形状・値検証/正規化後、poolの同一接続でREAD COMMITTED transaction開始。未完成のcreation_requests行をINSERTしない。
2. lock IDはSHA-256(UTF-8のowner_subのバイト長を4byte unsigned big-endian＋owner_sub bytes＋UUIDの正規小文字ASCII36bytes)の先頭8byteをsigned big-endian int64とする。全配備で同一算法、秘密やプロセス内hashは不使用。hash衝突は別キーの余分な直列化のみで、要求同一性はPK/全文で判定する。
3. `SET LOCAL lock_timeout = '1s'`→`SELECT pg_advisory_xact_lock(@lockId)`。session lock禁止。競合の55P03はtransactionをrollbackし503 IDEMPOTENCY_IN_PROGRESS/Retry-After: 1（SQL待機上限1秒、ネットワーク応答時間の保証ではない）。取得後は`SET LOCAL lock_timeout = '0'`に戻し、他のDB待機timeoutは503 SERVICE_UNAVAILABLEとして区別。commit/rollbackでlock自動解放、transaction poolingでも保持区間は同一backend。
4. lock取得後、新しいstatementで`SELECT ... FROM creation_requests WHERE owner_sub=@owner AND key=@key`。READ COMMITTEDなので先行commitを読める。あればカテゴリ照合/取引保存は行わず全文比較、一致は保存済み201 DTOとtransaction_idからLocation、相違は409。読み出しを終了してtransactionをcommitしてから応答。
5. なければカテゴリ存在/種別を§5のロック付きで検証→取引INSERT→保存時DTOを取得→完成したcanonical_payload/transaction_id/response_json/created_atをcreation_requestsへINSERT→commit→201。取引と全NOT NULL列の完成記録が同一transactionで可視化される。
6. 途中失敗/検証失敗は全体rollback、取引もキーも未消費。PK(owner_sub,key)は防御として維持。万一そのPKの23505が出たら必ずrollbackし、新transactionで手順2〜4を1回再実行して完成記録を照合（失敗transaction内で再読込しない）。記録がなお不在/競合が解消しなければ503 SERVICE_UNAVAILABLE、取引INSERTだけの再実行は禁止。
別キーの同額同日はこのロック/PKが別なので2件保存。同キー逐次/同時は先行commit後の記録を返し1件、先行rollbackなら後続が保存できる。
既存キーがある場合は現在のカテゴリ存在検査より先に記録照合する（後でカテゴリが削除されても再送の意味を維持）。response_jsonは保存時snapshotとして無期限保持、transaction削除でも記録削除/TTL失効させない。編集後は古い保存結果を返すが編集を上書きしない。削除後も201の過去結果のみ返し、取引復活なし。これは内部再送証跡で通常UIの復元機能ではない。バックアップは再送記録も一緒に復元する。
UIは通信/5xx/401/検証失敗の同入力再試行に同キーを維持、入力を変更したら次送信で新キー（変更して元へ戻しても新キー）。ただし結果不明後の変更は「元の要求は保存済みの可能性」を表示し、先に同キー再試行で結果を確認する導線を出す。新キーは別登録になることを明示し、勝手に自動新キーretryしない。
201受信後はフォーム完了扱いとしキーを破棄、次の意図的な登録は同じ入力でも新キー。再送201を含めGET単件で現在状態を確認し、404なら既に削除済み表示、編集済みなら現在値表示。その後一覧/集計再取得。409時はキーを自動差替えせず元要求の確認を促す。キー/入力は画面メモリのみ、リロード後維持は保証しない。

## 7. 月全体集計と表示

集計APIはmonthだけ受け付け、一覧page/kind/categoryIdは受け取らない。月の日付範囲、本人subを共有するが検索条件の合成器は別。ExpenseBreakdownのtotalとitemsは同一DB snapshotで計算する。
単一amountはDB integer/.NET int/JSON number/TS number。合計はDB SUM(amount::numeric)、.NET BigInteger（DB numeric整数を文字列経由で取得、浮動小数不使用）、JSON整数十進文字列、TS BigInt。正数は先頭ゼロなし、ゼロは`"0"`、balanceのみ負数可、`-0`なし。円表示はBigIntから桁区切り＋円、Number変換禁止。
10万件×999999999=99999999900000（JS安全整数内）を許容し、将来JS安全整数を超えても同じ文字列/BigInt契約で精度維持。収入のみはexpense=0、支出のみはbalance負、空月は全額0円。
内訳は現在存在する全支出カテゴリ（未使用も0）を登録連番ASCで返す。食費と外食費は別ID。カテゴリが0個ならitems=[]と0円の空表示。割合は`amount*100/totalExpense`を小数1桁四捨五入（正数half-up）した`"33.3"`形式。整数演算なら千分率の丸めを `floor((amount*1000*2+total)/(2*total))`で求め10で割り表示。total=0は全行`"0.0"`、ゼロ除算しない。
丸め境界の例は1/2000=0.05%→0.1%、1/2001<0.05%→0.0%。JS安全整数超の`"9007199254740993"`もJSON文字列→BigIntでそのまま保持。丸め割合から金額を逆算しない。
1:1:1は33.3%ずつ合計99.9%、補正せず「丸めにより100%にならない場合あり」と表示。横棒グラフは同じitems/percentageを受け取り0〜100の割合幅、描画のみその小さい値をNumberへ変換可。表/tooltip/ラベルは同じ正確なamountと割合を使用し集計を複製しない。ゼロは幅0、表/ラベルは0円・0.0%、グラフ領域にも「支出0円」。

## 8. 所有ファイルと独立拡張点

番号は**分割案番号**（GitHub Issue番号でない）。以下は後続で作る具体パス。表のW=`web/src/features/`、A=`api/src/Features/`、WT=`web/tests/features/`、AT=`api/tests/Features/`。Wは.tsx（validationは.ts）、Aは.cs。機能テストはWT/ATの同機能相対名＋.test.tsx/Tests.cs、検証は.test.tsとする。共有ファイルを業務担当が無断変更しない。

| 分割案 | 所有ファイル（省略記法の括弧内はそれぞれ別ファイル）・接続点 |
|---|---|
| 1 | `web/src/App.tsx`, `web/src/features/registerFeatures.ts`, `api/src/Program.cs`, `api/src/FeatureRegistration.cs`, 全manifest/lock/solution/csproj/設定例、共通契約配置とテストrunner。共有組込みの管理者 |
| 8 | `web/src/shared/api/client.ts`, `web/src/shared/api/errors.ts`, `web/src/shared/ui/useSubmission.ts`。clientは7のtoken providerを引数で受ける |
| 1→0契約管理 | `web/src/shared/api/contracts.ts`, `api/src/Contracts/Dto.cs`, `api/src/Common/Errors.cs`。本書DTOの唯一の型定義、変更は単独調整 |
| 3,6,7 | 3:`api/src/Common/Database.cs`、6:`api/src/Auth/OwnerGuard.cs`、7:`web/src/shared/auth/session.ts`, `web/src/features/auth/Login.tsx`。認証は全handler実行前 |
| 9,10,11,12 | W`categories/(List,Create,Rename,Delete).tsx`、A`Categories/(List,Create,Rename,Delete).cs`を各番号順に対応。9はW`categories/Select.tsx`、共通合成画面W`categories/Page.tsx`も所有 |
| 13 | W`transactions/Create.tsx`, W`transactions/validation/(Required,Category).ts`, A`Transactions/Create.cs`, A`Transactions/Validation/(Required,Category).cs`, W`transactions/validation/validateTransaction.ts`, A`Transactions/Validation/TransactionValidator.cs`, A`Transactions/CreatePipeline.cs` |
| 14,15,16 | W`transactions/validation/(Amount,Date,Memo).ts`、A`Transactions/Validation/(Amount,Date,Memo).cs`を各番号順に対応。validateTransaction/TransactionValidatorは13が最初に全項目の呼出し枠を組込む |
| 17 | W`transactions/Idempotency.ts`、A`Transactions/Idempotency.cs`、AT`Transactions/IdempotencyTests.cs`と`api/tests/Integration/IdempotencyTests.cs`。13のCreatePipelineは登録transactionを包むdelegate拡張点を用意、17が原子処理を完成 |
| 18,19,20,21,22 | W`transactions/(List,Paging,Filters,Edit,Delete).tsx`、A`Transactions/(List,Paging,Filters,Edit,Delete).cs`を各番号順に対応。18がW`transactions/Page.tsx`所有、page/filters/actionsのslotを提供。21は共通validatorを利用 |
| 23,24,25 | 23:W` summaries/Monthly.tsx`（先頭空白なし）、A`Summaries/Monthly.cs`、24:W` summaries/Expenses.tsx`（同）、A`Summaries/Expenses.cs`、25:W` summaries/Chart.tsx`（同）。23はmonth接続を所有、25は24のitemsをpropsで受ける |
| 2,9 | 2:`db/migrations/0001_schema.sql`, `db/MigrationRunner.cs`, `api/tests/Integration/SchemaTests.cs`、9:`db/migrations/0002_initial_categories.sql`。2は採番/履歴/実行の管理者 |
| 1,4,3,5,26 | 1:`infra/bin/app.ts`, `infra/lib/AppStack.ts`とinfra依存/lock管理。4:`infra/lib/web/Web.ts`、3:`infra/lib/api/Api.ts`、5:`infra/lib/auth/Auth.ts`、26:`infra/lib/logs/Logs.ts` |
| 27,29,30,31,34 | `infra/lib/notifications/ApiAlarm.ts`, `infra/lib/backup/Storage.ts`, `infra/lib/backup/Schedule.ts`, `infra/lib/notifications/BackupAlarm.ts`, `infra/lib/cost/CombinedCost.ts`を各番号順に対応。root組込みは1の管理者 |
| 28,32,33,35〜40 | `docs/operations/(backup-design,restore,cost-design,security,performance-plan,performance-results,mobile-browsers,desktop-browsers,release).md`を各番号順に対応。運用実行コードの具体配置は28/33で追加契約、事前調整必須 |

共通route/DI/画面slotへの組込みはfeatureが公開する登録関数/コンポーネントを管理者が単独接続する。項目担当は専用検証と専用テストだけ変更。13が空拡張点を事前作成するが、完成していない制約/再送の経路は非公開。カテゴリPageは各操作をpropsで受け、取引Pageはpaging/filters/edit/deleteを別propsで受ける。List/Paging/Filters handlerは18の検索入口のオプション合成点を使い、共有本体の編集が必要なら直列化。
### 最小接続シグネチャ（疑似型、実ファイルは後続1/13/18が用意）

| 接続点/組込み担当 | 固定入出力・責任 |
|---|---|
| API登録 / 1 | 各featureは`RegisterFeature(routes, services): void`を公開、1のFeatureRegistrationが一度ずつ呼ぶ。routeは§2のmethod/path、handlerは`Handle(OwnerContext, request, CancellationToken) → Task<ApiResult<DTO>>`。OwnerContextは6の検証済みsub、DTO/Errorsは共有型、入口以外から未検証subを作らない |
| Web登録 / 1 | `registerFeatures({apiClient, session}) → {categoriesPage, transactionsPage, monthlyPanel}`。1がAppに組込む。7の`TokenProvider(): Promise<string\|null>`を8の`createClient(tokenProvider)`へ注入、nullはローカルUNAUTHENTICATEDで送信なし。clientは`send<T>(method,path,{query,body,idempotencyKey?}) → Promise<Result<T,ClientError>>`、204のみT=void |
| 項目検証 / 13 | Wの`validateX(raw: unknown) → FieldError[]`、Aの`ValidateX(JsonElement raw) → IReadOnlyList<FieldError>`、副作用/DBなし。13の合成器がRequired→Category形式→Amount→Date→Memoを呼び§3順に統合。必須項目の欠落/null/空文字はRequiredだけ、それ以外は各担当（memoの欠落/null/空は許可）、正規化成功時だけTransactionInputを返す。APIのカテゴリDB参照は全項目成功後、21も同合成器と§5を利用 |
| 登録wrapper / 13→17 | `CreatePipeline(owner,input,key,ct) → Task<ApiResult<Transaction>>`が形状検証後に呼ばれる。delegate `Wrap(owner,key,canonical,save,ct)`のsaveは`(connection,transaction,owner,input,ct) → Task<Transaction>`。13のCreate本体は渡されたtransactionだけでカテゴリ照合/INSERT/DTO取得、独自begin/commit禁止。17のWrapは§6のlock/照合/記録/commitを所有し、既存キーではsaveを呼ばない |
| 再送UI / 13→17 | `IdempotencySession.prepare(normalizedInput) → key`、`onInputChanged()`、`onSuccess()`、`onUnknownResult()`。13はsubmit前prepareと変更/結果通知枠を作り、17が§6のメモリ状態管理を実装。8の送信状態と統合、401でもsessionを破棄しない |
| 一覧 / 18→19→20 | `ListOptions={month:string,page:number,kind?:Kind,categoryId?:string}`、18の`Search(owner,options,ct) → Task<TransactionPage>`が検索/count/snapshotを所有。19は`ParsePage(query) → page\|FieldError[]`、20は`ParseFilters(query) → {kind?,categoryId?}\|FieldError[]`を公開し18の合成入口へ管理者が接続。初期値page=1/filtersなし、集計へ転用しない |
| 取引画面slot / 18 | Pageは`{month,onMonthChange,items,pagingSlot,filtersSlot,actionsSlot}`を受ける。pagingは`{page,hasNext,onPageChange}`、filtersは`{kind?,categoryId?,onChange}`、actionsは`{transaction,onSaved,onDeleted}`を受ける。Pageは条件変更/保存/削除のreset→一覧/月集計refreshと古いfetch破棄を所有、19/20/21/22は各slotのみ公開 |
| カテゴリ/集計slot / 9/23 | Categories Pageは`{items,createSlot,renameSlot,deleteSlot,onChanged}`、操作slotは対象CategoryとonChanged（createのみkind）を受ける。9が成功後再取得を組込む。23のmonth状態を一覧と共有し24へ`{month}`、25へ`{items:ExpenseBreakdown.items,totalExpense:string}`を渡す。25は計算/再取得をしない |
| IaC construct / 1 | 各専用constructは`(scope,id,props)`で設定入力、公開readonly outputsで参照を渡す。3はAPI endpoint、4はsite origin、5はpool/client/issuer、29はbackup bucketを公開。1のrootが依存順で接続、origin/issuer/secret参照の共有変更は1/3/4/5で単独調整（秘密実値をprops/出力/文書へ露出しない） |

13/18/9が所有する合成ファイルへの後続組込みは各管理者が直列作業し、項目/slot担当は登録要求と専用export/テストのみ提出。未完成delegate/validatorを成功扱いするstubの経路は非公開、全制約完成後の契約試験を必須とする。
IaCはAWS CDK TypeScriptを採用（Webと同言語、AWS構成/独立construct/CloudFormation差分管理）。Terraformは今回不採用、既存stateなし。Neon project作成はAWS CDK対象外で分割案3の手順/設定管理へ、AWS構成は全てIaC。実DB migration実行基盤は1/2で整備しtransaction poolingに非対応の運用ツールは2/28が接続方式を別途確認する。
共有契約変更手順: 影響担当へ通知→関係作業停止→管理者が単独で本書/DTO/合成点を変更→要件変更なら本人承認→影響テストと契約レビュー→担当確認後再開。分離できない14/15/16は14→15→16、登録本体変更は13完了後17を単独、共有Page変更も直列化する。
Migrationは2が0003以降の番号と依存順を予約し各Issueが別ファイル作成、適用済みSQL改変禁止。実行は単一実行者とtransaction advisory lock、履歴/checksumを記録し不一致で停止。共有schema変更は通知/停止/新migration/試験/再開、schemaとfeatureの配備順も予約。追加互換変更はmigration→新API→Webの順、旧APIとの互換性を試験してから再開。破壊的変更は関係API停止→バックアップ→migration→API/Web更新→契約試験→再開とし、失敗時は公開しない。適用済みSQLを書き戻さず新migrationまたは承認済み復元手順で回復する。復元では再送記録/sequenceとカテゴリ参照を含める。
IaC root/依存/lockは1の管理者が変更要求をqueueで直列処理、同じstackへの同時deploy禁止。機能担当は専用constructと入出力だけ編集し、共有設定や秘密を無断追加しない。依存先は分割案の依存表を維持、試験DBは復元/負荷/ブラウザで分離する。

## 9. FR追跡と後続試験

| 要件 | 本書の契約接続点 |
|---|---|
| FR-001/002/003 | §2 POST/単件GET、§4検証、§5物理制約、§6再送 |
| FR-004/005 | §2年月/50件/AND/登録順、§5索引、§3再取得 |
| FR-006/007 | §2 PUT/DELETE、§3確認/保持、§4共通検証、§5後勝ち |
| FR-008/009 | §7月全体/型/割合/表とグラフ、§5カテゴリ参照 |
| FR-010/011 | §2カテゴリAPI、§4名称、§5初期データ/FK/一意制約 |
| FR-012/013 | §2Cognito/本人入口、§3共通エラー/UI |
| NFR-009/011 | §8所有ファイル/拡張/移行/IaC調整、分割案の先行依存維持 |

本IssueのT1〜T11は手動契約レビューでありアプリ実行テストではない。後続はユニット（全入力境界/BigInt/丸め）、実DB結合（FK/同時再送/削除後再送/静的ページ/変更後名称）、UI（入力保持/送信中/確認/認証切れ/表グラフ）を実施。認証否定・TLS/CORS/秘密/ログ検査、性能、日次バックアップ/復元・通知・ブラウザの実環境証跡は省略不可。バックアップ/合計費用通知/性能の詳細設計は分割案28/33/36に残し、本書で達成済みとはしない。
