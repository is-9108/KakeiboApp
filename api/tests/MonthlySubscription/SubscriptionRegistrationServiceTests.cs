using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Services;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

namespace Kakeibo.Api.Tests.MonthlySubscription;

public class SubscriptionRegistrationServiceTests : IAsyncLifetime
{
    private readonly KakeiboApiTestFactory _factory = new();
    private HttpClient _client = null!;
    private static readonly DateOnly Month = new(2031, 2, 1);

    // 各テストで専用DBを作り、並列実行でも他のケースとデータを共有しない。
    public Task InitializeAsync()
    {
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Authorization = _factory.CreateBearerHeader();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    [Fact]
    public async Task 同名を含む実行時点の全件を名前と金額で登録し後から追加した分は含まない()
    {
        var subscriptions = await SeedAsync("音楽", "音楽", new string('名', 100));
        var result = await RegisterAsync(Month);
        Assert.Equal(3, result.RegisteredCount);
        Assert.Equal(0, result.SkippedCount);
        await SeedAsync("後から追加");
        await using var db = CreateDb();
        var entries = await db.Entries.ToListAsync();
        Assert.Equal(3, entries.Count);
        var registrations = await db.SubscriptionRegistrations.ToListAsync();
        Assert.Equal(3, registrations.Count);
        foreach (var subscription in subscriptions)
        {
            var registration = Assert.Single(registrations, x => x.SubscriptionId == subscription.Id);
            Assert.Equal(Month, registration.TargetMonth);
            var entry = Assert.Single(entries, x => x.Id == registration.EntryId);
            Assert.Equal(Month, entry.Date);
            Assert.Equal("支出", entry.Type);
            Assert.Equal("サブスク", entry.Category);
            Assert.Equal(subscription.Amount, entry.Amount);
            Assert.Equal(subscription.Name, entry.Memo);
        }
    }

    [Fact]
    public async Task 同月の二回目と三回目は全件スキップし翌月は別登録する()
    {
        await SeedAsync("音楽", "動画", "本");
        Assert.Equal(3, (await RegisterAsync(Month)).RegisteredCount);
        for (var i = 0; i < 2; i++)
        {
            var result = await RegisterAsync(Month);
            Assert.Equal(0, result.RegisteredCount);
            Assert.Equal(3, result.SkippedCount);
        }
        await using (var db = CreateDb())
        {
            Assert.Equal(3, await db.Entries.CountAsync());
            Assert.Equal(3, await db.SubscriptionRegistrations.CountAsync());
        }
        var next = await RegisterAsync(Month.AddMonths(1));
        Assert.Equal(3, next.RegisteredCount);
        Assert.Equal(0, next.SkippedCount);
        await using var verify = CreateDb();
        Assert.Equal(3, await verify.Entries.CountAsync(x => x.Date == Month));
        Assert.Equal(3, await verify.Entries.CountAsync(x => x.Date == Month.AddMonths(1)));
        Assert.Equal(6, await verify.SubscriptionRegistrations.CountAsync());
    }

    [Fact]
    public async Task 同月の同時実行は例外も二重登録も発生しない()
    {
        await SeedAsync("音楽", "動画", "本");
        // 別接続の処理を同じゲートから開始する。
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<SubscriptionRegistrationResult> RunAsync()
        {
            await using var db = CreateDb();
            await gate.Task;
            return await new SubscriptionRegistrationService(db).RegisterAsync(Month);
        }
        var first = RunAsync();
        var second = RunAsync();
        gate.SetResult();
        var results = await Task.WhenAll(first, second);
        Assert.Equal(3, results.Sum(x => x.RegisteredCount));
        Assert.Equal(3, results.Sum(x => x.SkippedCount));
        await using var verify = CreateDb();
        Assert.Equal(3, await verify.Entries.CountAsync());
        Assert.Equal(3, await verify.SubscriptionRegistrations.CountAsync());
        Assert.Equal(3, await verify.SubscriptionRegistrations.Select(x => x.EntryId).Distinct().CountAsync());
    }

    [Fact]
    public async Task ゼロ件は収支も台帳も作らず正常終了する()
    {
        var result = await RegisterAsync(Month);
        Assert.Equal(0, result.RegisteredCount);
        Assert.Equal(0, result.SkippedCount);
        await using var db = CreateDb();
        Assert.Empty(await db.Entries.ToListAsync());
        Assert.Empty(await db.SubscriptionRegistrations.ToListAsync());
    }

    [Fact]
    public async Task 登録収支を通常APIで取得編集削除でき削除後の再実行でも復活しない()
    {
        await SeedAsync("音楽");
        await RegisterAsync(Month);
        var entry = Assert.Single((await _client.GetFromJsonAsync<Entry[]>("/api/entries?month=2031-02"))!);
        var response = await _client.PutAsJsonAsync($"/api/entries/{entry.Id}", new
        {
            date = "2031-02-02",
            type = "支出",
            category = "食費",
            amount = 2500,
            memo = "編集済み",
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = Assert.Single((await _client.GetFromJsonAsync<Entry[]>("/api/entries?month=2031-02"))!);
        Assert.Equal(entry.Id, updated.Id);
        Assert.Equal(new DateOnly(2031, 2, 2), updated.Date);
        Assert.Equal("支出", updated.Type);
        Assert.Equal("食費", updated.Category);
        Assert.Equal(2500, updated.Amount);
        Assert.Equal("編集済み", updated.Memo);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/entries/{entry.Id}")).StatusCode);
        var result = await RegisterAsync(Month);
        Assert.Equal(0, result.RegisteredCount);
        Assert.Equal(1, result.SkippedCount);
        Assert.Empty((await _client.GetFromJsonAsync<Entry[]>("/api/entries?month=2031-02"))!);
        await using var db = CreateDb();
        Assert.Equal(entry.Id, (await db.SubscriptionRegistrations.SingleAsync()).EntryId);
    }

    [Fact]
    public async Task サブスクを編集削除しても登録収支と台帳は変わらず再実行でも増えない()
    {
        var subscription = Assert.Single(await SeedAsync("音楽"));
        await RegisterAsync(Month);
        var before = await _client.GetStringAsync("/api/entries?month=2031-02");
        Assert.Equal(HttpStatusCode.OK, (await _client.PutAsJsonAsync($"/api/subscriptions/{subscription.Id}",
            new { name = "変更後", amount = 9999, memo = "変更メモ" })).StatusCode);
        Assert.Equal(before, await _client.GetStringAsync("/api/entries?month=2031-02"));
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/subscriptions/{subscription.Id}")).StatusCode);
        Assert.Equal(before, await _client.GetStringAsync("/api/entries?month=2031-02"));
        Assert.Equal(0, (await RegisterAsync(Month)).RegisteredCount);
        Assert.Equal(before, await _client.GetStringAsync("/api/entries?month=2031-02"));
        await using var db = CreateDb();
        Assert.Equal(subscription.Id, (await db.SubscriptionRegistrations.SingleAsync()).SubscriptionId);
    }

    [Fact]
    public async Task 台帳の同一サブスク同一月の直接挿入をDBが拒否する()
    {
        await SeedAsync("音楽");
        await RegisterAsync(Month);
        await using var db = CreateDb();
        var saved = await db.SubscriptionRegistrations.AsNoTracking().SingleAsync();
        db.SubscriptionRegistrations.Add(new SubscriptionRegistration
        {
            SubscriptionId = saved.SubscriptionId,
            TargetMonth = saved.TargetMonth,
            EntryId = saved.EntryId,
        });
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(exception.InnerException).SqlState);
    }

    [Fact]
    public async Task 二件目の失敗で収支も台帳も全件ロールバックし障害除去後は全件登録できる()
    {
        await SeedAsync("音楽", "動画", "本");
        var failure = new FailSecondEntryInsert();
        await using (var db = CreateDb(failure))
        {
            await Assert.ThrowsAnyAsync<Exception>(() => new SubscriptionRegistrationService(db).RegisterAsync(Month));
        }
        Assert.True(failure.Injected, "二件目の収支INSERTで障害が注入される必要があります。");
        await using (var verify = CreateDb())
        {
            Assert.Empty(await verify.Entries.ToListAsync());
            Assert.Empty(await verify.SubscriptionRegistrations.ToListAsync());
            Assert.Equal(3, await verify.Subscriptions.CountAsync());
        }
        var result = await RegisterAsync(Month);
        Assert.Equal(3, result.RegisteredCount);
        Assert.Equal(0, result.SkippedCount);
        await using var final = CreateDb();
        Assert.Equal(3, await final.Entries.CountAsync());
        Assert.Equal(3, await final.SubscriptionRegistrations.CountAsync());
    }

    private KakeiboDbContext CreateDb(DbCommandInterceptor? interceptor = null)
    {
        // バッチ化で一つのコマンドに複数INSERTが入るのを避け、二件目を確実に検出する。
        var options = new DbContextOptionsBuilder<KakeiboDbContext>()
            .UseNpgsql(_factory.TestConnectionString, postgres => postgres.MaxBatchSize(1));
        if (interceptor is not null) options.AddInterceptors(interceptor);
        return new(options.Options);
    }

    private async Task<Subscription[]> SeedAsync(params string[] names)
    {
        await using var db = CreateDb();
        var subscriptions = names.Select((name, i) => new Subscription
        {
            Name = name,
            Amount = 1000 + i,
            Memo = "収支に転記しないサブスクメモ",
        }).ToArray();
        db.Subscriptions.AddRange(subscriptions);
        await db.SaveChangesAsync();
        return subscriptions;
    }

    private async Task<SubscriptionRegistrationResult> RegisterAsync(DateOnly month)
    {
        await using var db = CreateDb();
        return await new SubscriptionRegistrationService(db).RegisterAsync(month);
    }

    private sealed class FailSecondEntryInsert : DbCommandInterceptor
    {
        private int _count;
        public bool Injected { get; private set; }
        private void Check(DbCommand command)
        {
            if (System.Text.RegularExpressions.Regex.IsMatch(command.CommandText,
                "INSERT\\s+INTO\\s+\"?entries\"?", System.Text.RegularExpressions.RegexOptions.IgnoreCase) && ++_count == 2)
            {
                Injected = true;
                throw new InvalidOperationException("二件目の登録障害");
            }
        }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Check(command);
            return ValueTask.FromResult(result);
        }
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            Check(command);
            return ValueTask.FromResult(result);
        }
        public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<object> result, CancellationToken cancellationToken = default)
        {
            Check(command);
            return ValueTask.FromResult(result);
        }
    }
}
