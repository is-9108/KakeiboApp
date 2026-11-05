using System.Net.Http.Json;
using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace Kakeibo.Api.Tests.Data;

public class SubscriptionMigrationTests(KakeiboApiTestFactory factory) : IClassFixture<KakeiboApiTestFactory>
{
    [Fact]
    public async Task 旧スキーマの収支を保持してサブスクテーブルを追加できる()
    {
        using var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261013110902_AddEntries");
        var entry = new Entry { Date = new DateOnly(2031, 1, 1), Type = "支出", Amount = 1500, Category = "食費", Memo = "既存データ" };
        db.Entries.Add(entry);
        await db.SaveChangesAsync();
        var id = entry.Id;
        db.ChangeTracker.Clear();
        await migrator.MigrateAsync();
        var saved = await db.Entries.SingleAsync();
        Assert.Equal(id, saved.Id);
        Assert.Equal(new DateOnly(2031, 1, 1), saved.Date);
        Assert.Equal("支出", saved.Type);
        Assert.Equal(1500, saved.Amount);
        Assert.Equal("食費", saved.Category);
        Assert.Equal("既存データ", saved.Memo);
        client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader();
        var response = await client.PostAsJsonAsync("/api/subscriptions", new { name = "音楽", amount = 1000 });
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
    }
}
