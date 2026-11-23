using System.Data.Common;
using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Kakeibo.Api.Data;
using Kakeibo.Api.Endpoints;
using Kakeibo.Api.Services;
using Kakeibo.Api.Tests.Infrastructure;
using Kakeibo.MonthlyBatch;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Kakeibo.Api.Tests.MonthlyNotification;

public class MonthlyNotificationIntegrationTests : EntriesApiTestBase
{
    public MonthlyNotificationIntegrationTests(KakeiboApiTestFactory factory) : base(factory)
    {
        using var db = CreateDb();
        db.Database.ExecuteSqlRaw("TRUNCATE TABLE monthly_notification_deliveries");
    }

    private static MonthlyNotificationDeliveryStore CreateStore(KakeiboDbContext db) => new(db, TimeProvider.System);
    private static readonly DateOnly TargetMonth = new(2031, 1, 1);
    private static readonly MonthlyNotificationRequest ScheduledRequest = new("2031-02-01T00:10:00+09:00");
    private const string SensitiveError = "DBやSNSの秘密情報";
    [Fact]
    public async Task 別の実行でも同じ日本時間の対象月は送信せず別月は送信する()
    {
        var sender = new MonthlyNotificationTests.RecordingSender();
        foreach (var scheduledTime in new[] { "2031-02-01T00:10:00+09:00", "2031-01-31T15:20:00Z", "2031-03-01T00:10:00+09:00" })
        {
            await using var db = CreateDb();
            await new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(db), new MonthlyNotificationTests.RecordingLogger())
                .HandleAsync(new(scheduledTime));
        }
        Assert.Equal(new[] { "家計簿 月次集計 2031 年 1 月", "家計簿 月次集計 2031 年 2 月" }, sender.Messages.Select(m => m.Subject));
        await using var verification = CreateDb();
        var rows = await verification.MonthlyNotificationDeliveries.OrderBy(d => d.TargetMonth).ToListAsync();
        Assert.Equal(new[] { new DateOnly(2031, 1, 1), new DateOnly(2031, 2, 1) }, rows.Select(d => d.TargetMonth));
        Assert.All(rows, row => Assert.NotNull(row.AcceptedAt));
    }

    [Fact]
    public async Task 別接続の同時実行は一方だけ送信して両方正常終了する()
    {
        await using var first = CreateDb();
        await using var second = CreateDb();
        await first.Database.OpenConnectionAsync();
        await second.Database.OpenConnectionAsync();
        var bothReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var arrivals = 0;
        async Task<MonthlySummaryResponse> GetSummary(string month, CancellationToken cancellationToken)
        {
            // 両方の台帳参照が空の状態で終わってから確保に進ませる。
            if (Interlocked.Increment(ref arrivals) == 2)
            {
                bothReady.SetResult();
            }
            await bothReady.Task.WaitAsync(TimeSpan.FromSeconds(15), cancellationToken);
            return new(month, 0, 0, 0, []);
        }

        var firstSender = new MonthlyNotificationTests.RecordingSender();
        var secondSender = new MonthlyNotificationTests.RecordingSender();
        await Task.WhenAll(
            new MonthlyNotificationHandler(GetSummary, firstSender, CreateStore(first), new MonthlyNotificationTests.RecordingLogger())
                .HandleAsync(new("2031-02-01T00:10:00+09:00")),
            new MonthlyNotificationHandler(GetSummary, secondSender, CreateStore(second), new MonthlyNotificationTests.RecordingLogger())
                .HandleAsync(new("2031-02-01T00:10:00+09:00")));
        Assert.Single(firstSender.Messages.Concat(secondSender.Messages));
        await using var verification = CreateDb();
        var row = Assert.Single(await verification.MonthlyNotificationDeliveries.ToListAsync());
        Assert.Equal(new DateOnly(2031, 1, 1), row.TargetMonth);
        Assert.NotNull(row.AcceptedAt);
    }

    [Theory]
    [InlineData(2031, 1)]
    [InlineData(2031, 4)]
    [InlineData(2031, 2)]
    [InlineData(2032, 2)]
    [InlineData(2030, 12)]
    public async Task 月境界をAPIとメールと共有サービスで比較する(int year, int month)
    {
        var first = new DateOnly(year, month, 1);
        var last = first.AddMonths(1).AddDays(-1);
        foreach (var (date, amount) in new[] { (first.AddDays(-1), 999), (first, 20), (last, 33), (last.AddDays(1), 888) })
        {
            await CreateEntryAsync(EntryBody(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), "支出", amount, "外食費"));
            await CreateEntryAsync(EntryBody(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), "収入", amount * 2, "給与"));
        }
        await CreateEntryAsync(EntryBody(first.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), "支出", 27, "食費"));
        var key = first.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        var api = await Client.GetFromJsonAsync<MonthlySummaryResponse>($"/api/entries/summary?month={key}");
        Assert.NotNull(api);
        Assert.Equal(106, api.IncomeTotal);
        Assert.Equal(80, api.ExpenseTotal);
        Assert.Equal(26, api.Balance);
        Assert.Equal(new[] { new ExpenseCategoryBreakdown("外食費", 53, 66.3m), new ExpenseCategoryBreakdown("食費", 27, 33.8m) }, api.ExpenseBreakdown);
        await using var db = CreateDb();
        var direct = await new MonthlySummaryService(db).GetAsync(key);
        Assert.Equal(api.ExpenseBreakdown, direct.ExpenseBreakdown);
        var sender = new MonthlyNotificationTests.RecordingSender();
        await new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(db), new MonthlyNotificationTests.RecordingLogger())
            .HandleAsync(new(first.AddMonths(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "T00:10:00+09:00"));
        var message = Assert.Single(sender.Messages);
        Assert.Equal(MonthlyNotificationMessage.Create(api), message);
        Assert.Contains("外食費: 53 円（66.3%）", message.Body);
        Assert.Contains("食費: 27 円（33.8%）", message.Body);
    }

    [Fact]
    public async Task 同額カテゴリはOrdinal順でAPIとメールが一致する()
    {
        foreach (var category in new[] { "食費", "外食費" })
        {
            await CreateEntryAsync(EntryBody("2031-01-01", "支出", 10, category));
        }
        var api = (await Client.GetFromJsonAsync<MonthlySummaryResponse>("/api/entries/summary?month=2031-01"))!;
        Assert.Equal(new[] { "外食費", "食費" }, api.ExpenseBreakdown.Select(x => x.Category));
        await using var db = CreateDb();
        var sender = new MonthlyNotificationTests.RecordingSender();
        await new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(db), new MonthlyNotificationTests.RecordingLogger())
            .HandleAsync(new("2031-02-01T00:10:00+09:00"));
        Assert.Equal(MonthlyNotificationMessage.Create(api), Assert.Single(sender.Messages));
    }

    [Fact]
    public async Task ゼロ件でもAPIの空内訳と一致するメールを送る()
    {
        var api = (await Client.GetFromJsonAsync<MonthlySummaryResponse>("/api/entries/summary?month=2031-01"))!;
        Assert.Empty(api.ExpenseBreakdown);
        Assert.Equal(0, api.IncomeTotal);
        Assert.Equal(0, api.ExpenseTotal);
        Assert.Equal(0, api.Balance);
        await using var db = CreateDb();
        var sender = new MonthlyNotificationTests.RecordingSender();
        await new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(db), new MonthlyNotificationTests.RecordingLogger())
            .HandleAsync(new("2031-02-01T00:10:00+09:00"));
        Assert.Equal(MonthlyNotificationMessage.Create(api), Assert.Single(sender.Messages));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task 成功と送信失敗のどちらでも家計データは変えず書込みは台帳だけ(bool fail)
    {
        await CreateEntryAsync(EntryBody("2031-01-01", "支出", 50, "食費"));
        await using (var setup = CreateDb())
        {
            setup.Subscriptions.Add(new() { Name = "テスト", Amount = 100, Memo = "保存されるメモ" });
            await setup.SaveChangesAsync();
        }
        var before = await SnapshotAsync();
        var monitor = new CommandMonitor();
        await using var db = CreateDb(monitor);
        var sender = new MonthlyNotificationTests.RecordingSender { Failure = fail ? new InvalidOperationException("送信障害") : null };
        var task = new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(db), new MonthlyNotificationTests.RecordingLogger())
            .HandleAsync(new("2031-02-01T00:10:00+09:00"));
        if (fail)
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        }
        else
        {
            await task;
        }
        Assert.Equal(before, await SnapshotAsync());
        Assert.Equal(fail ? 3 : 4, monitor.Commands.Count);
        Assert.StartsWith("SELECT", monitor.Commands[0], StringComparison.OrdinalIgnoreCase);
        Assert.Contains("FROM monthly_notification_deliveries", monitor.Commands[0]);
        Assert.StartsWith("SELECT", monitor.Commands[1], StringComparison.OrdinalIgnoreCase);
        Assert.Contains("FROM entries", monitor.Commands[1]);
        Assert.StartsWith("INSERT INTO monthly_notification_deliveries ", monitor.Commands[2], StringComparison.OrdinalIgnoreCase);
        if (!fail)
        {
            Assert.StartsWith("UPDATE monthly_notification_deliveries ", monitor.Commands[3], StringComparison.OrdinalIgnoreCase);
        }
        Assert.Empty(db.ChangeTracker.Entries());
    }

    [Fact]
    public async Task 集計障害は台帳に残らず次回は送信できる()
    {
        await using var db = CreateDb(new FailingRead());
        var sender = new MonthlyNotificationTests.RecordingSender();
        var logger = new MonthlyNotificationTests.RecordingLogger();
        await using var ledgerDb = CreateDb();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(ledgerDb), logger)
                .HandleAsync(new("2031-02-01T00:10:00+09:00")));
        Assert.Empty(sender.Messages);
        Assert.Contains(logger.Messages, message => message.Contains("集計"));
        Assert.All(logger.Messages, message => Assert.DoesNotContain(SensitiveError, message));
        await using var retry = CreateDb();
        Assert.Empty(await retry.MonthlyNotificationDeliveries.ToListAsync());
        await new MonthlyNotificationHandler(new MonthlySummaryService(retry).GetAsync, sender, CreateStore(retry), logger)
            .HandleAsync(ScheduledRequest);
        Assert.Single(sender.Messages);
        Assert.NotNull((await retry.MonthlyNotificationDeliveries.SingleAsync()).AcceptedAt);
    }

    [Theory]
    [InlineData(true, "台帳参照")]
    [InlineData(false, "送信権確保")]
    public async Task 台帳参照または確保障害は送信せず安全に記録する(bool failRead, string stage)
    {
        await using var ledger = failRead ? CreateDb(new FailingRead()) : CreateDb(new FailingWrite("INSERT"));
        await using var summary = CreateDb();
        var sender = new MonthlyNotificationTests.RecordingSender();
        var logger = new MonthlyNotificationTests.RecordingLogger();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new MonthlyNotificationHandler(new MonthlySummaryService(summary).GetAsync, sender, CreateStore(ledger), logger)
                .HandleAsync(ScheduledRequest));
        Assert.Empty(sender.Messages);
        Assert.Contains(logger.Messages, m => m.Contains(stage) && m.Contains("2031-01"));
        Assert.All(logger.Messages, m => Assert.DoesNotContain(SensitiveError, m));
        Assert.Empty(await summary.MonthlyNotificationDeliveries.ToListAsync());
    }

    [Fact]
    public async Task 確保のコミット応答を失うと送信せず確保行も保持する()
    {
        await using var db = CreateDb(new LostClaimResponse());
        var sender = new MonthlyNotificationTests.RecordingSender();
        var logger = new MonthlyNotificationTests.RecordingLogger();
        await Assert.ThrowsAsync<TimeoutException>(() =>
            new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(db), logger)
                .HandleAsync(ScheduledRequest));
        Assert.Contains(logger.Messages, m => m.Contains("送信権確保") && m.Contains("2031-01"));
        Assert.All(logger.Messages, m => Assert.DoesNotContain(SensitiveError, m));
        await AssertSkippedAsync(sender, "結果不明");
        Assert.Empty(sender.Messages);
    }

    [Theory]
    [InlineData(true, "送信")]
    [InlineData(false, "受理記録")]
    public async Task SNS受理後の応答欠落と台帳更新障害は再送しない(bool loseResponse, string stage)
    {
        await using var db = loseResponse ? CreateDb() : CreateDb(new FailingWrite("UPDATE"));
        using var sns = new MonthlyNotificationTests.RecordingSns
        {
            Respond = async () =>
            {
                // SNS受理時点で、別接続から確保行が見える（コミット済み）。
                await using var observer = CreateDb();
                var claim = await observer.MonthlyNotificationDeliveries.SingleAsync();
                Assert.Equal(TargetMonth, claim.TargetMonth);
                Assert.Null(claim.AcceptedAt);
                return loseResponse ? throw new TimeoutException(SensitiveError) : new();
            },
        };
        var sender = new SnsMonthlyNotificationSender(sns, "arn:aws:sns:ap-northeast-1:123456789012:test");
        var logger = new MonthlyNotificationTests.RecordingLogger();
        var task = new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, CreateStore(db), logger)
            .HandleAsync(ScheduledRequest);
        await Assert.ThrowsAsync(loseResponse ? typeof(TimeoutException) : typeof(InvalidOperationException), () => task);
        Assert.Contains(logger.Messages, m => m.Contains(stage) && m.Contains("2031-01"));
        await AssertSkippedAsync(sender, "結果不明");
        Assert.Single(sns.Requests);
        await using var verification = CreateDb();
        Assert.Null((await verification.MonthlyNotificationDeliveries.SingleAsync()).AcceptedAt);
        Assert.All(logger.Messages, m => Assert.DoesNotContain(SensitiveError, m));
    }

    [Theory]
    [InlineData(false, "結果不明")]
    [InlineData(true, "受理済み")]
    public async Task 確保直後に停止した月と受理済みの月を区別して再送しない(bool accepted, string result)
    {
        await using (var db = CreateDb())
        {
            var store = CreateStore(db);
            Assert.True(await store.TryClaimAsync(TargetMonth, default));
            if (accepted)
            {
                await store.MarkAcceptedAsync(TargetMonth, default);
            }
        }
        var sender = new MonthlyNotificationTests.RecordingSender();
        await AssertSkippedAsync(sender, result);
        Assert.Empty(sender.Messages);
    }

    private async Task AssertSkippedAsync(IMonthlyNotificationSender sender, string result)
    {
        await using var retry = CreateDb();
        var logger = new MonthlyNotificationTests.RecordingLogger();
        await new MonthlyNotificationHandler((_, _) => throw new InvalidOperationException("集計してはいけません。"),
            sender, CreateStore(retry), logger).HandleAsync(ScheduledRequest);
        Assert.Contains(logger.Messages, m => m.Contains(result) && m.Contains("2031-01"));
        Assert.All(logger.Messages, m => Assert.DoesNotContain(SensitiveError, m));
    }

    [Fact]
    public async Task 既存DBに冪等SQLを二度適用しても家計データと台帳を保持する()
    {
        // 他のテストと共有しないDBを移行前の状態に戻して検証する。
        await using var factory = new KakeiboApiTestFactory();
        using var client = factory.CreateClient();
        var options = new DbContextOptionsBuilder<KakeiboDbContext>().UseNpgsql(factory.TestConnectionString).Options;
        await using var db = new KakeiboDbContext(options);
        const string previousMigration = "20261111054542_AddReceiptAnalysisJobs";
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(previousMigration);
        db.Entries.Add(new() { Date = TargetMonth, Type = "支出", Category = "食費", Amount = 50, Memo = "移行前の記録" });
        await db.SaveChangesAsync();

        var script = migrator.GenerateScript(previousMigration, options: MigrationsSqlGenerationOptions.Idempotent);
        await db.Database.ExecuteSqlRawAsync(script);
        var store = CreateStore(db);
        Assert.True(await store.TryClaimAsync(TargetMonth, default));
        await db.Database.ExecuteSqlRawAsync(script);

        Assert.NotNull(await store.FindAsync(TargetMonth, default));
        var entry = await db.Entries.AsNoTracking().SingleAsync();
        Assert.Equal("移行前の記録", entry.Memo);
    }

    private sealed class FailingWrite(string operation) : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
            => command.CommandText.TrimStart().StartsWith(operation, StringComparison.OrdinalIgnoreCase)
                ? throw new InvalidOperationException(SensitiveError)
                : ValueTask.FromResult(result);
    }

    private sealed class LostClaimResponse : DbCommandInterceptor
    {
        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken cancellationToken = default)
            => command.CommandText.TrimStart().StartsWith("INSERT", StringComparison.OrdinalIgnoreCase)
                ? throw new TimeoutException(SensitiveError)
                : ValueTask.FromResult(result);
    }

    private sealed class FailingRead : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException(SensitiveError);
    }

    private KakeiboDbContext CreateDb(DbCommandInterceptor? interceptor = null)
    {
        var options = new DbContextOptionsBuilder<KakeiboDbContext>().UseNpgsql(Factory.TestConnectionString);
        if (interceptor is not null)
        {
            options.AddInterceptors(interceptor);
        }
        return new(options.Options);
    }

    private async Task<string> SnapshotAsync()
    {
        await using var db = CreateDb();
        return JsonSerializer.Serialize(new
        {
            Entries = await db.Entries.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
            Subscriptions = await db.Subscriptions.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
        });
    }

    private sealed class CommandMonitor : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
            => Record(command, result);

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
            => Record(command, result);

        public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<object> result, CancellationToken cancellationToken = default)
            => Record(command, result);

        private ValueTask<InterceptionResult<T>> Record<T>(DbCommand command, InterceptionResult<T> result)
        {
            Commands.Add(command.CommandText.TrimStart());
            return ValueTask.FromResult(result);
        }
    }
}
