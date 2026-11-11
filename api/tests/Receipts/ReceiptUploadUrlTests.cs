using System.Net.Http.Json;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text;
using Amazon.S3.Model;
using Amazon.S3;
using Kakeibo.Api.Data;
using Kakeibo.Api.Services;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kakeibo.Api.Tests.Receipts;

public class ReceiptUploadUrlTests(KakeiboApiTestFactory factory)
    : IClassFixture<KakeiboApiTestFactory>
{
    [Theory]
    [InlineData("image/jpeg", "jpg", 1)]
    [InlineData("image/png", "png", 10485760)]
    [InlineData("image/webp", "webp", 100)]
    public async Task 認証済み要求は形式別のキーと五分の署名を返す(string type, string extension, long size)
    {
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader();
        var response = await client.PostAsJsonAsync(
            "/api/receipts/upload-url", new { contentType = type, size, key = "evil/key" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var id = body.GetProperty("jobId").GetGuid();
        var job = await db.ReceiptAnalysisJobs.SingleAsync(x => x.Id == id);
        Assert.Equal("待機中", job.Status);
        Assert.Null(job.ReceiptDate);
        Assert.Null(job.TotalAmount);
        Assert.Null(job.StoreName);
        Assert.Null(job.Category);
        Assert.Equal(job.CreatedAt, job.UpdatedAt);
        Assert.InRange(job.CreatedAt, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow);
        Assert.Equal(body.GetProperty("key").GetString(), job.ObjectKey);
        var key = body.GetProperty("key").GetString()!;
        Assert.Matches($"^receipts/[0-9a-f]{{32}}\\.{extension}$", key);
        var url = new Uri(body.GetProperty("uploadUrl").GetString()!);
        Assert.Equal("kakeibo-test-receipts.s3.ap-northeast-1.amazonaws.com", url.Host);
        Assert.Equal("/" + key, url.AbsolutePath);
        var query = QueryHelpers.ParseQuery(url.Query);
        Assert.Equal("300", query["X-Amz-Expires"].ToString());
        Assert.Contains("content-type", query["X-Amz-SignedHeaders"].ToString());
        Assert.Contains("host", query["X-Amz-SignedHeaders"].ToString());
        AssertPutSignature(url, type);
        Assert.Equal(type, body.GetProperty("headers").GetProperty("Content-Type").GetString());
        Assert.InRange(body.GetProperty("expiresAt").GetDateTimeOffset(),
            DateTimeOffset.UtcNow.AddMinutes(4.9), DateTimeOffset.UtcNow.AddMinutes(5.1));
        var second = await client.PostAsJsonAsync(
            "/api/receipts/upload-url", new { contentType = type, size });
        var other = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.NotEqual(key, other.GetProperty("key").GetString());
        Assert.NotEqual(id, other.GetProperty("jobId").GetGuid());
    }

    [Theory]
    [InlineData("{\"contentType\":\"image/gif\",\"size\":1}")]
    [InlineData("{\"contentType\":\"application/pdf\",\"size\":1}")]
    [InlineData("{\"contentType\":\"IMAGE/JPEG\",\"size\":1}")]
    [InlineData("{\"contentType\":\"\",\"size\":1}")]
    [InlineData("{\"size\":1}")]
    [InlineData("{\"contentType\":\"image/jpeg\",\"size\":0}")]
    [InlineData("{\"contentType\":\"image/jpeg\",\"size\":-1}")]
    [InlineData("{\"contentType\":\"image/jpeg\",\"size\":10485761}")]
    [InlineData("{\"contentType\":\"image/jpeg\",\"size\":\"abc\"}")]
    [InlineData("{\"contentType\":\"image/jpeg\"}")]
    public async Task 不正な形式とサイズを拒否する(string json)
    {
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var before = await db.ReceiptAnalysisJobs.CountAsync();
        var response = await client.PostAsync("/api/receipts/upload-url",
            new StringContent(json, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(before, await db.ReceiptAnalysisJobs.CountAsync());
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        var field = json.Contains("image/jpeg") ? "size" : "contentType";
        Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public void 固定時刻から五分後の期限で署名を依頼する()
    {
        var s3 = DispatchProxy.Create<IAmazonS3, SigningProxy>();
        var proxy = (SigningProxy)s3;
        var now = new DateTimeOffset(2026, 11, 10, 12, 0, 0, TimeSpan.Zero);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Receipts:BucketName"] = "test-receipts" }).Build();
        var service = new ReceiptUploadUrlService(s3, configuration, new FixedTimeProvider(now));
        var result = service.Create("image/png");
        Assert.Equal(now.AddMinutes(5), result.ExpiresAt);
        Assert.Equal(now.AddMinutes(5).UtcDateTime, proxy.Request!.Expires);
        Assert.Equal(HttpVerb.PUT, proxy.Request.Verb);
        Assert.Equal("image/png", proxy.Request.ContentType);
        Assert.Equal(result.Key, proxy.Request.Key);
        Assert.Equal("test-receipts", proxy.Request.BucketName);
    }

    [Fact]
    public async Task バケット未設定でも起動し呼び出し時に五百を返す()
    {
        using var application = factory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Receipts:BucketName"] = "",
                })));
        using var client = application.CreateClient();
        client.DefaultRequestHeaders.Authorization = factory.CreateBearerHeader();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
        var before = await db.ReceiptAnalysisJobs.CountAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
        var response = await client.PostAsJsonAsync(
            "/api/receipts/upload-url", new { contentType = "image/png", size = 1 });
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(before, await db.ReceiptAnalysisJobs.CountAsync());
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    public class SigningProxy : DispatchProxy
    {
        public GetPreSignedUrlRequest? Request { get; private set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod?.Name != nameof(IAmazonS3.GetPreSignedURL))
                throw new InvalidOperationException("予期しないS3呼び出しです。");
            Request = (GetPreSignedUrlRequest)args![0]!;
            return "https://example.com/upload";
        }
    }

    // SDKとは別に正規リクエストを構成し、PUTとContent-Typeが署名に含まれることを照合する。
    private static void AssertPutSignature(Uri url, string contentType)
    {
        var query = QueryHelpers.ParseQuery(url.Query);
        var credential = query["X-Amz-Credential"].ToString().Split('/');
        var canonicalQuery = string.Join("&", query
            .Where(pair => pair.Key != "X-Amz-Signature")
            .Select(pair => (Key: Uri.EscapeDataString(pair.Key), Value: Uri.EscapeDataString(pair.Value.ToString())))
            .OrderBy(pair => pair.Key, StringComparer.Ordinal)
            .Select(pair => $"{pair.Key}={pair.Value}"));
        var headers = query["X-Amz-SignedHeaders"].ToString();
        var canonicalHeaders = string.Join("", headers.Split(';').Select(name =>
            $"{name}:{(name == "host" ? url.Host : contentType)}\n"));
        var canonical = $"PUT\n{url.AbsolutePath}\n{canonicalQuery}\n{canonicalHeaders}\n{headers}\nUNSIGNED-PAYLOAD";
        var scope = string.Join("/", credential.Skip(1));
        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
        var toSign = $"AWS4-HMAC-SHA256\n{query["X-Amz-Date"]}\n{scope}\n{hash}";
        var signingKey = Encoding.UTF8.GetBytes("AWS4receipt-test-secret");
        foreach (var part in credential.Skip(1))
            signingKey = HMACSHA256.HashData(signingKey, Encoding.UTF8.GetBytes(part));
        var signature = Convert.ToHexStringLower(
            HMACSHA256.HashData(signingKey, Encoding.UTF8.GetBytes(toSign)));
        Assert.Equal(query["X-Amz-Signature"].ToString(), signature);
    }
}
