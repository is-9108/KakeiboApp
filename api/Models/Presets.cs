namespace Kakeibo.Api.Models;

/// <summary>種別・カテゴリのプリセット定義。ユーザーによる追加・編集・削除はしない（docs/requirements.md 4.3）。</summary>
public static class Presets
{
    /// <summary>収入の種別。</summary>
    public const string Income = "収入";

    /// <summary>支出の種別。</summary>
    public const string Expense = "支出";

    /// <summary>種別として許可する値。</summary>
    public static readonly string[] Types = [Income, Expense];

    /// <summary>支出用カテゴリプリセット。</summary>
    public static readonly string[] ExpenseCategories =
    [
        "外食費",
        "食費",
        "日用品",
        "交通費",
        "住居費",
        "光熱費",
        "通信費",
        "趣味・娯楽",
        "医療・健康",
        "その他",
    ];

    /// <summary>収入用カテゴリプリセット。</summary>
    public static readonly string[] IncomeCategories =
    [
        "給与",
        "副収入",
        "その他",
    ];

    /// <summary>種別に対応するカテゴリプリセットを返す。</summary>
    public static string[] CategoriesFor(string type) =>
        type == Income ? IncomeCategories : ExpenseCategories;
}
