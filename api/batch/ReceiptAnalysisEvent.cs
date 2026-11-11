using System.Text.Json.Serialization;

namespace Kakeibo.MonthlyBatch;

public sealed class ReceiptAnalysisEvent
{
    [JsonPropertyName("Records")]
    public List<ReceiptAnalysisRecord> Records { get; init; } = [];
}

public sealed class ReceiptAnalysisRecord
{
    [JsonPropertyName("s3")]
    public ReceiptAnalysisS3 S3 { get; init; } = new();
}

public sealed class ReceiptAnalysisS3
{
    [JsonPropertyName("bucket")]
    public ReceiptAnalysisBucket Bucket { get; init; } = new();
    [JsonPropertyName("object")]
    public ReceiptAnalysisObject Object { get; init; } = new();
}

public sealed class ReceiptAnalysisBucket
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = "";
}

public sealed class ReceiptAnalysisObject
{
    [JsonPropertyName("key")]
    public string Key { get; init; } = "";
}
