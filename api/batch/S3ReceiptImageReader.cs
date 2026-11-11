using Amazon.S3.Model;
using Amazon.S3;

namespace Kakeibo.MonthlyBatch;

public sealed record ReceiptImage(byte[] Bytes, string Format);

public interface IReceiptImageReader
{
    Task<ReceiptImage> ReadAsync(string bucket, string key, CancellationToken cancellationToken);
}

public sealed class S3ReceiptImageReader(IAmazonS3 s3) : IReceiptImageReader
{
    public async Task<ReceiptImage> ReadAsync(string bucket, string key, CancellationToken cancellationToken)
    {
        var format = Path.GetExtension(key) switch
        {
            ".jpg" => "jpeg", ".png" => "png", ".webp" => "webp",
            _ => throw new InvalidOperationException("対応していない画像形式です。"),
        };
        using var response = await s3.GetObjectAsync(new GetObjectRequest { BucketName = bucket, Key = key }, cancellationToken);
        using var buffer = new MemoryStream();
        await response.ResponseStream.CopyToAsync(buffer, cancellationToken);
        return new ReceiptImage(buffer.ToArray(), format);
    }
}
