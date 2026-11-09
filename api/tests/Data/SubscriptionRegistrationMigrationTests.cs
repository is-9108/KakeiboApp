using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Kakeibo.Api.Tests.Data;

public class SubscriptionRegistrationMigrationTests(KakeiboApiTestFactory factory) : IClassFixture<KakeiboApiTestFactory>
{
    [Fact]
    public async Task サブスク導入済みの旧スキーマから既存データを保持して登録台帳と複合ユニーク制約を追加する()
    {
        using var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261104123318_AddSubscriptions");
        var entry = new Entry
        {
            Date = new DateOnly(2031, 1, 15), Type = "支出", Category = "食費", Amount = 1500, Memo = "既存収支",
        };
        var subscription = new Subscription { Name = "既存サブスク", Amount = 2000, Memo = "既存メモ" };
        db.Entries.Add(entry);
        db.Subscriptions.Add(subscription);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        await migrator.MigrateAsync();
        var savedEntry = await db.Entries.SingleAsync();
        Assert.Equal(entry.Id, savedEntry.Id);
        Assert.Equal(entry.Date, savedEntry.Date);
        Assert.Equal(entry.Type, savedEntry.Type);
        Assert.Equal(entry.Category, savedEntry.Category);
        Assert.Equal(entry.Amount, savedEntry.Amount);
        Assert.Equal(entry.Memo, savedEntry.Memo);
        var savedSubscription = await db.Subscriptions.SingleAsync();
        Assert.Equal(subscription.Id, savedSubscription.Id);
        Assert.Equal(subscription.Name, savedSubscription.Name);
        Assert.Equal(subscription.Amount, savedSubscription.Amount);
        Assert.Equal(subscription.Memo, savedSubscription.Memo);
        Assert.Empty(await db.SubscriptionRegistrations.ToListAsync());

        // SQLで実テーブル・列とDB制約を検証し、モデル上だけの制約では成功しないようにする。
        await using var connection = new NpgsqlConnection(factory.TestConnectionString);
        await connection.OpenAsync();
        async Task InsertAsync(int subscriptionId, DateOnly month)
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO subscription_registrations (subscription_id, target_month, entry_id) VALUES (@subscription, @month, @entry) RETURNING id";
            command.Parameters.AddWithValue("subscription", subscriptionId);
            command.Parameters.AddWithValue("month", month);
            command.Parameters.AddWithValue("entry", entry.Id);
            Assert.True(Convert.ToInt32(await command.ExecuteScalarAsync()) > 0);
        }
        var month = new DateOnly(2031, 2, 1);
        await InsertAsync(subscription.Id, month);
        var duplicate = await Assert.ThrowsAsync<PostgresException>(() => InsertAsync(subscription.Id, month));
        Assert.Equal(PostgresErrorCodes.UniqueViolation, duplicate.SqlState);
        await InsertAsync(subscription.Id, month.AddMonths(1));
        // FKなしであるため、削除済みサブスク・収支のIDも保持できる。
        await InsertAsync(subscription.Id + 1000, month);
        await using var foreignKeys = connection.CreateCommand();
        foreignKeys.CommandText = "SELECT count(*) FROM pg_constraint WHERE conrelid = 'subscription_registrations'::regclass AND contype = 'f'";
        Assert.Equal(0L, Convert.ToInt64(await foreignKeys.ExecuteScalarAsync()));
    }
}
