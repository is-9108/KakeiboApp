using System.Text.Json.Serialization;

namespace Kakeibo.MonthlyBatch;

public sealed record MonthlyNotificationRequest([property: JsonPropertyName("scheduledTime")] string? ScheduledTime);
