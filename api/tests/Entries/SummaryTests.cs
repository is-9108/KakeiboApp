using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

/// <summary>月次集計（GET /api/entries/summary）の正常系テスト。</summary>
public class SummaryTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    // T1: 指定月の収入合計が、その月の収入の金額合計と一致する
    [Fact]
    public async Task Get_returns_income_total_for_month()
    {
        await CreateEntryAsync(EntryBody("2031-01-10", "収入", 50000, "給与"));
        await CreateEntryAsync(EntryBody("2031-01-20", "収入", 3000, "副収入"));
        await CreateEntryAsync(EntryBody("2030-12-31", "収入", 99999, "給与"));
        await CreateEntryAsync(EntryBody("2031-02-01", "収入", 88888, "給与"));

        var response = await Client.GetAsync("/api/entries/summary?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("2031-01", json.GetProperty("month").GetString());
        Assert.Equal(53000, json.GetProperty("incomeTotal").GetInt32());
    }

    // T2: 指定月の支出合計が、その月の支出の金額合計と一致する
    [Fact]
    public async Task Get_returns_expense_total_for_month()
    {
        await CreateExpenseFixtureAsync();

        var response = await Client.GetAsync("/api/entries/summary?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1700, json.GetProperty("expenseTotal").GetInt32());
    }

    // T3: 収支差額が「収入合計 − 支出合計」と一致する
    [Fact]
    public async Task Get_returns_balance_as_income_minus_expense()
    {
        await CreateEntryAsync(EntryBody("2031-01-10", "収入", 50000, "給与"));
        await CreateEntryAsync(EntryBody("2031-01-20", "収入", 3000, "副収入"));
        await CreateExpenseFixtureAsync();

        var response = await Client.GetAsync("/api/entries/summary?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(53000, json.GetProperty("incomeTotal").GetInt32());
        Assert.Equal(1700, json.GetProperty("expenseTotal").GetInt32());
        Assert.Equal(51300, json.GetProperty("balance").GetInt32());
    }

    // T4: カテゴリ別支出内訳には、その月に支出があるカテゴリごとに金額が含まれる
    [Fact]
    public async Task Get_returns_breakdown_amounts_per_category()
    {
        await CreateExpenseFixtureAsync();

        var response = await Client.GetAsync("/api/entries/summary?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = json.GetProperty("expenseBreakdown").EnumerateArray().ToList();
        Assert.Equal(2, rows.Count);
        Assert.Equal(
            ["外食費", "食費"], rows.Select(r => r.GetProperty("category").GetString()).ToArray());
        Assert.Equal(
            [1200, 500], rows.Select(r => r.GetProperty("amount").GetInt32()).ToArray());
    }

    // T5: 内訳の構成比は支出合計に対する割合で小数第1位で四捨五入され、金額降順で並ぶ
    [Fact]
    public async Task Get_returns_breakdown_percentages_and_order()
    {
        await CreateExpenseFixtureAsync();

        var response = await Client.GetAsync("/api/entries/summary?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = json.GetProperty("expenseBreakdown").EnumerateArray().ToList();
        Assert.Equal(
            [70.6m, 29.4m], rows.Select(r => r.GetProperty("percentage").GetDecimal()).ToArray());
    }

    // T6: 支出合計が0の月の構成比は0を返す（内訳は空で収入の集計は得られる）
    [Fact]
    public async Task Get_returns_empty_breakdown_when_no_expense()
    {
        await CreateEntryAsync(EntryBody("2031-01-10", "収入", 50000, "給与"));

        var response = await Client.GetAsync("/api/entries/summary?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, json.GetProperty("expenseTotal").GetInt32());
        Assert.Equal(50000, json.GetProperty("balance").GetInt32());
        Assert.Equal(0, json.GetProperty("expenseBreakdown").GetArrayLength());
    }

    // T7: 収支が1件もない月は、合計・差額が0、内訳が空の状態で200を返す
    [Fact]
    public async Task Get_returns_zeros_when_no_entries()
    {
        var response = await Client.GetAsync("/api/entries/summary?month=2031-01");
        var json = await JsonBodyAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("2031-01", json.GetProperty("month").GetString());
        Assert.Equal(0, json.GetProperty("incomeTotal").GetInt32());
        Assert.Equal(0, json.GetProperty("expenseTotal").GetInt32());
        Assert.Equal(0, json.GetProperty("balance").GetInt32());
        Assert.Equal(0, json.GetProperty("expenseBreakdown").GetArrayLength());
    }

    // T2と同じ前提データ（2031-01に支出3件）を作る
    private async Task CreateExpenseFixtureAsync()
    {
        await CreateEntryAsync(EntryBody("2031-01-05", "支出", 1000, "外食費"));
        await CreateEntryAsync(EntryBody("2031-01-15", "支出", 500, "食費"));
        await CreateEntryAsync(EntryBody("2031-01-25", "支出", 200, "外食費"));
    }
}
