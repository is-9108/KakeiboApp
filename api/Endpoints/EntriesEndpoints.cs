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

/// <summary>月次集計のレスポンス。</summary>
public sealed record MonthlySummaryResponse(
    string Month,
    int IncomeTotal,
    int ExpenseTotal,
    int Balance,
    IReadOnlyList<ExpenseCategoryBreakdown> ExpenseBreakdown);

/// <summary>カテゴリ別の支出内訳。Percentageは支出合計に対する割合（小数第1位で四捨五入）。</summary>
public sealed record ExpenseCategoryBreakdown(string Category, int Amount, decimal Percentage);

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
            if (TryParseMonthRange(month) is not (var firstDay, var lastDay))
            {
                return MonthRequired();
            }

            var list = await db.Entries
                .Where(e => e.Date >= firstDay && e.Date <= lastDay)
                .OrderByDescending(e => e.Date)
                .ThenBy(e => e.Id)
                .ToListAsync();

            return Results.Ok(list.Select(EntryResponse.From));
        });

        entries.MapGet("/summary", async (KakeiboDbContext db, string? month) =>
        {
            if (TryParseMonthRange(month) is not (var firstDay, var lastDay))
            {
                return MonthRequired();
            }

            var monthEntries = await db.Entries
                .Where(e => e.Date >= firstDay && e.Date <= lastDay)
                .ToListAsync();
            var incomeTotal = monthEntries.Where(e => e.Type == Presets.Income).Sum(e => e.Amount);
            var expenseTotal = monthEntries.Where(e => e.Type == Presets.Expense).Sum(e => e.Amount);
            var breakdown = monthEntries
                .Where(e => e.Type == Presets.Expense)
                .GroupBy(e => e.Category, StringComparer.Ordinal)
                .Select(g => new ExpenseCategoryBreakdown(
                    g.Key,
                    g.Sum(e => e.Amount),
                    Percentage(g.Sum(e => e.Amount), expenseTotal)))
                .OrderByDescending(b => b.Amount)
                .ThenBy(b => b.Category, StringComparer.Ordinal)
                .ToList();

            return Results.Ok(new MonthlySummaryResponse(
                month!, incomeTotal, expenseTotal, incomeTotal - expenseTotal, breakdown));
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

        entries.MapDelete("/{id:int}", async (int id, KakeiboDbContext db) =>
        {
            var entry = await db.Entries.FindAsync(id);
            if (entry is null)
            {
                return Results.NotFound();
            }

            db.Entries.Remove(entry);
            await db.SaveChangesAsync();

            return Results.NoContent();
        });
    }

    /// <summary>monthパラメータを厳密なYYYY-MMで解析し、その月の最初と最後の日を返す。不正な形式はnull。</summary>
    private static (DateOnly FirstDay, DateOnly LastDay)? TryParseMonthRange(string? month)
    {
        if (!DateOnly.TryParseExact(
                month, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var firstDay))
        {
            return null;
        }

        var lastDay = new DateOnly(
            firstDay.Year, firstDay.Month, DateTime.DaysInMonth(firstDay.Year, firstDay.Month));
        return (firstDay, lastDay);
    }

    /// <summary>monthパラメータが不正なときの400レスポンス。</summary>
    private static IResult MonthRequired() => Results.ValidationProblem(new Dictionary<string, string[]>
    {
        ["month"] = ["monthはYYYY-MM形式で指定してください。"],
    });

    /// <summary>構成比（支出合計に対する割合）。支出合計が0の月は0。小数第1位で四捨五入する。</summary>
    private static decimal Percentage(int amount, int expenseTotal)
    {
        if (expenseTotal == 0)
        {
            return 0;
        }

        return Math.Round(amount * 100m / expenseTotal, 1, MidpointRounding.AwayFromZero);
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
