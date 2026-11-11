using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Kakeibo.Api.Tests.Data;

public class ReceiptAnalysisJobMigrationTests(KakeiboApiTestFactory factory) : IClassFixture<KakeiboApiTestFactory>
{
    [Fact]
    public async Task 旧スキーマの収支を保持して解析ジョブとキーの一意制約を追加する()
    {
        using var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var migrator = db.GetService<IMigrator>();
        var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddSubscriptionRegistrations", StringComparison.Ordinal));
        await migrator.MigrateAsync(previous);
        var entry = new Entry { Date = new DateOnly(2026, 11, 1), Type = "支出", Category = "食費", Amount = 100, Memo = "移行前" };
        db.Entries.Add(entry);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        await migrator.MigrateAsync();
        var saved = await db.Entries.SingleAsync(x => x.Id == entry.Id);
        Assert.Equal(entry.Memo, saved.Memo);
        Assert.Equal(entry.Amount, saved.Amount);
        Assert.Empty(await db.ReceiptAnalysisJobs.ToListAsync());
        await using var connection = new NpgsqlConnection(factory.TestConnectionString);
        await connection.OpenAsync();
        async Task InsertAsync()
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO receipt_analysis_jobs (id, object_key, status, receipt_date, total_amount, store_name, category, created_at, updated_at) VALUES (@id, 'receipts/test.jpg', '待機中', NULL, NULL, NULL, NULL, now(), now())";
            command.Parameters.AddWithValue("id", Guid.NewGuid());
            await command.ExecuteNonQueryAsync();
        }
        await InsertAsync();
        var error = await Assert.ThrowsAsync<PostgresException>(InsertAsync);
        Assert.Equal(PostgresErrorCodes.UniqueViolation, error.SqlState);
    }
}
