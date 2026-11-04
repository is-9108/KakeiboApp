using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class ListSubscriptionsTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    [Fact]
    public async Task 未登録なら空配列を返す()
    {
        var response = await Client.GetAsync("/api/subscriptions");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await JsonBodyAsync(response)).EnumerateArray());
    }

    [Fact]
    public async Task 名前の順序にかかわらず登録順で返す()
    {
        var ids = new List<int>();
        foreach (var name in new[] { "動画", "音楽", "ゲーム" })
        {
            var body = SubscriptionBody();
            body["name"] = name;
            ids.Add(await CreateSubscriptionAsync(body));
        }
        var response = await Client.GetAsync("/api/subscriptions");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var list = await JsonBodyAsync(response);
        Assert.Equal(ids, list.EnumerateArray().Select(e => e.GetProperty("id").GetInt32()));
    }
}
