using System.Net;
using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace Kakeibo.Api.Tests.Infrastructure;

/// <summary>サブスクAPIのテスト共通基底。クラスごとのテストDBを使い、テストごとにsubscriptionsテーブルを空にする。</summary>
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

    /// <summary>テスト間の隔離のため、subscriptionsテーブルを空にしてidの連番をリセットする。</summary>
    protected void TruncateSubscriptions()
    {
        using var connection = new NpgsqlConnection(Factory.TestConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "TRUNCATE TABLE subscriptions RESTART IDENTITY";
        command.ExecuteNonQuery();
    }

    /// <summary>subscriptionsテーブルの行数を返す。保存・削除の検証に使う。</summary>
    protected int CountSubscriptions()
    {
        using var connection = new NpgsqlConnection(Factory.TestConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM subscriptions";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    /// <summary>テストで使うサブスクリクエストボディの基本形。項目の上書き・削除は各テストで行う。</summary>
    protected static Dictionary<string, object?> SubscriptionBody() => new()
    {
        ["name"] = "Netflix",
        ["amount"] = 1500,
        ["memo"] = "動画",
    };

    /// <summary>サブスクを1件登録するテスト用ヘルパー。作成されたidを返す。</summary>
    protected async Task<int> CreateSubscriptionAsync(Dictionary<string, object?> body)
    {
        var response = await Client.PostAsync("/api/subscriptions", Json(body));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await JsonBodyAsync(response);
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
