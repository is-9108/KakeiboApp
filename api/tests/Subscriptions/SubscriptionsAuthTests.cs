using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class SubscriptionsAuthTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    [Theory]
    [InlineData("none")]
    [InlineData("expired")]
    public async Task 未認証や期限切れではすべての操作を拒否する(string token)
    {
        using var client = Factory.CreateClient();
        if (token == "expired") client.DefaultRequestHeaders.Authorization = Factory.CreateBearerHeader(DateTimeOffset.UtcNow.AddMinutes(-1));
        var responses = new[]
        {
            await client.GetAsync("/api/subscriptions"),
            await client.PostAsync("/api/subscriptions", Json(SubscriptionBody())),
            await client.PutAsync("/api/subscriptions/1", Json(SubscriptionBody())),
            await client.DeleteAsync("/api/subscriptions/1"),
        };
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
        Assert.Equal(0, CountSubscriptions());
    }
}
