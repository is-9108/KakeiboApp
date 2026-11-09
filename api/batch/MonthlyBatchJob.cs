namespace Kakeibo.MonthlyBatch;

public enum MonthlyBatchJob
{
    Notification,
    Subscription
}

public static class MonthlyBatchJobResolver
{
    public static MonthlyBatchJob Resolve(string? jobName)
    {
        return jobName switch
        {
            null or "notification" => MonthlyBatchJob.Notification,
            "subscription" => MonthlyBatchJob.Subscription,
            _ => throw new InvalidOperationException($"月次バッチのジョブ名が不正です: 「{jobName}」。")
        };
    }
}
