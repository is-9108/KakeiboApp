# KakeiboApp architecture - data file for aws-architecture-diagram skill.
# Content mirrors the verified README architecture (same elements and flows).
# 再生成手順:
# aws-architecture-diagram スキル（akzedevops/aws-architecture-diagram-skill）を使う。
# 同スキルの fetch_icons.py でアイコンを icons-aws に取得する（icons-aws はコミットしない）。
# この生成元データを使い、build_diagram.py で PNG を生成し、check_diagram.py で幾何チェックを行う。
# export_drawio.py で編集用の draw.io ファイルを同じデータから生成する。

TITLE = "KakeiboApp  ·  アーキテクチャ"
SUBTITLE = "個人開発の家計簿 Web アプリ · サーバーレス構成 · 本番環境"
W, H = 1860, 1420
ICON_DIR = "icons-aws"
OUT = "architecture.png"
STRADDLE = set()
# API -> Neon (data) crosses the browser -> Cognito (auth) drop at (1360, 691):
# the Cognito drop must pass the API row to reach the clear lane below it.
ACCEPTED_CROSSINGS = {("接続 (TLS)", "ログイン (SRP)")}

CLOUD = "#232F3E"

GROUPS = [
 ("cloud", 240, 90, 1290, 1240, "AWS Cloud", CLOUD, "#232F3E", 0, 1),
]

RES = [
 ("users",          110,  430, "ブラウザ",              "React SPA"),
 ("github-actions", 110,  140, "GitHub Actions",        "CI / Deploy"),
 ("cloudfront",     560,  430, "Amazon CloudFront",     "配信"),
 ("s3",            1010,  430, "Amazon S3",             "サイト用 · 非公開"),
 ("cognito",       1360,  430, "Amazon Cognito",        "ログイン認証"),
 ("api-gateway",    560,  670, "API Gateway",           "HTTP API"),
 ("lambda",        1010,  670, "AWS Lambda",            "API · .NET 10"),
 ("s3",             560,  910, "Amazon S3",             "レシート用 · 非公開"),
 ("lambda",        1010,  910, "AWS Lambda",            "レシート解析"),
 ("bedrock",       1360,  910, "Amazon Bedrock",        "Claude Haiku 4.5"),
 ("eventbridge",    480, 1150, "EventBridge Scheduler", "月次ジョブ起動"),
 ("lambda",         800, 1150, "AWS Lambda",            "サブスク自動登録"),
 ("lambda",        1120, 1150, "AWS Lambda",            "月次通知"),
 ("sns",           1440, 1150, "Amazon SNS",            "メール通知"),
 ("postgresql",    1690,  670, "Neon",                  "PostgreSQL · 外部 SaaS"),
]

CONN = [
 ([(141, 451), (531, 451)],                                  0, "HTTPS",                (340, 451)),
 ([(591, 451), (981, 451)],                                  0, "静的コンテンツ",        (786, 451)),
 ([(560, 516), (560, 664)],                                  0, "/api* · /health",       (560, 590)),
 ([(591, 691), (981, 691)],                                  0, "",                     None),
 ([(1041, 691), (1661, 691)],                                0, "接続 (TLS)",            (1200, 691)),
 ([(110, 516), (110, 800), (1360, 800), (1360, 516)],        0, "ログイン (SRP)",         (700, 800)),
 ([(110, 226), (110, 262), (560, 262), (560, 426)],           1, "デプロイ (OIDC · Terraform)", (335, 262)),
 ([(110, 516), (110, 931), (531, 931)],                      0, "署名付き URL でアップロード", (320, 931)),
 ([(591, 931), (981, 931)],                                  0, "ObjectCreated で起動",  (786, 931)),
 ([(1041, 931), (1331, 931)],                                0, "画像解析",              (1186, 931)),
 ([(1010, 996), (1010, 1040), (1790, 1040), (1790, 691), (1715, 691)], 0, "解析結果を保存", (1400, 1040)),
 ([(511, 1171), (620, 1171)],                                0, "",                     None, 0),
 ([(620, 1171), (771, 1171)],                                0, "毎月 1 日 0:05",        (695, 1171)),
 ([(620, 1171), (620, 1100), (1120, 1100), (1120, 1144)],    0, "毎月 1 日 0:10",        (870, 1100)),
 ([(1151, 1171), (1411, 1171)],                              0, "月次サマリを送信",      (1281, 1171)),
 ([(800, 1236), (800, 1270)],                                0, "",                     None, 0),
 ([(1120, 1236), (1120, 1270)],                              0, "",                     None, 0),
 ([(800, 1270), (1790, 1270), (1790, 1040)],                 0, "",                     None, 0),
]
