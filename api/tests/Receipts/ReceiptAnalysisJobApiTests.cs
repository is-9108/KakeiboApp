using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net;
using System.Text.Json;
using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Kakeibo.Api.Tests.Receipts;

public class ReceiptAnalysisJobApiTests(KakeiboApiTestFactory factory) : IClassFixture<KakeiboApiTestFactory>
{
    [Theory]
    [InlineData("待機中")]
    [InlineData("完了")]
    [InlineData("失敗")]
    public async Task 状態と解析項目を返し内部キーを公開しない(string status)
    {
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var now = new DateTimeOffset(2026, 11, 11, 12, 0, 0, TimeSpan.Zero);
        var job = new ReceiptAnalysisJob
        {
            Id = Guid.NewGuid(),
            ObjectKey = $"receipts/{Guid.NewGuid():N}.jpg",
            Status = status,
            CreatedAt = now,
            UpdatedAt = now,
            ReceiptDate = status == "完了" ? new DateOnly(2026, 11, 11) : null,
            TotalAmount = status == "完了" ? 1200 : null,
            StoreName = status == "完了" ? "店舗" : null,
            Category = status == "完了" ? "食費" : null,
        };
        db.ReceiptAnalysisJobs.Add(job);
        await db.SaveChangesAsync();
        var response = await client.GetAsync($"/api/receipts/{job.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(8, json.EnumerateObject().Count());
        Assert.Equal(job.Id, json.GetProperty("id").GetGuid());
        Assert.Equal(status, json.GetProperty("status").GetString());
        Assert.Equal(job.ReceiptDate?.ToString("yyyy-MM-dd"), json.GetProperty("date").GetString());
        Assert.Equal(job.TotalAmount, json.GetProperty("amount").Deserialize<int?>());
        Assert.Equal(job.StoreName, json.GetProperty("storeName").GetString());
        Assert.Equal(job.Category, json.GetProperty("category").GetString());
        Assert.Equal(now, json.GetProperty("createdAt").GetDateTimeOffset());
        Assert.Equal(now, json.GetProperty("updatedAt").GetDateTimeOffset());
        Assert.False(json.TryGetProperty("objectKey", out _));
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task 存在しない識別子は四百四(string id)
    {
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/receipts/{id}")).StatusCode);
    }

    [Theory]
    [InlineData("なし")]
    [InlineData("期限切れ")]
    [InlineData("改ざん")]
    public async Task 認証が有効でない要求を拒否する(string kind)
    {
        using var client = factory.CreateClient();
        if (kind == "期限切れ") client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader(DateTimeOffset.UtcNow.AddMinutes(-1));
        if (kind == "改ざん") client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.Tokens.CreateAccessToken(signingKey: TestSigningKeys.Secondary).Value);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/receipts/{Guid.NewGuid()}")).StatusCode);
    }
}
