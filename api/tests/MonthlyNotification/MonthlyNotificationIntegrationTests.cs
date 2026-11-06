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

namespace Kakeibo.Api.Tests.MonthlyNotification;

public class MonthlyNotificationIntegrationTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
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
        await new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, new MonthlyNotificationTests.RecordingLogger())
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
        await new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, new MonthlyNotificationTests.RecordingLogger())
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
        await new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, new MonthlyNotificationTests.RecordingLogger())
            .HandleAsync(new("2031-02-01T00:10:00+09:00"));
        Assert.Equal(MonthlyNotificationMessage.Create(api), Assert.Single(sender.Messages));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task 成功と送信失敗のどちらでも全データとSQLが読取専用(bool fail)
    {
        await CreateEntryAsync(EntryBody("2031-01-01", "支出", 50, "食費"));
        await using (var setup = CreateDb())
        {
            setup.Subscriptions.Add(new() { Name = "テスト", Amount = 100, Memo = "保存されるメモ" });
            await setup.SaveChangesAsync();
        }
        var before = await SnapshotAsync();
        var monitor = new ReadOnlyMonitor();
        await using var db = CreateDb(monitor);
        var sender = new MonthlyNotificationTests.RecordingSender { Failure = fail ? new InvalidOperationException("送信障害") : null };
        var task = new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, new MonthlyNotificationTests.RecordingLogger())
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
        Assert.Single(monitor.Commands);
        Assert.All(monitor.Commands, sql => Assert.StartsWith("SELECT", sql.TrimStart(), StringComparison.OrdinalIgnoreCase));
        Assert.Empty(db.ChangeTracker.Entries());
    }

    [Fact]
    public async Task DB取得障害は送信せず安全なエラーログを残す()
    {
        await using var db = CreateDb(new FailingRead());
        var sender = new MonthlyNotificationTests.RecordingSender();
        var logger = new MonthlyNotificationTests.RecordingLogger();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new MonthlyNotificationHandler(new MonthlySummaryService(db).GetAsync, sender, logger)
                .HandleAsync(new("2031-02-01T00:10:00+09:00")));
        Assert.Empty(sender.Messages);
        Assert.Contains(logger.Messages, message => message.Contains("集計"));
        Assert.All(logger.Messages, message => Assert.DoesNotContain("DB障害の秘密情報", message));
    }

    private sealed class FailingRead : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("DB障害の秘密情報");
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

    private sealed class ReadOnlyMonitor : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            throw new InvalidOperationException("更新SQLは禁止です。");
        }
        public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<object> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            throw new InvalidOperationException("集計読取以外は禁止です。");
        }
    }
}
