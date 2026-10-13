---
name: review-coordinate
description: review エージェントから依頼を受け、観点別レビューを独立セッションで実行し、結果をmdファイルで集めてまとめるときに使う
---

# 観点別レビューを連携する

review-coordinator は自分ではレビューしない。依頼ファイルを作り、観点別レビューを起動し、結果をまとめて返す。

## やり取りするファイル

```
.review/pr-<PR番号>/
├── src/                 # PRのコード（スクリプトが git worktree で取り出す）
└── round-<回数>/
    ├── request.md       # 依頼（review-coordinator が書く）
    ├── spec.md          # review-spec の結果
    ├── tests.md         # review-tests の結果
    ├── code.md          # review-code の結果
    ├── *.log            # 各セッションの出力
    └── summary.md       # まとめ（review-coordinator が書き、review に返す）
```

## 1. request.md を書く

review から受け取ったPR番号・issue番号・レビュー回数・実行する観点を使い、`.review/pr-<PR番号>/round-<回数>/request.md` を次の形で書く。

```markdown
# レビュー依頼：PR #<PR番号>（<回数>回目）

## 対象
- PR：#<PR番号>（`gh pr view <PR番号>`、`gh pr diff <PR番号>` で確認する）
- issue：#<issue番号>（`gh issue view <issue番号>`）
- 実装プラン：`.review/pr-<PR番号>/src/docs/plans/issue-<issue番号>.md`
- PRのコード：`.review/pr-<PR番号>/src/`（リポジトリ直下のコードは main なので見ない）

## 確認範囲
<!-- 1回目：「PR全体」
     2回目以降：「前回指摘の対応確認と、前回レビュー以降の修正差分」と書き、差分の確認方法を添える：
     `git diff <前回の head.txt のコミット> refs/review/pr-<PR番号>` -->

## 前回の指摘
<!-- 2回目以降は、前回のPRコメント「レビュー（<前回>回目）」（`gh pr view <PR番号> --comments`）の必須・推奨の指摘のうち、
     今回実行する観点（`[spec]` などの付いたもの）を写す。1回目は「なし」 -->

## 結果の書き方
- 結果は `.review/pr-<PR番号>/round-<回数>/<観点>.md` に書く（spec / tests / code）
- 形式は各観点の skill に従い、最後の行を `<!-- 完了 -->` にする
```

## 2. 観点別レビューを実行する

```
scripts/review/run-reviewers.sh <PR番号> <回数> <観点...>
```

観点は review から指定されたもの（`spec`・`tests`・`code`）を並べる。指定された観点のレビューが独立したセッションで並行に動き、すべて終わるまで待つ。時間がかかるので、シェルのタイムアウトは 3600000（60分）にする。

- 終了コード0：実行した観点がすべて完了
- 終了コード1：未完了の観点がある。表示されたログを確認し、原因が一時的なもの（タイムアウト、接続エラー）なら一度だけ再実行する。再実行しても未完了なら、その観点は「未完了」として summary.md に書く

## 3. summary.md を書く

実行した観点の結果ファイル（spec.md・tests.md・code.md のうち今回作られたもの）を読み、`.review/pr-<PR番号>/round-<回数>/summary.md` に次の形で書く。

```markdown
# レビュー結果のまとめ：PR #<PR番号>（<回数>回目）

## 実行状況
| 観点 | 結果ファイル | 状態 | 指摘数 |
| --- | --- | --- | --- |
| 仕様 | spec.md | 完了/未完了/省略 | |
| テスト | tests.md | 完了/未完了/省略 | |
| コード | code.md | 完了/未完了/省略 | |

## 指摘
| # | 観点 | 箇所 | 内容 | 根拠 | 修正案 |
| --- | --- | --- | --- | --- | --- |

## 受け入れ条件の判定
<!-- spec.md の判定をそのまま写す -->

## 前回指摘の対応状況
<!-- 2回目以降。各観点の結果から写す。1回目は「なし」 -->
```

- 実行しなかった観点は「省略」とし、指摘数は空欄にする
- 同じ箇所・同じ内容の指摘は1行にまとめ、観点を併記する
- 指摘の取捨選択や重大度の判定はしない。それは review が行う
- 指摘の内容を書き換えない。要約する場合も根拠の引用は残す

## 4. review に返す

summary.md のパスと全文を返す。PRコメントは投稿しない。
