using System.Globalization;
using Kakeibo.Api.Services;
using Kakeibo.MonthlyBatch;
using Microsoft.Extensions.Logging;

namespace Kakeibo.Api.Tests.MonthlySubscription;

public class SubscriptionRegistrationHandlerTests
{
    [Theory]
    [InlineData("2031-01-31T15:05:00Z", "2031-02-01")]
    [InlineData("2031-02-01T00:05:00+09:00", "2031-02-01")]
    [InlineData("2030-12-31T15:05:00Z", "2031-01-01")]
    [InlineData("2032-02-29T15:05:00Z", "2032-03-01")]
    public async Task 過去未来を拒否せず予定日時の日本時間の月初を再試行でも渡す(string time, string expected)
    {
        var months = new List<DateOnly>();
        using var cancellation = new CancellationTokenSource();
        var handler = new SubscriptionRegistrationHandler((month, token) =>
        {
            Assert.Equal(cancellation.Token, token);
            months.Add(month);
            return Task.FromResult(new SubscriptionRegistrationResult(3, 0));
        }, new RecordingLogger());
        await handler.HandleAsync(new(time), cancellation.Token);
        await handler.HandleAsync(new(time), cancellation.Token);
        var first = DateOnly.ParseExact(expected, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        Assert.Equal(new[] { first, first }, months);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("不正な入力")]
    [InlineData("2031-02-01T00:05:00")]
    [InlineData("2031-02-30T00:05:00Z")]
    public async Task 不正日時は登録せず入力工程と例外種別のみログに残す(string? time)
    {
        var calls = 0;
        var logger = new RecordingLogger();
        var handler = new SubscriptionRegistrationHandler((_, _) =>
        {
            calls++;
            return Task.FromResult(new SubscriptionRegistrationResult(0, 0));
        }, logger);
        await Assert.ThrowsAsync<ArgumentException>(() => handler.HandleAsync(new(time)));
        Assert.Equal(0, calls);
        var log = Assert.Single(logger.Events);
        Assert.Equal("入力", log["Stage"]);
        Assert.Null(log["Month"]);
        Assert.Equal(nameof(ArgumentException), log["ExceptionType"]);
        Assert.Equal(new[] { "ExceptionType", "Month", "Stage" }, log.Keys.OrderBy(x => x, StringComparer.Ordinal));
        if (!string.IsNullOrEmpty(time)) Assert.DoesNotContain(time, Assert.Single(logger.Messages));
    }

    [Fact]
    public async Task 登録障害は工程と対象月と例外種別だけ記録し元例外を再スローする()
    {
        // 秘密情報は実値を使わず、漏出検知専用の文字列を使う。
        var forbidden = new[] { "非公開メモ", "987654321", "接続文字列ダミー", "例外本文ダミー" };
        var failure = new InvalidOperationException(string.Join(" / ", forbidden));
        var logger = new RecordingLogger();
        var calls = 0;
        var handler = new SubscriptionRegistrationHandler((_, _) =>
        {
            calls++;
            return Task.FromException<SubscriptionRegistrationResult>(failure);
        }, logger);
        Assert.Same(failure, await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.HandleAsync(new("2031-01-31T15:05:00Z"))));
        Assert.Equal(1, calls);
        var log = Assert.Single(logger.Events);
        Assert.Equal("登録", log["Stage"]);
        Assert.Equal("2031-02", log["Month"]);
        Assert.Equal(nameof(InvalidOperationException), log["ExceptionType"]);
        Assert.Equal(new[] { "ExceptionType", "Month", "Stage" }, log.Keys.OrderBy(x => x, StringComparer.Ordinal));
        var message = Assert.Single(logger.Messages);
        Assert.Contains("登録", message);
        Assert.Contains("2031-02", message);
        Assert.Contains(nameof(InvalidOperationException), message);
        foreach (var value in forbidden) Assert.DoesNotContain(value, message);
    }

    private sealed class RecordingLogger : ILogger<SubscriptionRegistrationHandler>
    {
        public List<string> Messages { get; } = [];
        public List<Dictionary<string, object?>> Events { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Assert.Equal(LogLevel.Error, level);
            Assert.Null(exception);
            Messages.Add(formatter(state, exception));
            var values = Assert.IsAssignableFrom<IEnumerable<KeyValuePair<string, object?>>>(state);
            Events.Add(values.Where(x => x.Key != "{OriginalFormat}").ToDictionary(x => x.Key, x => x.Value));
        }
    }
}
