using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class CreateSubscriptionValidationTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    public static TheoryData<string, object?> InvalidFields => new()
    {
        { "name", null }, { "name", "" }, { "name", "   " }, { "name", new string('名', 101) },
        { "name", string.Concat(Enumerable.Repeat("😀", 51)) },
        { "amount", null }, { "amount", 0 }, { "amount", -1 }, { "memo", new string('メ', 501) },
    };

    [Theory]
    [MemberData(nameof(InvalidFields))]
    public async Task 不正な項目は日本語の項目別エラーを返し保存しない(string field, object? value)
    {
        var body = SubscriptionBody();
        if (value is null) body.Remove(field); else body[field] = value;
        var response = await Client.PostAsync("/api/subscriptions", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var json = await JsonBodyAsync(response);
        var errors = json.GetProperty("errors");
        Assert.Equal(JsonValueKind.Object, errors.ValueKind);
        var messages = errors.GetProperty(field);
        Assert.Equal(JsonValueKind.Array, messages.ValueKind);
        var expected = field switch
        {
            "name" => "名前は1〜100文字で指定してください。",
            "amount" => "金額は1以上の整数を指定してください。",
            _ => "メモは500文字以内で指定してください。",
        };
        Assert.Equal(expected, Assert.Single(messages.EnumerateArray()).GetString());
        Assert.Equal(0, CountSubscriptions());
    }

    [Theory]
    [InlineData(1000.5)]
    [InlineData("千")]
    [InlineData(2147483648L)]
    public async Task 整数にバインドできない金額は保存しない(object amount)
    {
        var body = SubscriptionBody();
        body["amount"] = amount;
        var response = await Client.PostAsync("/api/subscriptions", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountSubscriptions());
    }

    [Fact]
    public async Task 複数のエラーを既存収支と同じ形式で返す()
    {
        var body = SubscriptionBody();
        body["name"] = "";
        body["amount"] = 0;
        var response = await Client.PostAsync("/api/subscriptions", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = await JsonBodyAsync(response);
        Assert.Equal(2, json.GetProperty("errors").EnumerateObject().Count());
        Assert.True(json.GetProperty("errors").TryGetProperty("name", out _));
        Assert.True(json.GetProperty("errors").TryGetProperty("amount", out _));
        var entryResponse = await Client.PostAsync("/api/entries", Json(new { amount = 0 }));
        var entryJson = await JsonBodyAsync(entryResponse);
        Assert.Equal(entryResponse.Content.Headers.ContentType?.MediaType, response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(entryJson.EnumerateObject().Select(p => p.Name).Order(), json.EnumerateObject().Select(p => p.Name).Order());
        Assert.All(entryJson.GetProperty("errors").EnumerateObject(), p => Assert.Equal(JsonValueKind.Array, p.Value.ValueKind));
        Assert.Equal(0, CountSubscriptions());
    }
}
