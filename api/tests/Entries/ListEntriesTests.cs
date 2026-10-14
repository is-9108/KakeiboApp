using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

/// <summary>収支一覧（GET /api/entries）のテスト。</summary>
public class ListEntriesTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    // T3: 月を指定して一覧を取得すると、その月の収支が日付の新しい順（同日付はid昇順）で返る
    [Fact]
    public async Task Get_returns_month_entries_ordered_by_date_desc()
    {
        await CreateEntryAsync(EntryBody("2031-01-01", "支出", 100, "日用品"));
        await CreateEntryAsync(EntryBody("2031-01-10", "支出", 2000, "食費"));
        await CreateEntryAsync(EntryBody("2031-01-20", "支出", 1500, "外食費"));
        await CreateEntryAsync(EntryBody("2031-01-20", "支出", 200, "交通費"));
        await CreateEntryAsync(EntryBody("2031-01-31", "支出", 1000, "食費"));

        var response = await Client.GetAsync("/api/entries?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(JsonValueKind.Array, json.ValueKind);
        var entries = json.EnumerateArray().ToList();
        Assert.Equal(5, entries.Count);
        Assert.Equal(
            ["2031-01-31", "2031-01-20", "2031-01-20", "2031-01-10", "2031-01-01"],
            entries.Select(e => e.GetProperty("date").GetString()).ToArray());
        Assert.Equal(
            ["食費", "外食費", "交通費", "食費", "日用品"],
            entries.Select(e => e.GetProperty("category").GetString()).ToArray());
        Assert.Equal(
            [1000, 1500, 200, 2000, 100],
            entries.Select(e => e.GetProperty("amount").GetInt32()).ToArray());
    }

    // T13: monthが未指定・不正な形式の一覧取得は400を返す
    [Theory]
    [InlineData(null)]
    [InlineData("2031-1")]
    [InlineData("2031-13")]
    [InlineData("2031-00")]
    [InlineData("abc")]
    public async Task Get_with_invalid_month_returns_400(string? month)
    {
        var url = month is null ? "/api/entries" : $"/api/entries?month={month}";

        var response = await Client.GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // T20: 前月末・翌月初の収支は月指定の一覧に含まれない
    [Fact]
    public async Task Get_excludes_adjacent_months()
    {
        await CreateEntryAsync(EntryBody("2030-12-31", "支出", 100, "日用品"));
        await CreateEntryAsync(EntryBody("2031-01-01", "支出", 200, "日用品"));
        await CreateEntryAsync(EntryBody("2031-01-31", "支出", 300, "日用品"));
        await CreateEntryAsync(EntryBody("2031-02-01", "支出", 400, "日用品"));

        var response = await Client.GetAsync("/api/entries?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var entries = json.EnumerateArray().ToList();
        Assert.Equal(2, entries.Count);
        Assert.Equal(
            ["2031-01-31", "2031-01-01"],
            entries.Select(e => e.GetProperty("date").GetString()).ToArray());
        Assert.Equal(
            [300, 200],
            entries.Select(e => e.GetProperty("amount").GetInt32()).ToArray());
    }
}
