namespace Kakeibo.Api.Models;

/// <summary>レシート解析ジョブ。</summary>
public class ReceiptAnalysisJob
{
    /// <summary>識別子。</summary>
    public Guid Id { get; set; }

    /// <summary>画像のS3キー。</summary>
    public string ObjectKey { get; set; } = string.Empty;

    /// <summary>解析状態。</summary>
    public string Status { get; set; } = ReceiptAnalysisStatuses.Pending;

    /// <summary>レシートの日付。</summary>
    public DateOnly? ReceiptDate { get; set; }

    /// <summary>税込合計金額（円）。</summary>
    public int? TotalAmount { get; set; }

    /// <summary>店名。</summary>
    public string? StoreName { get; set; }

    /// <summary>支出カテゴリの候補。</summary>
    public string? Category { get; set; }

    /// <summary>作成日時。</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>更新日時。</summary>
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>解析状態の定数。</summary>
public static class ReceiptAnalysisStatuses
{
    /// <summary>アップロードまたは解析を待っている状態。</summary>
    public const string Pending = "待機中";
    /// <summary>解析が完了した状態。</summary>
    public const string Completed = "完了";
    /// <summary>解析に失敗した状態。</summary>
    public const string Failed = "失敗";
}
