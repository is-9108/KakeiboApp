using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

public class SubscriptionCategoryTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    [Fact]
    public async Task サブスクを支出として登録編集して集計できる()
    {
        var id = await CreateEntryAsync(EntryBody("2031-01-01", "支出", 1000, "サブスク"));
        var updated = await Client.PutAsync($"/api/entries/{id}", Json(EntryBody("2031-01-01", "支出", 2000, "サブスク")));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var list = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-01"));
        Assert.Equal("サブスク", list[0].GetProperty("category").GetString());
        Assert.Equal(2000, list[0].GetProperty("amount").GetInt32());
        var summary = await JsonBodyAsync(await Client.GetAsync("/api/entries/summary?month=2031-01"));
        Assert.Equal("サブスク", summary.GetProperty("expenseBreakdown")[0].GetProperty("category").GetString());
        Assert.Equal(2000, summary.GetProperty("expenseTotal").GetInt32());
    }

    [Fact]
    public async Task 収入にはサブスクを登録編集できない()
    {
        var body = EntryBody("2031-01-01", "収入", 1000, "サブスク");
        Assert.Equal(HttpStatusCode.BadRequest, (await Client.PostAsync("/api/entries", Json(body))).StatusCode);
        Assert.Equal(0, CountEntries());
        var id = await CreateEntryAsync(EntryBody());
        Assert.Equal(HttpStatusCode.BadRequest, (await Client.PutAsync($"/api/entries/{id}", Json(body))).StatusCode);
        var list = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-01"));
        Assert.Equal("外食費", list[0].GetProperty("category").GetString());
    }
}
