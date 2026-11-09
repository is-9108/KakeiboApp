using System.Globalization;
using System.Text.RegularExpressions;
using Kakeibo.Api.Services;
using Microsoft.Extensions.Logging;

namespace Kakeibo.MonthlyBatch;

public sealed class SubscriptionRegistrationHandler(
    Func<DateOnly, CancellationToken, Task<SubscriptionRegistrationResult>> register,
    ILogger<SubscriptionRegistrationHandler> logger)
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
            var targetMonth = new DateOnly(jst.Year, jst.Month, 1);
            month = targetMonth.ToString("yyyy-MM", CultureInfo.InvariantCulture);
            stage = "登録";
            await register(targetMonth, cancellationToken);
        }
        catch (Exception exception)
        {
            // 例外そのものや外部入力を渡すと接続情報・メモ等がログへ出るため、種別だけ記録する。
            logger.LogError("月初サブスク登録失敗 工程={Stage} 対象月={Month} 例外種別={ExceptionType}", stage, month, exception.GetType().Name);
            throw;
        }
    }
}
