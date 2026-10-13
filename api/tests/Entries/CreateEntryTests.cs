using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

/// <summary>収支登録（POST /api/entries）の正常系・境界値テスト。</summary>
public class CreateEntryTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    // T1: 日付・種別・金額・カテゴリを指定して登録すると、保存された内容が返る
    [Fact]
    public async Task Post_with_all_fields_returns_201_and_saved_entry()
    {
        var body = EntryBody();

        var response = await Client.PostAsync("/api/entries", Json(body));
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.True(json.GetProperty("id").GetInt32() > 0);
        Assert.Equal("2031-01-15", json.GetProperty("date").GetString());
        Assert.Equal("支出", json.GetProperty("type").GetString());
        Assert.Equal(1500, json.GetProperty("amount").GetInt32());
        Assert.Equal("外食費", json.GetProperty("category").GetString());
        Assert.Equal("昼食", json.GetProperty("memo").GetString());
        Assert.Equal(1, CountEntries());
    }

    // T2: メモを省略して登録すると、メモが空の状態で登録される
    [Theory]
    [InlineData("omit")]
    [InlineData("null")]
    [InlineData("empty")]
    public async Task Post_without_memo_saves_empty_memo(string memoPattern)
    {
        var body = EntryBody();
        switch (memoPattern)
        {
            case "omit":
                body.Remove("memo");
                break;
            case "null":
                body["memo"] = null;
                break;
            case "empty":
                body["memo"] = "";
                break;
        }

        var response = await Client.PostAsync("/api/entries", Json(body));
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("", json.GetProperty("memo").GetString());
    }

    // T18: 金額の下限（1円）で登録できる
    [Fact]
    public async Task Post_with_amount_1_returns_201()
    {
        var body = EntryBody();
        body["amount"] = 1;

        var response = await Client.PostAsync("/api/entries", Json(body));
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, json.GetProperty("amount").GetInt32());
    }

    // T19（201側）: 金額の上限（intの最大値）で登録できる
    [Fact]
    public async Task Post_with_int_max_amount_returns_201()
    {
        var body = EntryBody();
        body["amount"] = int.MaxValue;

        var response = await Client.PostAsync("/api/entries", Json(body));
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(2147483647, json.GetProperty("amount").GetInt32());
    }
}
