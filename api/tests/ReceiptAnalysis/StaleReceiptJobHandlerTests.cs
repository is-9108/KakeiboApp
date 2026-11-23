using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Tests.Infrastructure;
using Kakeibo.MonthlyBatch;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Kakeibo.Api.Tests.ReceiptAnalysis;

public class StaleReceiptJobHandlerTests(KakeiboApiTestFactory factory) : IClassFixture<KakeiboApiTestFactory>
{
    private static readonly DateTimeOffset Now = new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero);

    private KakeiboDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<KakeiboDbContext>().UseNpgsql(factory.TestConnectionString).Options);

    private async Task ResetJobsAsync()
    {
        using var client = factory.CreateClient();
        await using var db = CreateDb();
        await db.ReceiptAnalysisJobs.ExecuteDeleteAsync();
    }

    private async Task<ReceiptAnalysisJob> SeedAsync(DateTimeOffset createdAt, string status = ReceiptAnalysisStatuses.Pending)
    {
        await using var db = CreateDb();
        var job = new ReceiptAnalysisJob
        {
            Id = Guid.NewGuid(),
            ObjectKey = $"receipts/{Guid.NewGuid():N}.jpg",
            Status = status,
            CreatedAt = createdAt,
            UpdatedAt = createdAt,
            ReceiptDate = new DateOnly(2026, 11, 23),
            TotalAmount = 1234,
            StoreName = "試験店舗",
            Category = "食費",
        };
        db.ReceiptAnalysisJobs.Add(job);
        await db.SaveChangesAsync();
        return job;
    }

    private StaleReceiptJobHandler Handler(Logger logger, TimeSpan? threshold = null) =>
        new(_ => Task.FromResult(CreateDb()), new Clock(), threshold ?? StaleReceiptJobHandler.DefaultThreshold, logger);

    [Fact]
    public async Task 閾値を超えた待機中の行だけを失敗にして対象を記録する()
    {
        await ResetJobsAsync();
        var cutoff = Now.AddMinutes(-30);
        var oldest = await SeedAsync(Now.AddMinutes(-45));
        var over = await SeedAsync(cutoff.AddSeconds(-1));
        var exact = await SeedAsync(cutoff);
        var newer = await SeedAsync(cutoff.AddSeconds(1));
        var completed = await SeedAsync(cutoff.AddHours(-1), ReceiptAnalysisStatuses.Completed);
        var failed = await SeedAsync(cutoff.AddHours(-1), ReceiptAnalysisStatuses.Failed);
        var logger = new Logger();

        await Handler(logger).HandleAsync();

        await using var db = CreateDb();
        foreach (var job in new[] { oldest, over, exact, newer, completed, failed })
        {
            var actual = await db.ReceiptAnalysisJobs.SingleAsync(x => x.Id == job.Id);
            var changed = job == oldest || job == over;
            Assert.Equal(changed ? ReceiptAnalysisStatuses.Failed : job.Status, actual.Status);
            Assert.Equal(changed ? Now : job.UpdatedAt, actual.UpdatedAt);
            Assert.Equal(job.CreatedAt, actual.CreatedAt);
            Assert.Equal(job.ObjectKey, actual.ObjectKey);
            Assert.Equal(job.ReceiptDate, actual.ReceiptDate);
            Assert.Equal(job.TotalAmount, actual.TotalAmount);
            Assert.Equal(job.StoreName, actual.StoreName);
            Assert.Equal(job.Category, actual.Category);
            Assert.All(logger.Entries, entry => Assert.DoesNotContain(job.ObjectKey, entry.Text));
        }

        Assert.Collection(logger.Entries.Where(entry => entry.Level == LogLevel.Warning),
            summary =>
            {
                Assert.Equal(2, summary.Properties["DetectedCount"]);
                Assert.Equal(30d, summary.Properties["ThresholdMinutes"]);
                Assert.Equal(45d, summary.Properties["OldestAgeMinutes"]);
            },
            first =>
            {
                Assert.Equal(oldest.Id, first.Properties["JobId"]);
                Assert.Equal(45d, first.Properties["AgeMinutes"]);
            },
            second =>
            {
                Assert.Equal(over.Id, second.Properties["JobId"]);
                Assert.Equal((Now - over.CreatedAt).TotalMinutes, second.Properties["AgeMinutes"]);
            });
        var result = Assert.Single(logger.Entries, entry => entry.Level == LogLevel.Information);
        Assert.Equal(2, result.Properties["DetectedCount"]);
        Assert.Equal(2, result.Properties["UpdatedCount"]);
        Assert.All(logger.Entries, entry => Assert.DoesNotContain("object_key", entry.Text));
    }

    [Fact]
    public async Task 閾値を変更すると判定境界が変わる()
    {
        await ResetJobsAsync();
        var exact = await SeedAsync(Now.AddHours(-1));
        var over = await SeedAsync(Now.AddHours(-1).AddSeconds(-1));

        Assert.Equal(TimeSpan.FromMinutes(30), StaleReceiptJobHandler.DefaultThreshold);
        await Handler(new Logger(), TimeSpan.FromHours(1)).HandleAsync();

        await using var db = CreateDb();
        Assert.Equal(ReceiptAnalysisStatuses.Pending, (await db.ReceiptAnalysisJobs.SingleAsync(x => x.Id == exact.Id)).Status);
        Assert.Equal(ReceiptAnalysisStatuses.Failed, (await db.ReceiptAnalysisJobs.SingleAsync(x => x.Id == over.Id)).Status);
    }

    [Fact]
    public async Task 対象がなければ情報ログを残す()
    {
        await ResetJobsAsync();
        var logger = new Logger();
        var handler = Handler(logger);

        await handler.HandleAsync();
        var empty = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Information, empty.Level);
        Assert.Contains("棚卸し対象なし", empty.Text);

        await SeedAsync(Now);
        logger.Entries.Clear();
        await handler.HandleAsync();
        var current = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Information, current.Level);
        Assert.Contains("棚卸し対象なし", current.Text);
    }

    [Fact]
    public async Task DB取得時の例外を呼び出し元に伝播する()
    {
        var failure = new InvalidOperationException("DB取得エラー");
        var handler = new StaleReceiptJobHandler(_ => throw failure, new Clock(),
            StaleReceiptJobHandler.DefaultThreshold, new Logger());

        Assert.Same(failure, await Assert.ThrowsAsync<InvalidOperationException>(() => handler.HandleAsync()));
    }

    private sealed class Clock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class Logger : ILogger<StaleReceiptJobHandler>
    {
        public List<(LogLevel Level, string Text, Dictionary<string, object?> Properties)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => true;

        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((level, formatter(state, exception),
                ((IEnumerable<KeyValuePair<string, object?>>)(object)state!).ToDictionary(x => x.Key, x => x.Value)));
    }
}
