namespace Kakeibo.Api.Models;

/// <summary>1件の収支（収入または支出の記録）。</summary>
public class Entry
{
    /// <summary>識別子（シーケンス採番）。</summary>
    public int Id { get; set; }

    /// <summary>収支が発生した日。</summary>
    public DateOnly Date { get; set; }

    /// <summary>種別。収入または支出。</summary>
    public required string Type { get; set; }

    /// <summary>金額。1円以上の整数。</summary>
    public int Amount { get; set; }

    /// <summary>カテゴリ。種別に紐づくプリセットから1つ。</summary>
    public required string Category { get; set; }

    /// <summary>自由記述（例：店名・用途）。空文字許容。</summary>
    public required string Memo { get; set; }
}
