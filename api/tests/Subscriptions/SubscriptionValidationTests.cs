using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class SubscriptionValidationTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    public static IEnumerable<object?[]> 不正な項目()
    {
        foreach (var value in new object?[] { null, "", " \t　", new string('あ', 101) }) yield return ["name", value];
        foreach (var value in new object?[] { null, 0, -1, 1.5, "100", 2147483648L, true, new[] { 1 }, new { value = 1 } }) yield return ["amount", value];
        yield return ["memo", new string('あ', 501)];
    }

    [Theory]
    [MemberData(nameof(不正な項目))]
    public async Task 不正な登録編集は項目別エラーでデータを保持する(string field, object? value)
    {
        var id = await CreateSubscriptionAsync();
        var before = await Client.GetStringAsync("/api/subscriptions");
        var body = SubscriptionBody(); body[field] = value;
        foreach (var response in new[] {
            await Client.PostAsync("/api/subscriptions", Json(body)),
            await Client.PutAsync($"/api/subscriptions/{id}", Json(body)) })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
            var json = await JsonBodyAsync(response);
            Assert.Equal(400, json.GetProperty("status").GetInt32());
            Assert.NotEmpty(json.GetProperty("errors").GetProperty(field).EnumerateArray());
        }
        Assert.Equal(before, await Client.GetStringAsync("/api/subscriptions"));
    }

    [Theory]
    [InlineData("name")]
    [InlineData("amount")]
    public async Task 必須項目の省略は登録編集ともエラー(string field)
    {
        var id = await CreateSubscriptionAsync();
        var body = SubscriptionBody(); body.Remove(field);
        foreach (var response in new[] { await Client.PostAsync("/api/subscriptions", Json(body)), await Client.PutAsync($"/api/subscriptions/{id}", Json(body)) })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await JsonBodyAsync(response)).GetProperty("errors").TryGetProperty(field, out _));
        }
        Assert.Equal(1, CountSubscriptions());
    }

    [Fact]
    public async Task 複数の項目エラーをまとめて返す()
    {
        var response = await Client.PostAsync("/api/subscriptions", Json(new { name = "", amount = 0, memo = new string('あ', 501) }));
        var errors = (await JsonBodyAsync(response)).GetProperty("errors");
        Assert.Equal(new[] { "amount", "memo", "name" }, errors.EnumerateObject().Select(p => p.Name).Order());
        Assert.Equal(0, CountSubscriptions());
    }

    [Theory]
    [InlineData(1, 1, 0)]
    [InlineData(100, int.MaxValue, 500)]
    public async Task 境界値を登録編集できる(int nameLength, int amount, int memoLength)
    {
        var body = SubscriptionBody();
        body["name"] = new string('あ', nameLength); body["amount"] = amount; body["memo"] = new string('め', memoLength);
        var id = await CreateSubscriptionAsync(body);
        var response = await Client.PutAsync($"/api/subscriptions/{id}", Json(body));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await JsonBodyAsync(response);
        Assert.Equal(body["name"], saved.GetProperty("name").GetString());
        Assert.Equal(amount, saved.GetProperty("amount").GetInt32());
        Assert.Equal(body["memo"], saved.GetProperty("memo").GetString());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task メモの省略とnullは空文字にする(bool omit)
    {
        var body = SubscriptionBody();
        if (omit) body.Remove("memo"); else body["memo"] = null;
        var id = await CreateSubscriptionAsync(body);
        var response = await Client.PutAsync($"/api/subscriptions/{id}", Json(body));
        Assert.Equal("", (await JsonBodyAsync(response)).GetProperty("memo").GetString());
    }
}
