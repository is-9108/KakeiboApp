using System.Globalization;
using System.Text.RegularExpressions;
using Kakeibo.Api.Endpoints;
using Microsoft.Extensions.Logging;

namespace Kakeibo.MonthlyBatch;

public sealed class MonthlyNotificationHandler(
    Func<string, CancellationToken, Task<MonthlySummaryResponse>> getSummary,
    IMonthlyNotificationSender sender,
    IMonthlyNotificationDeliveryStore deliveryStore,
    ILogger<MonthlyNotificationHandler> logger)
{
    public async Task HandleAsync(MonthlyNotificationRequest request, CancellationToken cancellationToken = default)
    {
        var stage = "入力";
        string? month = null;
        try
        {
            var targetMonth = GetTargetMonth(request?.ScheduledTime);
            month = targetMonth.ToString("yyyy-MM", CultureInfo.InvariantCulture);
            stage = "台帳参照";
            var delivery = await deliveryStore.FindAsync(targetMonth, cancellationToken);
            if (delivery is not null)
            {
                LogSkipped(stage, month, delivery.AcceptedAt is null ? "送信権確保中・結果不明" : "受理済み");
                return;
            }
            stage = "集計";
            var summary = await getSummary(month, cancellationToken);
            stage = "本文生成";
            var message = MonthlyNotificationMessage.Create(summary);
            stage = "送信権確保";
            if (!await deliveryStore.TryClaimAsync(targetMonth, cancellationToken))
            {
                LogSkipped(stage, month, "送信権の競合");
                return;
            }
            stage = "送信";
            await sender.SendAsync(message, cancellationToken);
            stage = "受理記録";
            await deliveryStore.MarkAcceptedAsync(targetMonth, cancellationToken);
        }
        catch (Exception exception)
        {
            // 例外そのものや外部入力を渡すと接続情報・メール本文等がログへ出るため、種別だけ記録する。
            logger.LogError("月次通知失敗 工程={Stage} 対象月={Month} 例外種別={ExceptionType}", stage, month, exception.GetType().Name);
            throw;
        }
    }

    private void LogSkipped(string stage, string month, string result)
        => logger.LogInformation("月次通知スキップ 工程={Stage} 対象月={Month} 結果={Result}", stage, month, result);

    private static DateOnly GetTargetMonth(string? scheduledTime)
    {
        if (scheduledTime is null || !Regex.IsMatch(scheduledTime, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$")
            || !DateTimeOffset.TryParse(scheduledTime, CultureInfo.InvariantCulture, DateTimeStyles.None, out var scheduled))
        {
            throw new ArgumentException("scheduledTimeにはオフセット付きISO日時が必要です。");
        }
        var jst = scheduled.ToOffset(TimeSpan.FromHours(9));
        return new DateOnly(jst.Year, jst.Month, 1).AddMonths(-1);
    }
}
