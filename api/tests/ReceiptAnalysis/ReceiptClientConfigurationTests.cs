using Kakeibo.MonthlyBatch;

namespace Kakeibo.Api.Tests.ReceiptAnalysis;

public class ReceiptClientConfigurationTests
{
    [Fact]
    public void 外部呼び出しのタイムアウトはLambdaの制限より短く再試行しない()
    {
        var s3 = BatchProgram.CreateReceiptS3Config();
        var bedrock = BatchProgram.CreateReceiptBedrockConfig();
        Assert.Equal(TimeSpan.FromSeconds(10), s3.Timeout);
        Assert.Equal(TimeSpan.FromSeconds(30), bedrock.Timeout);
        Assert.True(s3.Timeout > TimeSpan.Zero && s3.Timeout < TimeSpan.FromSeconds(60));
        Assert.True(bedrock.Timeout > TimeSpan.Zero && bedrock.Timeout < TimeSpan.FromSeconds(60));
        Assert.True(s3.Timeout + bedrock.Timeout < TimeSpan.FromSeconds(60));
        Assert.Equal(0, s3.MaxErrorRetry);
        Assert.Equal(0, bedrock.MaxErrorRetry);
    }
}
