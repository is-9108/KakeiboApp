using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Kakeibo.MonthlyBatch;

public sealed class StaleReceiptJobHandler(
    Func<CancellationToken, Task<KakeiboDbContext>> createDb,
    TimeProvider clock,
    TimeSpan threshold,
    ILogger<StaleReceiptJobHandler> logger)
{
    public static readonly TimeSpan DefaultThreshold = TimeSpan.FromMinutes(30);

    public async Task HandleAsync(CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow();
        var cutoff = now - threshold;
        await using var db = await createDb(cancellationToken);
        var pending = db.ReceiptAnalysisJobs.Where(job =>
            job.Status == ReceiptAnalysisStatuses.Pending && job.CreatedAt < cutoff);
        var staleJobs = await pending.AsNoTracking()
            .OrderBy(job => job.CreatedAt)
            .Select(job => new { job.Id, job.CreatedAt })
            .ToListAsync(cancellationToken);
        if (staleJobs.Count == 0)
        {
            logger.LogInformation("棚卸し対象なし");
            return;
        }

        logger.LogWarning("解析ジョブ棚卸し 検出件数={DetectedCount} 閾値分={ThresholdMinutes} 最古の経過分={OldestAgeMinutes}",
            staleJobs.Count, threshold.TotalMinutes, (now - staleJobs[0].CreatedAt).TotalMinutes);
        foreach (var job in staleJobs)
        {
            logger.LogWarning("滞留解析ジョブ ジョブID={JobId} 経過分={AgeMinutes}",
                job.Id, (now - job.CreatedAt).TotalMinutes);
        }

        var ids = staleJobs.Select(job => job.Id).ToArray();
        var updatedAt = clock.GetUtcNow();
        var updatedCount = await pending.Where(job => ids.Contains(job.Id))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(job => job.Status, ReceiptAnalysisStatuses.Failed)
                .SetProperty(job => job.UpdatedAt, updatedAt), cancellationToken);
        logger.LogInformation("解析ジョブ棚卸し完了 検出件数={DetectedCount} 更新件数={UpdatedCount}", staleJobs.Count, updatedCount);
    }
}
