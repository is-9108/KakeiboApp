using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

/// <summary>カテゴリを追加・編集・削除するAPIは存在しないことの確認（docs/requirements.md 4.3）。</summary>
public class CategoryApiAbsenceTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    // T6: カテゴリを追加・編集・削除するAPIは存在しない
    [Fact]
    public async Task Category_modification_apis_do_not_exist()
    {
        var postResponse = await Client.PostAsync("/api/categories", Json(EntryBody()));
        Assert.Equal(HttpStatusCode.NotFound, postResponse.StatusCode);

        var putResponse = await Client.PutAsync("/api/categories/1", Json(EntryBody()));
        Assert.Equal(HttpStatusCode.NotFound, putResponse.StatusCode);

        var deleteResponse = await Client.DeleteAsync("/api/categories/1");
        Assert.Equal(HttpStatusCode.NotFound, deleteResponse.StatusCode);
    }
}
