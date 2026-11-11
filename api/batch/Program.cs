using Amazon.BedrockRuntime;
using Amazon.Lambda.Core;
using Amazon.Lambda.RuntimeSupport;
using Amazon.Lambda.Serialization.SystemTextJson;
using Amazon.S3;
using Amazon.SimpleNotificationService;
using Kakeibo.Api.Data;
using Kakeibo.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Kakeibo.MonthlyBatch;

public static class BatchProgram
{
    public static async Task Main()
    {
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var job = MonthlyBatchJobResolver.Resolve(Environment.GetEnvironmentVariable("MonthlyBatch__Job"));
        if (job == MonthlyBatchJob.ReceiptAnalysis)
        {
            var analysisLogger = loggerFactory.CreateLogger<ReceiptAnalysisHandler>();
            async Task InvokeAnalysis(ReceiptAnalysisEvent request, ILambdaContext context)
            {
                try
                {
                    using var s3 = new AmazonS3Client(new AmazonS3Config { MaxErrorRetry = 0 });
                    using var bedrock = new AmazonBedrockRuntimeClient(new AmazonBedrockRuntimeConfig { MaxErrorRetry = 0 });
                    Task<KakeiboDbContext> CreateDb(CancellationToken cancellationToken)
                    {
                        var options = new DbContextOptionsBuilder<KakeiboDbContext>()
                            .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")).Options;
                        return Task.FromResult(new KakeiboDbContext(options));
                    }
                    var modelId = Environment.GetEnvironmentVariable("ReceiptAnalysis__ModelId")
                        ?? throw new InvalidOperationException("解析モデルが設定されていません。");
                    var bucket = Environment.GetEnvironmentVariable("Receipts__BucketName")
                        ?? throw new InvalidOperationException("レシート保存先が設定されていません。");
                    await new ReceiptAnalysisHandler(CreateDb, new S3ReceiptImageReader(s3),
                        new BedrockReceiptModelClient(bedrock, modelId), bucket, TimeProvider.System, analysisLogger).HandleAsync(request);
                }
                catch (Exception exception)
                {
                    analysisLogger.LogError("解析起動失敗 工程={Stage} ジョブID={JobId} 例外種別={ExceptionType}",
                        "起動またはDB更新", (Guid?)null, exception.GetType().Name);
                    throw new InvalidOperationException("レシート解析に失敗しました。工程ログを確認してください。");
                }
            }
            await LambdaBootstrapBuilder.Create<ReceiptAnalysisEvent>(InvokeAnalysis, new DefaultLambdaJsonSerializer()).Build().RunAsync();
            return;
        }
        if (job == MonthlyBatchJob.Subscription)
        {
            var registrationLogger = loggerFactory.CreateLogger<SubscriptionRegistrationHandler>();
            async Task InvokeRegistration(MonthlyNotificationRequest request, ILambdaContext context)
            {
                try
                {
                    async Task<SubscriptionRegistrationResult> Register(DateOnly targetMonth, CancellationToken cancellationToken)
                    {
                        var options = new DbContextOptionsBuilder<KakeiboDbContext>()
                            .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")).Options;
                        await using var db = new KakeiboDbContext(options);
                        return await new SubscriptionRegistrationService(db).RegisterAsync(targetMonth, cancellationToken);
                    }
                    await new SubscriptionRegistrationHandler(Register, registrationLogger).HandleAsync(request);
                }
                catch (Exception exception)
                {
                    registrationLogger.LogError("月初サブスク登録起動失敗 リクエストID={RequestId} 例外種別={ExceptionType}", context.AwsRequestId, exception.GetType().Name);
                    // ランタイムが例外を自動記録するため、元例外・InnerExceptionを境界外へ出さない。
                    throw new InvalidOperationException("月初サブスク登録に失敗しました。工程ログを確認してください。");
                }
            }
            await LambdaBootstrapBuilder.Create<MonthlyNotificationRequest>(InvokeRegistration, new DefaultLambdaJsonSerializer()).Build().RunAsync();
            return;
        }

        var logger = loggerFactory.CreateLogger<MonthlyNotificationHandler>();
        async Task Invoke(MonthlyNotificationRequest request, ILambdaContext context)
        {
            try
            {
                // APIのProgramや起動時マイグレーションを呼ばず、リクエストごとに読取用Contextだけ作る。
                using var sns = new AmazonSimpleNotificationServiceClient(new AmazonSimpleNotificationServiceConfig { MaxErrorRetry = 0 });
                var sender = new SnsMonthlyNotificationSender(sns,
                    Environment.GetEnvironmentVariable("MonthlyNotification__TopicArn")
                    ?? throw new InvalidOperationException("通知設定がありません。"));
                async Task<Kakeibo.Api.Endpoints.MonthlySummaryResponse> GetSummary(string month, CancellationToken cancellationToken)
                {
                    var options = new DbContextOptionsBuilder<KakeiboDbContext>()
                        .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")).Options;
                    await using var db = new KakeiboDbContext(options);
                    return await new MonthlySummaryService(db).GetAsync(month, cancellationToken);
                }
                await new MonthlyNotificationHandler(GetSummary, sender, logger).HandleAsync(request);
            }
            catch (Exception exception)
            {
                logger.LogError("月次通知起動失敗 リクエストID={RequestId} 例外種別={ExceptionType}", context.AwsRequestId, exception.GetType().Name);
                // ランタイムが例外を自動記録するため、元例外・InnerExceptionを境界外へ出さない。
                throw new InvalidOperationException("月次通知に失敗しました。工程ログを確認してください。");
            }
        }
        await LambdaBootstrapBuilder.Create<MonthlyNotificationRequest>(Invoke, new DefaultLambdaJsonSerializer()).Build().RunAsync();
    }
}
