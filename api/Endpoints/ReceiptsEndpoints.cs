using System.Globalization;
using System.Text.Json;
using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Api.Endpoints;

public static class ReceiptsEndpoints
{
    public sealed record UploadUrlRequest(string? ContentType, JsonElement Size);

    public sealed record UploadUrlResponse(string UploadUrl, string Key, DateTimeOffset ExpiresAt,
        Dictionary<string, string> Headers, Guid JobId);

    public sealed record AnalysisResponse(Guid Id, string Status, string? Date, int? Amount,
        string? StoreName, string? Category, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

    public static void MapReceiptsEndpoints(this WebApplication app)
    {
        app.MapPost("/api/receipts/upload-url", async (
            UploadUrlRequest request, IConfiguration configuration, IServiceProvider services,
            KakeiboDbContext db, TimeProvider clock, CancellationToken ct) =>
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
            var target = services.GetRequiredService<ReceiptUploadUrlService>().Create(request.ContentType!);
            var now = clock.GetUtcNow();
            var job = new ReceiptAnalysisJob
            {
                Id = Guid.NewGuid(), ObjectKey = target.Key,
                CreatedAt = now, UpdatedAt = now,
            };
            db.ReceiptAnalysisJobs.Add(job);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new UploadUrlResponse(target.UploadUrl, target.Key, target.ExpiresAt, target.Headers, job.Id));
        });
        app.MapGet("/api/receipts/{id:guid}", async (Guid id, KakeiboDbContext db, CancellationToken ct) =>
        {
            var job = await db.ReceiptAnalysisJobs.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (job is null) return Results.NotFound();
            return Results.Ok(new AnalysisResponse(job.Id, job.Status,
                job.ReceiptDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), job.TotalAmount,
                job.StoreName, job.Category, job.CreatedAt, job.UpdatedAt));
        });
    }
}
