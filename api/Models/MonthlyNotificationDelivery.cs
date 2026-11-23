namespace Kakeibo.Api.Models;

public sealed class MonthlyNotificationDelivery
{
    public DateOnly TargetMonth { get; init; }
    public DateTimeOffset ClaimedAt { get; init; }

    // null は送信権確保中（SNS の受理結果が不明な場合を含む）。
    public DateTimeOffset? AcceptedAt { get; set; }
}
