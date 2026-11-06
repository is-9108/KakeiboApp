using Amazon.SimpleNotificationService;
using Amazon.SimpleNotificationService.Model;

namespace Kakeibo.MonthlyBatch;

public interface IMonthlyNotificationSender
{
    Task SendAsync(MonthlyNotificationMessage message, CancellationToken cancellationToken = default);
}

public sealed class SnsMonthlyNotificationSender(IAmazonSimpleNotificationService sns, string topicArn) : IMonthlyNotificationSender
{
    public async Task SendAsync(MonthlyNotificationMessage message, CancellationToken cancellationToken = default)
    {
        await sns.PublishAsync(new PublishRequest
        {
            TopicArn = topicArn,
            Subject = message.Subject,
            Message = message.Body,
        }, cancellationToken);
    }
}
