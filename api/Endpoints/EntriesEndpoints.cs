using System.Globalization;
using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;

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
            var errors = Validate(request);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }

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

        entries.MapGet("/", async (KakeiboDbContext db, string? month) =>
        {
            if (!DateOnly.TryParseExact(
                    month, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var firstDay))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["month"] = ["monthはYYYY-MM形式で指定してください。"],
                });
            }

            var lastDay = new DateOnly(
                firstDay.Year, firstDay.Month, DateTime.DaysInMonth(firstDay.Year, firstDay.Month));
            var list = await db.Entries
                .Where(e => e.Date >= firstDay && e.Date <= lastDay)
                .OrderByDescending(e => e.Date)
                .ThenBy(e => e.Id)
                .ToListAsync();

            return Results.Ok(list.Select(EntryResponse.From));
        });

        entries.MapPut("/{id:int}", async (int id, EntryRequest request, KakeiboDbContext db) =>
        {
            var errors = Validate(request);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }

            var entry = await db.Entries.FindAsync(id);
            if (entry is null)
            {
                return Results.NotFound();
            }

            entry.Date = request.Date!.Value;
            entry.Type = request.Type!;
            entry.Amount = request.Amount!.Value;
            entry.Category = request.Category!;
            entry.Memo = request.Memo ?? "";
            await db.SaveChangesAsync();

            return Results.Ok(EntryResponse.From(entry));
        });
    }

    /// <summary>登録・編集リクエストのバリデーション。エラーがあれば項目ごとのメッセージを返す。</summary>
    private static Dictionary<string, string[]> Validate(EntryRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Date is null)
        {
            errors["date"] = ["日付は必須です。"];
        }

        if (string.IsNullOrEmpty(request.Type) || !Presets.Types.Contains(request.Type))
        {
            errors["type"] = ["種別は「収入」または「支出」を指定してください。"];
        }

        if (request.Amount is null or < 1)
        {
            errors["amount"] = ["金額は1以上の整数を指定してください。"];
        }

        if (request.Type is not null && Presets.Types.Contains(request.Type)
            && (string.IsNullOrEmpty(request.Category)
                || !Presets.CategoriesFor(request.Type).Contains(request.Category)))
        {
            errors["category"] = ["カテゴリは種別に対応するプリセットから指定してください。"];
        }

        return errors;
    }
}
