using System.Net;
using System.Text.RegularExpressions;
using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Kakeibo.MonthlyBatch;

public sealed class ReceiptAnalysisHandler(
    Func<CancellationToken, Task<KakeiboDbContext>> createDb,
    IReceiptImageReader imageReader, IReceiptModelClient modelClient,
    string allowedBucket, TimeProvider clock, ILogger<ReceiptAnalysisHandler> logger)
{
    // AWSの3.75 MBを十進バイトとして扱い、制限を超えないようにする。
    public const int MaximumImageBytes = 3_750_000;
    private static readonly Regex ObjectKeyPattern = new(@"\Areceipts/[0-9a-f]{32}\.(jpg|png|webp)\z", RegexOptions.CultureInvariant);

    public async Task HandleAsync(ReceiptAnalysisEvent request, CancellationToken cancellationToken = default)
    {
        foreach (var record in request.Records)
        {
            if (!string.Equals(record.S3.Bucket.Name, allowedBucket, StringComparison.Ordinal))
            {
                logger.LogWarning("解析対象外 工程={Stage} ジョブID={JobId}", "バケット確認", (Guid?)null);
                continue;
            }
            var key = WebUtility.UrlDecode(record.S3.Object.Key);
            if (key is null || !ObjectKeyPattern.IsMatch(key)) continue;
            // DB例外は外部処理のcatchに入れず、Lambdaの再試行に委ねる。
            await using var db = await createDb(cancellationToken);
            var job = await db.ReceiptAnalysisJobs.AsNoTracking().SingleOrDefaultAsync(x => x.ObjectKey == key, cancellationToken);
            if (job is null)
            {
                logger.LogWarning("解析対象なし 工程={Stage} ジョブID={JobId}", "ジョブ確認", (Guid?)null);
                continue;
            }
            if (job.Status != ReceiptAnalysisStatuses.Pending) continue;
            var status = ReceiptAnalysisStatuses.Completed;
            var result = new ReceiptAnalysisResult(null, null, null, null);
            var stage = "画像取得";
            try
            {
                var image = await imageReader.ReadAsync(allowedBucket, key, cancellationToken);
                stage = "画像サイズ確認";
                if (image.Bytes.Length > MaximumImageBytes) throw new InvalidOperationException("画像サイズが上限を超えています。");
                stage = "モデル呼び出し";
                var text = await modelClient.AnalyzeAsync(image.Bytes, image.Format, cancellationToken);
                stage = "応答解析";
                result = ReceiptAnalysisResultParser.Parse(text);
            }
            catch (Exception exception)
            {
                status = ReceiptAnalysisStatuses.Failed;
                logger.LogWarning("解析失敗 工程={Stage} ジョブID={JobId} 例外種別={ExceptionType}", stage, job.Id, exception.GetType().Name);
            }
            // 待機中の行だけを原子的に更新し、並行イベントによる結果の上書きを防ぐ。
            await db.ReceiptAnalysisJobs.Where(x => x.Id == job.Id && x.Status == ReceiptAnalysisStatuses.Pending)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.Status, status)
                    .SetProperty(x => x.ReceiptDate, result.Date)
                    .SetProperty(x => x.TotalAmount, result.Amount)
                    .SetProperty(x => x.StoreName, result.StoreName)
                    .SetProperty(x => x.Category, result.Category)
                    .SetProperty(x => x.UpdatedAt, clock.GetUtcNow()), cancellationToken);
        }
    }
}
