using System.Globalization;
using System.Text.RegularExpressions;
using Kakeibo.Api.Endpoints;
using Microsoft.Extensions.Logging;

namespace Kakeibo.MonthlyBatch;

public sealed class MonthlyNotificationHandler(
    Func<string, CancellationToken, Task<MonthlySummaryResponse>> getSummary,
    IMonthlyNotificationSender sender,
    ILogger<MonthlyNotificationHandler> logger)
{
    public async Task HandleAsync(MonthlyNotificationRequest request, CancellationToken cancellationToken = default)
    {
        var stage = "入力";
        string? month = null;
        try
        {
            var value = request?.ScheduledTime;
            if (value is null || !Regex.IsMatch(value, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$")
                || !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var scheduled))
            {
                throw new ArgumentException("scheduledTimeにはオフセット付きISO日時が必要です。");
            }
            var jst = scheduled.ToOffset(TimeSpan.FromHours(9));
            month = new DateOnly(jst.Year, jst.Month, 1).AddMonths(-1).ToString("yyyy-MM", CultureInfo.InvariantCulture);
            stage = "集計";
            var summary = await getSummary(month, cancellationToken);
            stage = "本文生成";
            var message = MonthlyNotificationMessage.Create(summary);
            stage = "送信";
            await sender.SendAsync(message, cancellationToken);
        }
        catch (Exception exception)
        {
            // 例外そのものや外部入力を渡すと接続情報・メール本文等がログへ出るため、種別だけ記録する。
            logger.LogError("月次通知失敗 工程={Stage} 対象月={Month} 例外種別={ExceptionType}", stage, month, exception.GetType().Name);
            throw;
        }
    }
}
