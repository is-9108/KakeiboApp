using Kakeibo.MonthlyBatch;

namespace Kakeibo.Api.Tests.MonthlyBatch;

public class MonthlyBatchJobResolverTests
{
    [Theory]
    [InlineData("subscription", MonthlyBatchJob.Subscription)]
    [InlineData(null, MonthlyBatchJob.Notification)]
    [InlineData("notification", MonthlyBatchJob.Notification)]
    public void 未設定または既知のジョブ名なら対応するジョブを選ぶ(string? jobName, MonthlyBatchJob expected)
    {
        Assert.Equal(expected, MonthlyBatchJobResolver.Resolve(jobName));
    }

    [Theory]
    [InlineData("subscriptions")]
    [InlineData("Subscription")]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData(" subscription")]
    [InlineData("subscription ")]
    [InlineData("NOTIFICATION")]
    public void 未知のジョブ名なら例外を投げる(string jobName)
    {
        Assert.Throws<InvalidOperationException>(() => MonthlyBatchJobResolver.Resolve(jobName));
    }
}
