using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class UpdateSubscriptionTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task 全項目を置換して一覧にも反映する(bool omitMemo)
    {
        var id = await CreateSubscriptionAsync(SubscriptionBody());
        var body = SubscriptionBody();
        body["name"] = "音楽";
        body["amount"] = 2000;
        if (omitMemo) body.Remove("memo"); else body["memo"] = "新しいメモ";
        var response = await Client.PutAsync($"/api/subscriptions/{id}", Json(body));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await JsonBodyAsync(response);
        Assert.Equal(id, json.GetProperty("id").GetInt32());
        Assert.Equal("音楽", json.GetProperty("name").GetString());
        Assert.Equal(2000, json.GetProperty("amount").GetInt32());
        Assert.Equal(omitMemo ? "" : "新しいメモ", json.GetProperty("memo").GetString());
        var list = await JsonBodyAsync(await Client.GetAsync("/api/subscriptions"));
        Assert.Equal(json.ToString(), Assert.Single(list.EnumerateArray()).ToString());
    }

    [Theory]
    [InlineData("name")]
    [InlineData("amount")]
    [InlineData("memo")]
    public async Task 不正な編集では元の全項目を保つ(string field)
    {
        var id = await CreateSubscriptionAsync(SubscriptionBody());
        var before = await JsonBodyAsync(await Client.GetAsync("/api/subscriptions"));
        var body = SubscriptionBody();
        body[field] = field switch { "name" => "   ", "amount" => 0, _ => new string('メ', 501) };
        var response = await Client.PutAsync($"/api/subscriptions/{id}", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await JsonBodyAsync(response)).GetProperty("errors").TryGetProperty(field, out _));
        Assert.Equal(before.ToString(), (await JsonBodyAsync(await Client.GetAsync("/api/subscriptions"))).ToString());
    }

    [Theory]
    [InlineData("9999")]
    [InlineData("abc")]
    public async Task 存在しないIDや数値でないIDは404(string id)
    {
        var response = await Client.PutAsync($"/api/subscriptions/{id}", Json(SubscriptionBody()));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, CountSubscriptions());
    }

    [Fact]
    public async Task 存在確認より先に入力を検証する()
    {
        var response = await Client.PutAsync("/api/subscriptions/9999", Json(new { amount = 0 }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
