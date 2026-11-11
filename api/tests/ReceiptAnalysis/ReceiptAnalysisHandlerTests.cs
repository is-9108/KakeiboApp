using System.Data.Common;
using System.Text.Json;
using Amazon.BedrockRuntime;
using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Kakeibo.Api.Tests.Infrastructure;
using Kakeibo.MonthlyBatch;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Kakeibo.Api.Tests.ReceiptAnalysis;

public class ReceiptAnalysisHandlerTests(KakeiboApiTestFactory factory) : IClassFixture<KakeiboApiTestFactory>
{
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 12, 0, 0, TimeSpan.Zero);
    private KakeiboDbContext CreateDb() => new(new DbContextOptionsBuilder<KakeiboDbContext>().UseNpgsql(factory.TestConnectionString).Options);

    private async Task<ReceiptAnalysisJob> SeedAsync(string status = "待機中")
    {
        using var client = factory.CreateClient();
        await using var db = CreateDb();
        var job = new ReceiptAnalysisJob
        {
            Id = Guid.NewGuid(), ObjectKey = $"receipts/{Guid.NewGuid():N}.jpg", Status = status,
            CreatedAt = Now.AddMinutes(-1), UpdatedAt = Now.AddMinutes(-1),
        };
        db.ReceiptAnalysisJobs.Add(job);
        await db.SaveChangesAsync();
        return job;
    }

    private static ReceiptAnalysisEvent Event(params (string Bucket, string Key)[] records) =>
        JsonSerializer.Deserialize<ReceiptAnalysisEvent>(JsonSerializer.Serialize(new
        {
            Records = records.Select(x => new { s3 = new { bucket = new { name = x.Bucket }, @object = new { key = x.Key } } }),
        }))!;

    private ReceiptAnalysisHandler Handler(IReceiptImageReader reader, Model model, Logger? logger = null) =>
        new(_ => Task.FromResult(CreateDb()), reader, model, "対象バケット", new Clock(), logger ?? new Logger());

    [Theory]
    [InlineData("{\"date\":\"2026-11-11\",\"amount\":1200,\"storeName\":\"店舗\",\"category\":\"食費\"}", 1200, "食費")]
    [InlineData("{\"amount\":1200,\"category\":\"給与\"}", 1200, null)]
    [InlineData("{}", null, null)]
    public async Task 正常応答は検証済み項目を保存し完了する(string text, int? amount, string? category)
    {
        var job = await SeedAsync();
        var reader = new ImageReader();
        var model = new Model { Text = text };
        await Handler(reader, model).HandleAsync(Event(("対象バケット", job.ObjectKey.Replace("/", "%2F"))));
        await using var db = CreateDb();
        var saved = await db.ReceiptAnalysisJobs.FindAsync(job.Id);
        Assert.Equal("完了", saved!.Status);
        Assert.Equal(amount, saved.TotalAmount);
        Assert.Equal(category, saved.Category);
        Assert.Equal(text.Contains("店舗") ? "店舗" : null, saved.StoreName);
        Assert.Equal(text.Contains("date") ? new DateOnly(2026, 11, 11) : (DateOnly?)null, saved.ReceiptDate);
        Assert.Equal(Now, saved.UpdatedAt);
        Assert.Equal(job.CreatedAt, saved.CreatedAt);
        Assert.Equal(("対象バケット", job.ObjectKey), Assert.Single(reader.Calls));
        Assert.Equal(1, model.Calls);
    }

    [Theory]
    [InlineData("モデル")]
    [InlineData("タイムアウト")]
    [InlineData("画像")]
    [InlineData("非JSON")]
    [InlineData("配列")]
    [InlineData("空")]
    [InlineData("途中")]
    public async Task 外部処理の失敗は安全に記録して失敗状態にする(string kind)
    {
        var job = await SeedAsync();
        var reader = new ImageReader { Failure = kind == "画像" ? new IOException("秘密の店舗") : null };
        var model = new Model
        {
            Failure = kind == "モデル" ? new AmazonBedrockRuntimeException("秘密の店舗") : kind == "タイムアウト" ? new TaskCanceledException("秘密の店舗") : null,
            Text = kind switch { "非JSON" => "秘密の店舗", "配列" => "[]", "空" => "", "途中" => "{\"amount\":", _ => "{}" },
        };
        var logger = new Logger();
        await Handler(reader, model, logger).HandleAsync(Event(("対象バケット", job.ObjectKey)));
        await using var db = CreateDb();
        var saved = await db.ReceiptAnalysisJobs.FindAsync(job.Id);
        Assert.Equal("失敗", saved!.Status);
        Assert.Equal(Now, saved.UpdatedAt);
        Assert.Null(saved.ReceiptDate);
        Assert.Null(saved.TotalAmount);
        Assert.Null(saved.StoreName);
        Assert.Null(saved.Category);
        Assert.Equal(kind == "画像" ? 0 : 1, model.Calls);
        var log = Assert.Single(logger.Entries);
        Assert.Null(log.Exception);
        Assert.DoesNotContain("秘密", log.Text);
        if (!string.IsNullOrEmpty(model.Text)) Assert.DoesNotContain(model.Text, log.Text, StringComparison.Ordinal);
        Assert.Equal(new[] { "ExceptionType", "JobId", "Stage" }, log.Properties.Keys.Where(x => x != "{OriginalFormat}").OrderBy(x => x).ToArray());
        Assert.Equal(job.Id, log.Properties["JobId"]);
    }

    [Theory]
    [InlineData("別バケット", "有効", "待機中")]
    [InlineData("対象バケット", "other/x.jpg", "待機中")]
    [InlineData("対象バケット", "receipts/../x.jpg", "待機中")]
    [InlineData("対象バケット", "receipts/+x.jpg", "待機中")]
    [InlineData("対象バケット", "未知", "待機中")]
    [InlineData("対象バケット", "有効", "完了")]
    [InlineData("対象バケット", "有効", "失敗")]
    public async Task 対象外イベントと処理済みジョブは変更しない(string bucket, string key, string status)
    {
        var job = await SeedAsync(status);
        key = key switch { "有効" => job.ObjectKey, "未知" => $"receipts/{Guid.NewGuid():N}.jpg", _ => key };
        var reader = new ImageReader();
        var model = new Model();
        await Handler(reader, model).HandleAsync(Event((bucket, key)));
        await using var db = CreateDb();
        var saved = await db.ReceiptAnalysisJobs.FindAsync(job.Id);
        Assert.Equal(status, saved!.Status);
        Assert.Equal(job.UpdatedAt, saved.UpdatedAt);
        Assert.Empty(reader.Calls);
        Assert.Equal(0, model.Calls);
    }

    [Theory]
    [InlineData(3750000, "完了", 1)]
    [InlineData(3750001, "失敗", 0)]
    public async Task 画像サイズの境界でモデル呼び出しを制限する(int size, string status, int calls)
    {
        var job = await SeedAsync();
        var reader = new ImageReader { Size = size };
        var model = new Model();
        await Handler(reader, model).HandleAsync(Event(("対象バケット", job.ObjectKey)));
        await using var db = CreateDb();
        Assert.Equal(status, (await db.ReceiptAnalysisJobs.FindAsync(job.Id))!.Status);
        Assert.Equal(calls, model.Calls);
    }

    [Fact]
    public async Task S3のサイズ超過例外ではモデルを呼ばず失敗にする()
    {
        var job = await SeedAsync();
        var sdk = System.Reflection.DispatchProxy.Create<Amazon.S3.IAmazonS3, BedrockReceiptModelClientTests.ImageProxy>();
        ((BedrockReceiptModelClientTests.ImageProxy)sdk).ContentLength = 3_750_001;
        var model = new Model();
        await Handler(new S3ReceiptImageReader(sdk), model).HandleAsync(Event(("対象バケット", job.ObjectKey)));
        await using var db = CreateDb();
        Assert.Equal("失敗", (await db.ReceiptAnalysisJobs.FindAsync(job.Id))!.Status);
        Assert.Equal(0, model.Calls);
    }

    [Fact]
    public async Task 複数レコードを処理し重複では再呼び出ししない()
    {
        var first = await SeedAsync();
        var second = await SeedAsync();
        var model = new Model();
        var handler = Handler(new ImageReader(), model);
        var request = Event(("対象バケット", first.ObjectKey), ("対象バケット", second.ObjectKey));
        await handler.HandleAsync(request);
        await handler.HandleAsync(request);
        Assert.Equal(2, model.Calls);
        await using var db = CreateDb();
        Assert.Equal("完了", (await db.ReceiptAnalysisJobs.FindAsync(first.Id))!.Status);
        Assert.Equal("完了", (await db.ReceiptAnalysisJobs.FindAsync(second.Id))!.Status);
    }

    [Fact]
    public async Task DB接続の失敗を握りつぶさない()
    {
        var failure = new InvalidOperationException("接続情報");
        var model = new Model();
        var handler = new ReceiptAnalysisHandler(_ => throw failure, new ImageReader(), model, "対象バケット", new Clock(), new Logger());
        Assert.Same(failure, await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.HandleAsync(Event(("対象バケット", $"receipts/{Guid.NewGuid():N}.jpg")))));
        Assert.Equal(0, model.Calls);
    }

    [Fact]
    public async Task 並行イベントは先に確定した結果を上書きしない()
    {
        var job = await SeedAsync();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var resume = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var delayed = new Model
        {
            Analyze = async () =>
            {
                entered.SetResult();
                await resume.Task;
                return "{\"amount\":100}";
            },
        };
        var request = Event(("対象バケット", job.ObjectKey));
        var first = Handler(new ImageReader(), delayed).HandleAsync(request);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            await Handler(new ImageReader(), new Model { Text = "{\"amount\":200}" }).HandleAsync(request);
        }
        finally
        {
            resume.SetResult();
        }
        await first;
        await using var db = CreateDb();
        var saved = await db.ReceiptAnalysisJobs.FindAsync(job.Id);
        Assert.Equal("完了", saved!.Status);
        Assert.Equal(200, saved.TotalAmount);
    }

    [Fact]
    public async Task 状態更新のDB例外を再試行のために返す()
    {
        var job = await SeedAsync();
        var failure = new InvalidOperationException("接続情報を含むDB障害");
        var model = new Model();
        var handler = new ReceiptAnalysisHandler(_ => Task.FromResult(new KakeiboDbContext(
            new DbContextOptionsBuilder<KakeiboDbContext>().UseNpgsql(factory.TestConnectionString)
                .AddInterceptors(new UpdateFailure(failure)).Options)), new ImageReader(), model,
            "対象バケット", new Clock(), new Logger());
        Assert.Same(failure, await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.HandleAsync(Event(("対象バケット", job.ObjectKey)))));
        Assert.Equal(1, model.Calls);
        await using var db = CreateDb();
        Assert.Equal("待機中", (await db.ReceiptAnalysisJobs.FindAsync(job.Id))!.Status);
    }

    private sealed class UpdateFailure(Exception failure) : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.StartsWith("UPDATE", StringComparison.OrdinalIgnoreCase)) throw failure;
            return ValueTask.FromResult(result);
        }
    }

    private sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow() => Now; }
    private sealed class ImageReader : IReceiptImageReader
    {
        public List<(string, string)> Calls { get; } = [];
        public Exception? Failure { get; init; }
        public int Size { get; init; } = 1;
        public Task<ReceiptImage> ReadAsync(string bucket, string key, CancellationToken ct)
        {
            Calls.Add((bucket, key));
            if (Failure is not null) throw Failure;
            return Task.FromResult(new ReceiptImage(new byte[Size], "jpeg"));
        }
    }
    private sealed class Model : IReceiptModelClient
    {
        public string Text { get; init; } = "{}";
        public Func<Task<string>>? Analyze { get; init; }
        public Exception? Failure { get; init; }
        public int Calls { get; private set; }
        public Task<string> AnalyzeAsync(byte[] image, string format, CancellationToken ct)
        {
            Calls++;
            if (Failure is not null) throw Failure;
            return Analyze?.Invoke() ?? Task.FromResult(Text);
        }
    }
    private sealed class Logger : ILogger<ReceiptAnalysisHandler>
    {
        public List<(string Text, Dictionary<string, object?> Properties, Exception? Exception)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((formatter(state, exception), ((IEnumerable<KeyValuePair<string, object?>>)(object)state!).ToDictionary(x => x.Key, x => x.Value), exception));
    }
}
