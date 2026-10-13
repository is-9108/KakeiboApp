using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

/// <summary>収支編集（PUT /api/entries/{id}）のテスト。</summary>
public class UpdateEntryTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    // T4: 存在する収支を編集すると、変更内容が反映された収支が返る
    [Fact]
    public async Task Put_updates_existing_entry()
    {
        var id = await CreateEntryAsync(EntryBody());

        var body = EntryBody("2031-02-01", "収入", 50000, "給与", "月給");
        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(id, json.GetProperty("id").GetInt32());
        Assert.Equal("2031-02-01", json.GetProperty("date").GetString());
        Assert.Equal("収入", json.GetProperty("type").GetString());
        Assert.Equal(50000, json.GetProperty("amount").GetInt32());
        Assert.Equal("給与", json.GetProperty("category").GetString());
        Assert.Equal("月給", json.GetProperty("memo").GetString());

        var february = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-02"));
        Assert.Equal([id], february.EnumerateArray().Select(e => e.GetProperty("id").GetInt32()).ToArray());
        Assert.Equal(
            ["2031-02-01"], february.EnumerateArray().Select(e => e.GetProperty("date").GetString()).ToArray());

        var january = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-01"));
        Assert.Empty(january.EnumerateArray());
    }

    // T14: 存在しない収支のIDを指定した編集は404を返す
    [Fact]
    public async Task Put_on_missing_id_returns_404()
    {
        var response = await Client.PutAsync("/api/entries/9999", Json(EntryBody()));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T15: 種別が不正な編集リクエストは400を返し、既存データは変更されない
    [Fact]
    public async Task Put_with_invalid_type_returns_400_and_keeps_data()
    {
        var id = await CreateEntryAsync(EntryBody());

        var body = EntryBody();
        body["type"] = "貯蓄";
        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var january = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-01"));
        var entry = Assert.Single(january.EnumerateArray());
        Assert.Equal(id, entry.GetProperty("id").GetInt32());
        Assert.Equal("外食費", entry.GetProperty("category").GetString());
    }

    // T16: 種別とカテゴリの組み合わせが一致しない編集リクエストは400を返す
    [Fact]
    public async Task Put_with_type_category_mismatch_returns_400()
    {
        var id = await CreateEntryAsync(EntryBody());

        var body = EntryBody();
        body["type"] = "収入";
        body["category"] = "外食費";
        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var january = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-01"));
        var entry = Assert.Single(january.EnumerateArray());
        Assert.Equal("外食費", entry.GetProperty("category").GetString());
    }

    // T21: idが数値でない編集リクエストは404を返す
    [Fact]
    public async Task Put_with_non_numeric_id_returns_404()
    {
        var response = await Client.PutAsync("/api/entries/abc", Json(EntryBody()));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
