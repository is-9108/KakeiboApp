using Kakeibo.Api.Data;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace Kakeibo.Api.Tests.Data;

/// <summary>サブスク追加と取り消しが既存収支を保つことを実DBで検証する。</summary>
public class AddSubscriptionsMigrationTests(KakeiboApiTestFactory factory) : IClassFixture<KakeiboApiTestFactory>
{
    [Fact]
    public async Task テーブルの追加と取り消しで既存収支の値と件数が変わらない()
    {
        using var client = factory.CreateClient();
        await using var db = new KakeiboDbContext(new DbContextOptionsBuilder<KakeiboDbContext>()
            .UseNpgsql(factory.TestConnectionString).Options);
        var migrator = db.GetService<IMigrator>();
        var entriesMigration = db.Database.GetMigrations().Single(m => m.EndsWith("_AddEntries"));
        await migrator.MigrateAsync(entriesMigration);
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO entries (date, type, amount, category, memo) VALUES
            ('2031-01-01', '支出', 100, '食費', '元のメモ'),
            ('2031-01-02', '収入', 200, '給与', '給与メモ')
            """);
        var original = await ReadEntries(db);
        await migrator.MigrateAsync();
        Assert.Equal(original, await ReadEntries(db));
        Assert.Equal(0, await Scalar("SELECT COUNT(*) FROM subscriptions"));
        await migrator.MigrateAsync(entriesMigration);
        Assert.Equal(original, await ReadEntries(db));
        Assert.Equal(0, await Scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'subscriptions'"));
    }

    private static async Task<string[]> ReadEntries(KakeiboDbContext db) =>
        await db.Entries.AsNoTracking().OrderBy(e => e.Id)
            .Select(e => $"{e.Id}|{e.Date}|{e.Type}|{e.Amount}|{e.Category}|{e.Memo}").ToArrayAsync();

    private async Task<long> Scalar(string sql)
    {
        await using var connection = new NpgsqlConnection(factory.TestConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }
}
