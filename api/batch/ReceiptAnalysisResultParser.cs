using System.Globalization;
using System.Text.Json;
using Kakeibo.Api.Models;

namespace Kakeibo.MonthlyBatch;

public sealed record ReceiptAnalysisResult(DateOnly? Date, int? Amount, string? StoreName, string? Category);

public static class ReceiptAnalysisResultParser
{
    public static ReceiptAnalysisResult Parse(string response)
    {
        var text = response.Trim();
        if (text.StartsWith("```", StringComparison.Ordinal) && text.EndsWith("```", StringComparison.Ordinal))
        {
            var newline = text.IndexOf('\n');
            if (newline >= 0 && newline < text.Length - 3 && text[..newline].TrimEnd() is "```" or "```json")
                text = text[(newline + 1)..^3].Trim();
        }
        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new JsonException("解析応答がオブジェクトではありません。");
        string? ReadString(string name) => root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;
        DateOnly? date = DateOnly.TryParseExact(ReadString("date"), "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var parsedDate) ? parsedDate : null;
        var amount = root.TryGetProperty("amount", out var number) ? ReadAmount(number) : null;
        var category = ReadString("category");
        if (!Presets.ExpenseCategories.Contains(category, StringComparer.Ordinal)) category = null;
        var store = ReadString("storeName")?.Trim();
        if (store is { Length: 0 or > 100 }) store = null;
        return new ReceiptAnalysisResult(date, amount, store, category);
    }

    private static int? ReadAmount(JsonElement number)
    {
        if (number.ValueKind != JsonValueKind.Number) return null;
        // 浮動小数点やdecimalの丸めで、小数値を整数として採用しない。
        var parts = number.GetRawText().Split(['e', 'E']);
        if (parts[0].StartsWith('-')) return null;
        long exponent = 0;
        if (parts.Length == 2 && !long.TryParse(parts[1], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out exponent)) return null;
        var point = parts[0].IndexOf('.');
        var decimals = point < 0 ? 0 : parts[0].Length - point - 1;
        var digits = parts[0].Replace(".", "", StringComparison.Ordinal).TrimStart('0');
        if (digits.Length == 0) return null;
        var significant = digits.TrimEnd('0');
        // 巨大な指数を展開せず、intの最大桁数だけを扱う。
        if (exponent < -digits.Length || exponent > decimals + 10L) return null;
        var scale = exponent - decimals + digits.Length - significant.Length;
        if (scale < 0 || significant.Length + scale > 10) return null;
        return int.TryParse(significant + new string('0', (int)scale), NumberStyles.None,
            CultureInfo.InvariantCulture, out var amount) && amount > 0 ? amount : null;
    }
}
