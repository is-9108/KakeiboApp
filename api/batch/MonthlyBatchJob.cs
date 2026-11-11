namespace Kakeibo.MonthlyBatch;

public enum MonthlyBatchJob
{
    Notification,
    Subscription,
    ReceiptAnalysis
}

public static class MonthlyBatchJobResolver
{
    public static MonthlyBatchJob Resolve(string? jobName)
    {
        return jobName switch
        {
            null or "notification" => MonthlyBatchJob.Notification,
            "receipt-analysis" => MonthlyBatchJob.ReceiptAnalysis,
            "subscription" => MonthlyBatchJob.Subscription,
            _ => throw new InvalidOperationException($"月次バッチのジョブ名が不正です: 「{jobName}」。")
        };
    }
}
