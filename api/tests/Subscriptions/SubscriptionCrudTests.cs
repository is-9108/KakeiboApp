using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class SubscriptionCrudTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    [Fact]
    public async Task 空一覧は配列で返す()
    {
        var response = await Client.GetAsync("/api/subscriptions");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await JsonBodyAsync(response)).EnumerateArray());
    }

    [Fact]
    public async Task 登録編集削除でき重複名を許容し登録順を保持する()
    {
        var first = await CreateSubscriptionAsync();
        var second = await CreateSubscriptionAsync();
        var body = SubscriptionBody();
        body["name"] = "変更後"; body["amount"] = 2000; body["memo"] = "変更メモ";
        var updated = await Client.PutAsync($"/api/subscriptions/{first}", Json(body));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var list = await JsonBodyAsync(await Client.GetAsync("/api/subscriptions"));
        Assert.Equal(new[] { first, second }, list.EnumerateArray().Select(e => e.GetProperty("id").GetInt32()));
        Assert.Equal("変更後", list[0].GetProperty("name").GetString());
        Assert.Equal(2000, list[0].GetProperty("amount").GetInt32());
        Assert.Equal("変更メモ", list[0].GetProperty("memo").GetString());
        var deleted = await Client.DeleteAsync($"/api/subscriptions/{first}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal("", await deleted.Content.ReadAsStringAsync());
        Assert.Equal(1, CountSubscriptions());
        list = await JsonBodyAsync(await Client.GetAsync("/api/subscriptions"));
        Assert.Equal(second, list[0].GetProperty("id").GetInt32());
    }

    [Fact]
    public async Task 存在しない対象の編集削除は他の行を変更せず404()
    {
        await CreateSubscriptionAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await Client.PutAsync("/api/subscriptions/99999", Json(SubscriptionBody()))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client.DeleteAsync("/api/subscriptions/99999")).StatusCode);
        Assert.Equal(1, CountSubscriptions());
    }

    [Fact]
    public async Task サブスクの操作は既存収支と月次集計を変更しない()
    {
        var entry = new { date = "2031-01-01", type = "支出", amount = 1500, category = "食費", memo = "既存" };
        Assert.Equal(HttpStatusCode.Created, (await Client.PostAsync("/api/entries", Json(entry))).StatusCode);
        var before = await Client.GetStringAsync("/api/entries?month=2031-01");
        var summary = await Client.GetStringAsync("/api/entries/summary?month=2031-01");
        var id = await CreateSubscriptionAsync();
        await Client.PutAsync($"/api/subscriptions/{id}", Json(SubscriptionBody()));
        await Client.DeleteAsync($"/api/subscriptions/{id}");
        Assert.Equal(before, await Client.GetStringAsync("/api/entries?month=2031-01"));
        Assert.Equal(summary, await Client.GetStringAsync("/api/entries/summary?month=2031-01"));
    }
}
