using Amazon.S3;
using Amazon.S3.Model;

namespace Kakeibo.Api.Services;

public sealed record ReceiptUploadUrlResponse(
    string UploadUrl, string Key, DateTimeOffset ExpiresAt, Dictionary<string, string> Headers);

public sealed class ReceiptUploadUrlService(
    IAmazonS3 s3, IConfiguration configuration, TimeProvider timeProvider)
{
    public ReceiptUploadUrlResponse Create(string contentType)
    {
        var bucket = configuration["Receipts:BucketName"];
        if (string.IsNullOrWhiteSpace(bucket))
            throw new InvalidOperationException("レシート保存先が設定されていません。");

        var extension = contentType switch
        {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            _ => throw new ArgumentException("対応していない画像形式です。", nameof(contentType)),
        };
        var key = $"receipts/{Guid.NewGuid():N}.{extension}";
        var expiresAt = timeProvider.GetUtcNow().AddMinutes(5);
        var url = s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = key,
            Verb = HttpVerb.PUT,
            Expires = expiresAt.UtcDateTime,
            ContentType = contentType,
            Protocol = Protocol.HTTPS,
        });
        return new ReceiptUploadUrlResponse(
            url, key, expiresAt, new Dictionary<string, string> { ["Content-Type"] = contentType });
    }
}
