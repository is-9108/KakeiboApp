using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net;
using System.Reflection;
using Amazon.S3;
using Kakeibo.Api.Data;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.DependencyInjection;

namespace Kakeibo.Api.Tests.Receipts;

public class ReceiptUploadUrlAuthTests(KakeiboApiTestFactory factory)
    : IClassFixture<KakeiboApiTestFactory>
{
    [Theory]
    [InlineData("なし")]
    [InlineData("期限切れ")]
    [InlineData("改ざん")]
    public async Task 未認証では署名を発行しない(string kind)
    {
        var s3 = DispatchProxy.Create<IAmazonS3, ReceiptUploadUrlTests.SigningProxy>();
        using var application = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAmazonS3>();
            services.AddSingleton(s3);
        }));
        using var client = application.CreateClient();
        if (kind == "期限切れ")
            client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader(DateTimeOffset.UtcNow.AddMinutes(-1));
        if (kind == "改ざん")
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer", factory.Tokens.CreateAccessToken(signingKey: TestSigningKeys.Secondary).Value);
        using var scope = application.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var before = await db.ReceiptAnalysisJobs.CountAsync();
        var response = await client.PostAsJsonAsync(
            "/api/receipts/upload-url", new { contentType = "image/jpeg", size = 1 });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(((ReceiptUploadUrlTests.SigningProxy)s3).Request);
        Assert.Equal(before, await db.ReceiptAnalysisJobs.CountAsync());
    }
}
