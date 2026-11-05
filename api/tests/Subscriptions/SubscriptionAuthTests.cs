using System.Net;
using System.Net.Http.Headers;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class SubscriptionAuthTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    [Theory]
    [InlineData("なし")]
    [InlineData("期限切れ")]
    [InlineData("改ざん")]
    public async Task 未認証要求は全操作401で既存データを変更しない(string kind)
    {
        var id = await CreateSubscriptionAsync();
        var before = await Client.GetStringAsync("/api/subscriptions");
        using var client = Factory.CreateClient();
        if (kind == "期限切れ") client.DefaultRequestHeaders.Authorization = Factory.CreateBearerHeader(DateTimeOffset.UtcNow.AddMinutes(-1));
        if (kind == "改ざん") client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Factory.Tokens.CreateAccessToken(signingKey: TestSigningKeys.Secondary).Value);
        foreach (var response in new[] { await client.GetAsync("/api/subscriptions"), await client.PostAsync("/api/subscriptions", Json(SubscriptionBody())), await client.PutAsync($"/api/subscriptions/{id}", Json(SubscriptionBody())), await client.DeleteAsync($"/api/subscriptions/{id}") })
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(before, await Client.GetStringAsync("/api/subscriptions"));
    }
}
