using Kakeibo.MonthlyBatch;

namespace Kakeibo.Api.Tests.MonthlyBatch;

public class MonthlyBatchJobResolverTests
{
    [Theory]
    [InlineData("subscription", MonthlyBatchJob.Subscription)]
    [InlineData(null, MonthlyBatchJob.Notification)]
    [InlineData("notification", MonthlyBatchJob.Notification)]
    [InlineData("subscriptions", MonthlyBatchJob.Notification)]
    [InlineData("Subscription", MonthlyBatchJob.Notification)]
    [InlineData("", MonthlyBatchJob.Notification)]
    public void ジョブ名が完全一致する場合だけサブスク登録を選びそれ以外は通知を選ぶ(string? jobName, MonthlyBatchJob expected)
    {
        Assert.Equal(expected, MonthlyBatchJobResolver.Resolve(jobName));
    }
}
