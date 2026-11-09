using System.Text.Json;
using Kakeibo.Api.Services;

namespace Kakeibo.Api.Endpoints;

public static class ReceiptsEndpoints
{
    public sealed record UploadUrlRequest(string? ContentType, JsonElement Size);

    public static void MapReceiptsEndpoints(this WebApplication app)
    {
        app.MapPost("/api/receipts/upload-url", (
            UploadUrlRequest request, IConfiguration configuration, IServiceProvider services) =>
        {
            var errors = new Dictionary<string, string[]>();
            if (request.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
                errors["contentType"] = ["JPEG、PNG、WebPの画像を選択してください。"];
            if (request.Size.ValueKind != JsonValueKind.Number ||
                !request.Size.TryGetInt64(out var size) || size is < 1 or > 10 * 1024 * 1024)
                errors["size"] = ["画像は1バイト以上10 MiB以下にしてください。"];
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            if (string.IsNullOrWhiteSpace(configuration["Receipts:BucketName"]))
                return Results.Problem("レシート保存先が設定されていません。", statusCode: 500);
            return Results.Ok(services.GetRequiredService<ReceiptUploadUrlService>().Create(request.ContentType!));
        });
    }
}
