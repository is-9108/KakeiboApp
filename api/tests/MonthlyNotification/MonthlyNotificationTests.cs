using System.Globalization;
using Amazon.SimpleNotificationService;
using Amazon.SimpleNotificationService.Model;
using Kakeibo.Api.Endpoints;
using Kakeibo.MonthlyBatch;
using Microsoft.Extensions.Logging;

namespace Kakeibo.Api.Tests.MonthlyNotification;

public class MonthlyNotificationTests
{
    [Theory]
    [InlineData("2031-01-31T15:10:00Z", "2031-01")]
    [InlineData("2031-01-01T00:10:00+09:00", "2030-12")]
    [InlineData("2032-02-29T15:10:00Z", "2032-02")]
    public async Task 予定日時の日本時間の前月を再試行でも使う(string time, string expected)
    {
        var months = new List<string>();
        var sender = new RecordingSender();
        var handler = new MonthlyNotificationHandler((month, _) =>
        {
            months.Add(month);
            return Task.FromResult(new MonthlySummaryResponse(month, 0, 0, 0, []));
        }, sender, new RecordingLogger());
        await handler.HandleAsync(new(time));
        await handler.HandleAsync(new(time));
        Assert.Equal(new[] { expected, expected }, months);
        Assert.Equal(2, sender.Messages.Count);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("不正")]
    [InlineData("2031-02-01T00:10:00")]
    [InlineData("2031-02-30T00:10:00Z")]
    public async Task 不正日時では取得も送信もしない(string? time)
    {
        var sender = new RecordingSender();
        var logger = new RecordingLogger();
        var handler = new MonthlyNotificationHandler((_, _) => throw new Exception("取得してはいけない"), sender, logger);
        await Assert.ThrowsAsync<ArgumentException>(() => handler.HandleAsync(new(time)));
        Assert.Empty(sender.Messages);
        Assert.Contains(logger.Messages, m => m.Contains("入力"));
    }

    [Fact]
    public void 日本語本文は全項目を順序どおり環境に依存せず表示する()
    {
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            var message = MonthlyNotificationMessage.Create(new("2031-01", 10, 80, -70,
                [new("外食費", 53, 66.3m), new("食費", 27, 33.8m)]));
            Assert.Equal("家計簿 月次集計 2031 年 1 月", message.Subject);
            Assert.Equal("2031 年 1 月\n収入合計: 10 円\n支出合計: 80 円\n収支差額: -70 円\n\nカテゴリ別支出\n外食費: 53 円（66.3%）\n食費: 27 円（33.8%）", message.Body);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(100, 0)]
    [InlineData(0, 100)]
    public async Task ゼロ件と片側だけの月も一回送信する(int income, int expense)
    {
        var sender = new RecordingSender();
        var handler = new MonthlyNotificationHandler((month, _) => Task.FromResult(new MonthlySummaryResponse(
            month, income, expense, income - expense, expense == 0 ? [] : [new("食費", expense, 100m)])), sender, new RecordingLogger());
        await handler.HandleAsync(new("2031-02-01T00:10:00+09:00"));
        var message = Assert.Single(sender.Messages);
        Assert.Contains($"収入合計: {income} 円", message.Body);
        Assert.Contains($"支出合計: {expense} 円", message.Body);
        Assert.Contains($"収支差額: {income - expense} 円", message.Body);
        Assert.Contains(expense == 0 ? "支出内訳なし（0 円）" : "食費: 100 円（100.0%）", message.Body);
    }

    [Theory]
    [InlineData(false, "集計")]
    [InlineData(true, "送信")]
    public async Task 障害は安全なログを残し再送せず呼出元へ伝播する(bool publishFailure, string stage)
    {
        const string sensitive = "接続情報・通知先@example.com・本文・収支メモ";
        var failure = new InvalidOperationException(sensitive);
        var sender = new RecordingSender { Failure = publishFailure ? failure : null };
        var logger = new RecordingLogger();
        var handler = new MonthlyNotificationHandler((month, _) => publishFailure
            ? Task.FromResult(new MonthlySummaryResponse(month, 0, 0, 0, []))
            : throw failure, sender, logger);
        Assert.Same(failure, await Assert.ThrowsAsync<InvalidOperationException>(() => handler.HandleAsync(new("2031-02-01T00:10:00+09:00"))));
        Assert.Equal(publishFailure ? 1 : 0, sender.Messages.Count);
        Assert.Contains(logger.Messages, m => m.Contains(stage) && m.Contains(nameof(InvalidOperationException)));
        Assert.All(logger.Messages, m => Assert.DoesNotContain(sensitive, m));
    }

    [Fact]
    public async Task SNS境界へトピックと件名と本文を一度だけ渡す()
    {
        using var sns = new RecordingSns();
        var message = new MonthlyNotificationMessage("件名", "本文");
        await new SnsMonthlyNotificationSender(sns, "arn:aws:sns:ap-northeast-1:123456789012:test").SendAsync(message);
        var request = Assert.Single(sns.Requests);
        Assert.Equal("arn:aws:sns:ap-northeast-1:123456789012:test", request.TopicArn);
        Assert.Equal(message.Subject, request.Subject);
        Assert.Equal(message.Body, request.Message);
    }

    private sealed class RecordingSns() : AmazonSimpleNotificationServiceClient(new Amazon.Runtime.AnonymousAWSCredentials(), Amazon.RegionEndpoint.APNortheast1)
    {
        public List<PublishRequest> Requests { get; } = [];
        public override Task<PublishResponse> PublishAsync(PublishRequest request, CancellationToken cancellationToken = default)
        {
            Requests.Add(request);
            return Task.FromResult(new PublishResponse());
        }
    }

    internal sealed class RecordingSender : IMonthlyNotificationSender
    {
        public List<MonthlyNotificationMessage> Messages { get; } = [];
        public Exception? Failure { get; init; }
        public Task SendAsync(MonthlyNotificationMessage message, CancellationToken cancellationToken = default)
        {
            Messages.Add(message);
            return Failure is null ? Task.CompletedTask : Task.FromException(Failure);
        }
    }

    internal sealed class RecordingLogger : ILogger<MonthlyNotificationHandler>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Assert.Equal(LogLevel.Error, level);
            Assert.Null(exception);
            Messages.Add(formatter(state, exception));
        }
    }
}
