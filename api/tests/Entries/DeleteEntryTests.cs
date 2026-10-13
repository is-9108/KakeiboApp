using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

/// <summary>収支削除（DELETE /api/entries/{id}）のテスト。</summary>
public class DeleteEntryTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    // T5: 存在する収支を削除すると、その後の一覧に含まれない
    [Fact]
    public async Task Delete_removes_entry_from_list()
    {
        var id = await CreateEntryAsync(EntryBody());

        var response = await Client.DeleteAsync($"/api/entries/{id}");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("", body);
        var january = await JsonBodyAsync(await Client.GetAsync("/api/entries?month=2031-01"));
        Assert.Empty(january.EnumerateArray());
        Assert.Equal(0, CountEntries());
    }

    // T17: 存在しない収支のIDを指定した削除は404を返す
    [Fact]
    public async Task Delete_on_missing_id_returns_404()
    {
        var response = await Client.DeleteAsync("/api/entries/9999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
