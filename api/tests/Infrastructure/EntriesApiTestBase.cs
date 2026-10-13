using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace Kakeibo.Api.Tests.Infrastructure;

/// <summary>収支APIのテスト共通基底。クラスごとのテストDBを使い、テストごとにentriesテーブルを空にする。</summary>
public abstract class EntriesApiTestBase : IClassFixture<KakeiboApiTestFactory>
{
    protected EntriesApiTestBase(KakeiboApiTestFactory factory)
    {
        Factory = factory;
        Client = factory.CreateClient();
        TruncateEntries();
    }

    protected KakeiboApiTestFactory Factory { get; }

    protected HttpClient Client { get; }

    /// <summary>テスト間の隔離のため、entriesテーブルを空にしてidの連番をリセットする。</summary>
    protected void TruncateEntries()
    {
        using var connection = new NpgsqlConnection(Factory.TestConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "TRUNCATE TABLE entries RESTART IDENTITY";
        command.ExecuteNonQuery();
    }

    /// <summary>entriesテーブルの行数を返す。保存・削除の検証に使う。</summary>
    protected int CountEntries()
    {
        using var connection = new NpgsqlConnection(Factory.TestConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM entries";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    /// <summary>テストで使う収支リクエストボディの基本形。項目の上書き・削除は各テストで行う。</summary>
    protected static Dictionary<string, object?> EntryBody() => new()
    {
        ["date"] = "2031-01-15",
        ["type"] = "支出",
        ["amount"] = 1500,
        ["category"] = "外食費",
        ["memo"] = "昼食",
    };

    /// <summary>ボディをJSONとして送るためのHttpContentを作る。</summary>
    protected static HttpContent Json(object body) =>
        new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

    /// <summary>レスポンスボディをJSON要素として読む。</summary>
    protected static async Task<JsonElement> JsonBodyAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(content);
        return document.RootElement.Clone();
    }
}
