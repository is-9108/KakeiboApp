using Amazon.Lambda.Core;
using Amazon.Lambda.RuntimeSupport;
using Amazon.Lambda.Serialization.SystemTextJson;
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
        if (MonthlyBatchJobResolver.Resolve(Environment.GetEnvironmentVariable("MonthlyBatch__Job")) == MonthlyBatchJob.Subscription)
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
