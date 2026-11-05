using System.Net;
using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace Kakeibo.Api.Tests.Infrastructure;

/// <summary>サブスクAPIの共通基底。クラス別DBを使い、各テストでテーブルを初期化する。</summary>
public abstract class SubscriptionsApiTestBase : IClassFixture<KakeiboApiTestFactory>
{
    protected SubscriptionsApiTestBase(KakeiboApiTestFactory factory)
    {
        Factory = factory;
        // Client生成時にCreateHost→CreateTestDatabaseが走り、テスト用DBとマイグレーションが終わる
        Client = factory.CreateClient();
        Client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader();
        TruncateSubscriptions();
    }

    protected KakeiboApiTestFactory Factory { get; }

    protected HttpClient Client { get; }

    /// <summary>テスト間の隔離のため、サブスクテーブルを空にしてidの連番をリセットする。</summary>
    protected void TruncateSubscriptions()
    {
        using var connection = new NpgsqlConnection(Factory.TestConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "TRUNCATE TABLE subscriptions, entries RESTART IDENTITY";
        command.ExecuteNonQuery();
    }

    /// <summary>サブスクテーブルの行数を返す。保存・削除の検証に使う。</summary>
    protected int CountSubscriptions()
    {
        using var connection = new NpgsqlConnection(Factory.TestConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM subscriptions";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    protected static Dictionary<string, object?> SubscriptionBody() => new()
    {
        ["name"] = "動画サービス",
        ["amount"] = 1000,
        ["memo"] = "月額",
    };

    protected async Task<int> CreateSubscriptionAsync(Dictionary<string, object?>? body = null)
    {
        var response = await Client.PostAsync("/api/subscriptions", Json(body ?? SubscriptionBody()));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await JsonBodyAsync(response);
        Assert.Equal($"/api/subscriptions/{json.GetProperty("id").GetInt32()}", response.Headers.Location?.ToString());
        return json.GetProperty("id").GetInt32();
    }

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
