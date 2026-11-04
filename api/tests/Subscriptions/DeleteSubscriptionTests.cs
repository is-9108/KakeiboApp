using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Subscriptions;

public class DeleteSubscriptionTests(KakeiboApiTestFactory factory) : SubscriptionsApiTestBase(factory)
{
    [Fact]
    public async Task 削除すると本文なしで204を返し一覧とDBから消える()
    {
        var id = await CreateSubscriptionAsync(SubscriptionBody());
        var response = await Client.DeleteAsync($"/api/subscriptions/{id}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("", await response.Content.ReadAsStringAsync());
        Assert.Empty((await JsonBodyAsync(await Client.GetAsync("/api/subscriptions"))).EnumerateArray());
        Assert.Equal(0, CountSubscriptions());
    }

    [Theory]
    [InlineData("9999")]
    [InlineData("abc")]
    public async Task 存在しないIDや数値でないIDは404(string id)
    {
        Assert.Equal(HttpStatusCode.NotFound, (await Client.DeleteAsync($"/api/subscriptions/{id}")).StatusCode);
    }
}
