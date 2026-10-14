using System.Net;
using Kakeibo.Api.Tests.Infrastructure;

namespace Kakeibo.Api.Tests.Entries;

/// <summary>収支登録（POST /api/entries）の異常系テスト。</summary>
public class CreateEntryValidationTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    // T7: 日付・種別・金額・カテゴリのいずれかが未指定の登録リクエストは400を返す
    [Theory]
    [InlineData("date")]
    [InlineData("type")]
    [InlineData("amount")]
    [InlineData("category")]
    public async Task Post_without_required_field_returns_400(string missingField)
    {
        var body = EntryBody();
        body.Remove(missingField);

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T7（空文字）: 必須項目が空文字でも400を返す
    [Theory]
    [InlineData("type")]
    [InlineData("category")]
    public async Task Post_with_empty_required_field_returns_400(string emptyField)
    {
        var body = EntryBody();
        body[emptyField] = "";

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T8: 種別が「収入」「支出」以外の値の登録リクエストは400を返す
    [Fact]
    public async Task Post_with_unknown_type_returns_400()
    {
        var body = EntryBody();
        body["type"] = "貯蓄";

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T9: 金額が0以下、または整数でない登録リクエストは400を返す
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task Post_with_amount_le_0_returns_400(int amount)
    {
        var body = EntryBody();
        body["amount"] = amount;

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    [Fact]
    public async Task Post_with_decimal_amount_returns_400()
    {
        var body = EntryBody();
        body["amount"] = 1000.5;

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    [Fact]
    public async Task Post_with_non_numeric_amount_returns_400()
    {
        var body = EntryBody();
        body["amount"] = "千";

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T10: カテゴリが4.3のプリセットに含まれない登録リクエストは400を返す
    [Fact]
    public async Task Post_with_unknown_category_returns_400()
    {
        var body = EntryBody();
        body["category"] = "旅行";

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T11: 収入の収支に支出用カテゴリを指定した登録は400を返す。支出の収支に収入用カテゴリを指定した場合も同様
    [Fact]
    public async Task Post_income_with_expense_category_returns_400()
    {
        var body = EntryBody();
        body["type"] = "収入";
        body["category"] = "外食費";

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    [Fact]
    public async Task Post_expense_with_income_category_returns_400()
    {
        var body = EntryBody();
        body["category"] = "給与";

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T12: 日付が不正な形式の登録リクエストは400を返す
    [Theory]
    [InlineData("2031/01/15")]
    [InlineData("2031-13-01")]
    [InlineData("abc")]
    public async Task Post_with_invalid_date_returns_400(string date)
    {
        var body = EntryBody();
        body["date"] = date;

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T19（400側）: 金額がintの最大値を超える登録リクエストは400を返す
    [Fact]
    public async Task Post_with_amount_over_int_max_returns_400()
    {
        var body = EntryBody();
        body["amount"] = 2147483648L;

        var response = await Client.PostAsync("/api/entries", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }
}
