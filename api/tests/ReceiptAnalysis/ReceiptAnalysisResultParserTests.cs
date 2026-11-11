using Kakeibo.Api.Models;
using Kakeibo.MonthlyBatch;

namespace Kakeibo.Api.Tests.ReceiptAnalysis;

public class ReceiptAnalysisResultParserTests
{
    [Theory]
    [InlineData("1", 1)]
    [InlineData("2147483647", 2147483647)]
    [InlineData("1.0", 1)]
    [InlineData("1e3", 1000)]
    [InlineData("100e-2", 1)]
    [InlineData("1.000000000000000000000000000001", null)]
    [InlineData("1e1000000000", null)]
    [InlineData("1e-1000000000", null)]
    [InlineData("0", null)]
    [InlineData("-1", null)]
    [InlineData("1.5", null)]
    [InlineData("\"1200\"", null)]
    [InlineData("2147483648", null)]
    [InlineData("null", null)]
    public void 金額は正の整数値だけ採用する(string value, int? expected) =>
        Assert.Equal(expected, ReceiptAnalysisResultParser.Parse("{\"amount\":" + value + "}").Amount);

    [Theory]
    [InlineData("\"2028-02-29\"", "2028-02-29")]
    [InlineData("\"2026-02-30\"", null)]
    [InlineData("\"2026-13-01\"", null)]
    [InlineData("\"2026/02/01\"", null)]
    [InlineData("20260201", null)]
    [InlineData("\"\"", null)]
    public void 日付は指定形式の実在日だけ採用する(string value, string? expected) =>
        Assert.Equal(expected, ReceiptAnalysisResultParser.Parse("{\"date\":" + value + "}").Date?.ToString("yyyy-MM-dd"));

    public static IEnumerable<object[]> 支出カテゴリ => Presets.ExpenseCategories.Select(x => new object[] { x });

    [Theory]
    [MemberData(nameof(支出カテゴリ))]
    public void 全支出プリセットを採用する(string category) =>
        Assert.Equal(category, ReceiptAnalysisResultParser.Parse("{\"category\":\"" + category + "\"}").Category);

    [Theory]
    [InlineData("\"給与\"")]
    [InlineData("\"副収入\"")]
    [InlineData("\"食料品\"")]
    [InlineData("\"食費 \"")]
    [InlineData("\"FOOD\"")]
    [InlineData("1")]
    [InlineData("[]")]
    public void 許可されないカテゴリは空にする(string value) =>
        Assert.Null(ReceiptAnalysisResultParser.Parse("{\"category\":" + value + "}").Category);

    [Theory]
    [InlineData(0, null)]
    [InlineData(100, 100)]
    [InlineData(101, null)]
    public void 店名をトリムし空と長すぎる値を捨てる(int length, int? expected)
    {
        var result = ReceiptAnalysisResultParser.Parse("{\"storeName\":\"  " + new string('店', length) + "  \"}");
        Assert.Equal(expected, result.StoreName?.Length);
    }

    [Theory]
    [InlineData("")]
    [InlineData("JSONではない")]
    [InlineData("[]")]
    [InlineData("{\"amount\":")]
    [InlineData("null")]
    [InlineData("```json\n{}\n```余分")]
    public void オブジェクトに解析できなければ失敗する(string text) =>
        Assert.ThrowsAny<System.Text.Json.JsonException>(() => ReceiptAnalysisResultParser.Parse(text));

    [Theory]
    [InlineData(" {} ")]
    [InlineData("```json\n{}\n```")]
    [InlineData("```\n{}\n```")]
    [InlineData("{\"date\":null,\"amount\":null,\"storeName\":null,\"category\":null,\"unknown\":42}")]
    [InlineData("{\"date\":[],\"storeName\":12}")]
    public void 欠落と空の項目でも解析は成功する(string text) =>
        Assert.Equal(new ReceiptAnalysisResult(null, null, null, null), ReceiptAnalysisResultParser.Parse(text));
}
