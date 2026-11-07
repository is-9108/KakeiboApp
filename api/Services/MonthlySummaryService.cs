using System.Globalization;
using Kakeibo.Api.Data;
using Kakeibo.Api.Endpoints;
using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Api.Services;

/// <summary>APIと通知で共有する月次の読み取り専用集計。</summary>
public sealed class MonthlySummaryService(KakeiboDbContext db)
{
    public async Task<MonthlySummaryResponse> GetAsync(string month, CancellationToken cancellationToken = default)
    {
        var firstDay = DateOnly.ParseExact(month, "yyyy-MM", CultureInfo.InvariantCulture);
        var lastDay = new DateOnly(firstDay.Year, firstDay.Month, DateTime.DaysInMonth(firstDay.Year, firstDay.Month));
        var monthEntries = await db.Entries.AsNoTracking()
            .Where(e => e.Date >= firstDay && e.Date <= lastDay)
            .ToListAsync(cancellationToken);
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

        return new MonthlySummaryResponse(
            month, incomeTotal, expenseTotal, incomeTotal - expenseTotal, breakdown);
    }

    /// <summary>構成比（支出合計に対する割合）。支出合計が0の月は0。小数第1位で四捨五入する。</summary>
    private static decimal Percentage(int amount, int expenseTotal)
    {
        if (expenseTotal == 0)
        {
            return 0;
        }

        return Math.Round(amount * 100m / expenseTotal, 1, MidpointRounding.AwayFromZero);
    }
}
