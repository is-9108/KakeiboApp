using Kakeibo.Api.Data;
using Kakeibo.Api.Models;

namespace Kakeibo.Api.Endpoints;

/// <summary>収支のリクエスト。メモ以外は必須（未指定は400）。</summary>
public sealed record EntryRequest(DateOnly? Date, string? Type, int? Amount, string? Category, string? Memo);

/// <summary>収支のレスポンス。</summary>
public sealed record EntryResponse(int Id, DateOnly Date, string Type, int Amount, string Category, string Memo)
{
    public static EntryResponse From(Entry entry) =>
        new(entry.Id, entry.Date, entry.Type, entry.Amount, entry.Category, entry.Memo);
}

/// <summary>収支の登録・一覧・編集・削除（/api/entries）。</summary>
public static class EntriesEndpoints
{
    public static void MapEntriesEndpoints(this IEndpointRouteBuilder app)
    {
        var entries = app.MapGroup("/api/entries");

        entries.MapPost("/", async (EntryRequest request, KakeiboDbContext db) =>
        {
            var entry = new Entry
            {
                Date = request.Date!.Value,
                Type = request.Type!,
                Amount = request.Amount!.Value,
                Category = request.Category!,
                Memo = request.Memo ?? "",
            };
            db.Entries.Add(entry);
            await db.SaveChangesAsync();

            return Results.Created($"/api/entries/{entry.Id}", EntryResponse.From(entry));
        });
    }
}
