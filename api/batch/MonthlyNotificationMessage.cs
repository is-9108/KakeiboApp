using System.Globalization;
using Kakeibo.Api.Endpoints;

namespace Kakeibo.MonthlyBatch;

public sealed record MonthlyNotificationMessage(string Subject, string Body)
{
    public static MonthlyNotificationMessage Create(MonthlySummaryResponse summary)
    {
        var date = DateOnly.ParseExact(summary.Month, "yyyy-MM", CultureInfo.InvariantCulture);
        var month = FormattableString.Invariant($"{date.Year:0000} 年 {date.Month} 月");
        var lines = new List<string>
        {
            month,
            FormattableString.Invariant($"収入合計: {summary.IncomeTotal} 円"),
            FormattableString.Invariant($"支出合計: {summary.ExpenseTotal} 円"),
            FormattableString.Invariant($"収支差額: {summary.Balance} 円"),
            "",
            "カテゴリ別支出",
        };
        if (summary.ExpenseBreakdown.Count == 0)
        {
            lines.Add("支出内訳なし（0 円）");
        }
        else
        {
            lines.AddRange(summary.ExpenseBreakdown.Select(row =>
                FormattableString.Invariant($"{row.Category}: {row.Amount} 円（{row.Percentage:0.0}%）")));
        }
        return new($"家計簿 月次集計 {month}", string.Join("\n", lines));
    }
}
