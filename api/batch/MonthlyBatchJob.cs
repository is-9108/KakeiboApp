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
        return jobName == "subscription" ? MonthlyBatchJob.Subscription : MonthlyBatchJob.Notification;
    }
}
