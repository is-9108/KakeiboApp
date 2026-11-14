# デプロイ権限の正本

`policies/*.json` は `kakeibo-github-deploy` に付けるカスタマー管理ポリシーの正本です。コンソールで直接編集せず、JSON → PR → 人間が管理者プロファイルで反映、の順で変更します。デプロイロール・CD からは反映しません。

## 構成

| ファイル（ポリシー名は拡張子なし） | 種別 | 担当サービス・主な Resource | 文字数 | 上限比 |
|---|---|---|---:|---:|
| `kakeibo-github-deploy-core.json` | 管理 | state の対象キー・ロック、DB Secret 完全一致、Lambda ログ参照、リソース制限非対応アクション | 1172 | 19.1% |
| `kakeibo-github-deploy-edge.json` | 管理 | 既存 Distribution / OAC / API ID、function/kakeibo-* | 1521 | 24.8% |
| `kakeibo-github-deploy-events.json` | 管理 | kakeibo-* SNS、schedule-group/kakeibo-*、schedule/kakeibo-*/* | 869 | 14.1% |
| `kakeibo-github-deploy-iam.json` | 管理 | 実行ロール、サービス別 PassRole、自己昇格防止 Deny | 2123 | 34.6% |
| `kakeibo-github-deploy-lambda.json` | 管理 | function:kakeibo-*、/aws/lambda/kakeibo-* ロググループ | 979 | 15.9% |
| `kakeibo-github-deploy-s3.json` | 管理 | site / artifacts / receipts バケット、site / artifacts オブジェクト | 1313 | 21.4% |

文字数は `compact=$(jq -c . <file>); echo "${#compact}"` で数えます（末尾改行を除く）。管理ポリシーは各6,144文字まで、インラインは合計10,240文字までです。スクリプトも同じ方法です。

## 運用ルール

- 読み取りは Get / List / Describe のワイルドカード、書き込み・削除は個別列挙とし、作成・読み取り・更新・削除・タグのライフサイクルをそろえます。
- S3 バケット読み取りは例外です。`GetBucket*`・`ListBucket*` と既存のバケット単位の個別アクションだけを使います。`Get*` / `List*` は Resource の `*` が `/` をまたぎ、receipts 画像や state の対象外キーまで読めてしまうため使いません。追加時も個別に列挙します。
- S3 書き込みは site / artifacts と receipts を分けます。receipts にバケットポリシーの変更権限を与えません。state は対象キーとロックに限定します。
- `Resource: "*"` は Service Authorization Reference のリソースタイプ欄が空のアクションだけを `NoResourceLevelSupport` に個別列挙します。追加前にも必ず同欄を確認します。
- デプロイロール自身と `policy/kakeibo-github-deploy-*` への IAM 書き込みは Allow に含めず、Deny でも拒否します。実行ロールの書き込みは限定パターン、PassRole は6本を列挙しサービスごとに分けます。
- Deny が防ぐのは自身のロールと管理ポリシーへの直接変更だけです。実行ロールの信頼ポリシー変更・強いインラインポリシー付与・引き受けによる間接的な権限昇格は防げません。OIDC の引受先を production の immutable subject に固定する前提で緩和しています。Permissions boundary の強制は別 Issue で扱います。
- 8本または4,915文字を超えそうなら再編します。まずワイルドカード化・Statement 統合を検討し、足りなければ担当サービスを分割します。管理ポリシーの既定上限は10本です。
- 未マージのブランチから反映した PR を閉じる場合は main の正本から再反映します。
- ログには ARN が出ます。出力を公開の場に貼らないでください。

## 実行方法

人間が管理者の `AWS_PROFILE` と `AWS_REGION` を設定し、AWS CLI v2・jq・diff・Git を用意します。必要な権限は `access-analyzer:ValidatePolicy`、`sts:GetCallerIdentity`、`iam:GetPolicy` / `GetPolicyVersion` / `ListPolicyVersions` / `CreatePolicy` / `CreatePolicyVersion` / `DeletePolicyVersion` / `ListAttachedRolePolicies` / `AttachRolePolicy` / `ListRolePolicies` / `GetRolePolicy` / `PutRolePolicy` です。移行・ロールバック・削除には下記の手動操作の権限も必要です。

```bash
export AWS_PROFILE=<管理者プロファイル>
export AWS_REGION=ap-northeast-1
./infra/iam/apply-policies.sh --validate-only
./infra/iam/apply-policies.sh --check
./infra/iam/apply-policies.sh
```

全モードでローカル検査と ValidatePolicy を行います。ERROR / SECURITY_WARNING は停止、WARNING / SUGGESTION は表示して続行します。`--validate-only` は IAM・STS を呼びません。`--check` は取得・比較のみ、通常モードは変更分だけ反映し、最大5回・3秒間隔で比較します。`--check` は再試行しません。

既定ディレクトリに未コミットの変更があれば拒否します。`--allow-dirty` で明示許可できます。`--policies-dir <dir>` は Git 検査を省くため、反映モードでは `--allow-dirty` も必須です（検証・比較モードでは不要）。比較の正規化は `jq -S -c .` で、配列順は変えません。正本にないポリシーは報告だけで、自動解除・削除しません。

| 終了コード | 意味 |
|---|---|
| 0 | 成功・差分なし／検証成功 |
| 1 | 引数・前提・主体・Git 状態のエラー |
| 2 | ローカル JSON・Version・名前・文字数・本数の不正 |
| 3 | ValidatePolicy の ERROR / SECURITY_WARNING |
| 4 | 反映中の API 失敗（表示された進捗を確認して再実行） |
| 5 | 内容またはアタッチ集合の不一致。NoSuchEntity は不足として扱う |
| 6 | ValidatePolicy または比較取得 API 自体の失敗。差分ありとは区別する |

## 初回移行

レビュー指摘がなくなった Issue ブランチの最新コミットで、人間が H4 前に行います。先に最新 main の Deploy が Re-run 可能か確認します。不可なら司令塔に報告し、マージ後だけの検証へ切り替えるか人間が判断します。

1. スナップショットのコミットで `--check` が0だったことを確認します。再編版で `--validate-only`、誤記2件の一時コピーで検証停止、旧→新の包含と新で増える権限の確認を行います（詳細は `.ai/plan.md` 手順5）。誤記を含む通常反映は行いません。
2. 新6本を通常モードで反映します。旧管理3本＋新6本で9本です。比較は旧5本が余分なので5になります。**余分が下記の旧管理3本・旧インライン2本だけ、不足なし、新6本が全て一致**の場合だけ次へ進みます。
3. 旧管理ポリシーを外し、旧インラインを削除します。本体はまだ削除しません。

```bash
for name in kakeibo-monthly-subscriptions-deploy kakeibo-receipts-deploy kakeibo-receipt-analysis-deploy; do
  aws iam detach-role-policy --role-name kakeibo-github-deploy --policy-arn "arn:aws:iam::255737342820:policy/$name"
done
for name in kakeibo-deploy kakeibo-monthly-deploy; do
  aws iam delete-role-policy --role-name kakeibo-github-deploy --policy-name "$name"
done
sleep 10
./infra/iam/apply-policies.sh --check
```

4. 終了0・差分なしを確認し、一覧を report / PR に記録します。最新 main の Deploy を Re-run all jobs し、production 承認後、refresh・変更なし apply・S3 配置・CloudFront 無効化まで成功し AccessDenied がないことを確認します。マージ後も Deploy と main の `--check` を確認します。

## ロールバックと旧管理ポリシーの削除

復旧を急ぐ場合、旧管理3本を再アタッチし、旧インライン2本をスナップショットから復元します。`SNAPSHOT_COMMIT` は旧5本を保存したコミットに設定します。

```bash
for name in kakeibo-monthly-subscriptions-deploy kakeibo-receipts-deploy kakeibo-receipt-analysis-deploy; do
  aws iam attach-role-policy --role-name kakeibo-github-deploy --policy-arn "arn:aws:iam::255737342820:policy/$name"
done
restore_dir=$(mktemp -d)
for name in kakeibo-deploy kakeibo-monthly-deploy; do
  git show "$SNAPSHOT_COMMIT:infra/iam/policies/$name.inline.json" > "$restore_dir/$name.json"
  aws iam put-role-policy --role-name kakeibo-github-deploy --policy-name "$name" --policy-document "file://$restore_dir/$name.json"
done
```

旧ポリシーが戻ればスクリプトの集合比較では余分になります。新ポリシーの明示的 Deny は旧 Allow より優先されるため、原因を確認して復旧します。

旧管理ポリシー本体の削除は任意で、本 Issue の完了条件ではありません。人間が各 ARN で `aws iam list-entities-for-policy --policy-arn <ARN>` の利用者が空であることを確認し、`aws iam list-policy-versions --policy-arn <ARN>` で非既定版を列挙し、各版を `aws iam delete-policy-version --policy-arn <ARN> --version-id <版>` で削除してから `aws iam delete-policy --policy-arn <ARN>` を行います。
