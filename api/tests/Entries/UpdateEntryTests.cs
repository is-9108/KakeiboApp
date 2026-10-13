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

    // PUTはPOSTと同じ必須項目を要求し、不正な更新では既存データを変更しない
    [Theory]
    [InlineData("date")]
    [InlineData("type")]
    [InlineData("amount")]
    [InlineData("category")]
    public async Task Put_without_required_field_returns_400_and_keeps_data(string missingField)
    {
        var id = await CreateEntryAsync(EntryBody());
        var body = EntryBody("2031-02-01", "収入", 50000, "給与", "月給");
        body.Remove(missingField);

        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertOriginalEntryRemains(id);
    }

    // PUTの金額が0以下、または整数でない場合は400となり、既存データを変更しない
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task Put_with_non_positive_amount_returns_400_and_keeps_data(int amount)
    {
        var id = await CreateEntryAsync(EntryBody());
        var body = EntryBody("2031-02-01", "収入", amount, "給与", "月給");

        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertOriginalEntryRemains(id);
    }

    [Fact]
    public async Task Put_with_decimal_amount_returns_400_and_keeps_data()
    {
        var id = await CreateEntryAsync(EntryBody());
        var body = EntryBody("2031-02-01", "収入", 50000, "給与", "月給");
        body["amount"] = 1000.5;

        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertOriginalEntryRemains(id);
    }

    // PUTの日付が不正な場合は400となり、既存データを変更しない
    [Theory]
    [InlineData("2031/02/01")]
    [InlineData("2031-13-01")]
    [InlineData("abc")]
    public async Task Put_with_invalid_date_returns_400_and_keeps_data(string date)
    {
        var id = await CreateEntryAsync(EntryBody());
        var body = EntryBody("2031-02-01", "収入", 50000, "給与", "月給");
        body["date"] = date;

        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertOriginalEntryRemains(id);
    }

    // PUTでプリセットにないカテゴリを指定すると400となり、既存データを変更しない
    [Fact]
    public async Task Put_with_unknown_category_returns_400_and_keeps_data()
    {
        var id = await CreateEntryAsync(EntryBody());
        var body = EntryBody("2031-02-01", "収入", 50000, "給与", "月給");
        body["category"] = "旅行";

        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertOriginalEntryRemains(id);
    }

    // PUTでメモを省略すると空文字に置換される
    [Fact]
    public async Task Put_without_memo_clears_existing_memo()
    {
        var id = await CreateEntryAsync(EntryBody());
        var body = EntryBody("2031-02-01", "収入", 50000, "給与");
        body.Remove("memo");

        var response = await Client.PutAsync($"/api/entries/{id}", Json(body));
        var updated = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("", updated.GetProperty("memo").GetString());
        var list = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-02"));
        var listedEntry = Assert.Single(list.EnumerateArray());
        Assert.Equal(id, listedEntry.GetProperty("id").GetInt32());
        Assert.Equal("", listedEntry.GetProperty("memo").GetString());
    }

    private async Task AssertOriginalEntryRemains(int id)
    {
        var list = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-01"));
        var entry = Assert.Single(list.EnumerateArray());
        Assert.Equal(id, entry.GetProperty("id").GetInt32());
        Assert.Equal("2031-01-15", entry.GetProperty("date").GetString());
        Assert.Equal("支出", entry.GetProperty("type").GetString());
        Assert.Equal(1500, entry.GetProperty("amount").GetInt32());
        Assert.Equal("外食費", entry.GetProperty("category").GetString());
        Assert.Equal("昼食", entry.GetProperty("memo").GetString());
    }

    // T21: idが数値でない編集・削除リクエストは404を返す
    [Fact]
    public async Task Put_with_non_numeric_id_returns_404()
    {
        var putResponse = await Client.PutAsync("/api/entries/abc", Json(EntryBody()));
        Assert.Equal(HttpStatusCode.NotFound, putResponse.StatusCode);

        var deleteResponse = await Client.DeleteAsync("/api/entries/abc");
        Assert.Equal(HttpStatusCode.NotFound, deleteResponse.StatusCode);
    }
}
