using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class CreateSubscriptionTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    [Theory]
    [InlineData(1, 1, 0)]
    [InlineData(100, 2147483647, 500)]
    public async Task 有効な値を登録すると保存値と場所を返す(int nameLength, int amount, int memoLength)
    {
        var body = SubscriptionBody();
        body["name"] = new string('名', nameLength);
        body["amount"] = amount;
        body["memo"] = new string('メ', memoLength);
        var response = await Client.PostAsync("/api/subscriptions", Json(body));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await JsonBodyAsync(response);
        Assert.True(json.GetProperty("id").GetInt32() > 0);
        Assert.Equal($"/api/subscriptions/{json.GetProperty("id").GetInt32()}", response.Headers.Location?.ToString());
        Assert.Equal(body["name"], json.GetProperty("name").GetString());
        Assert.Equal(amount, json.GetProperty("amount").GetInt32());
        Assert.Equal(body["memo"], json.GetProperty("memo").GetString());
        Assert.Equal(1, CountSubscriptions());
        var list = await JsonBodyAsync(await Client.GetAsync("/api/subscriptions"));
        Assert.Equal(json.ToString(), Assert.Single(list.EnumerateArray()).ToString());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task メモの省略とnullは空文字として保存する(bool omit)
    {
        var body = SubscriptionBody();
        if (omit) body.Remove("memo"); else body["memo"] = null;
        var response = await Client.PostAsync("/api/subscriptions", Json(body));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("", (await JsonBodyAsync(response)).GetProperty("memo").GetString());
    }

    [Fact]
    public async Task 名前の前後の空白をそのまま保存する()
    {
        var body = SubscriptionBody();
        body["name"] = " Netflix ";
        var response = await Client.PostAsync("/api/subscriptions", Json(body));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(" Netflix ", (await JsonBodyAsync(response)).GetProperty("name").GetString());
    }
}
