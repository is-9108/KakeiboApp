using System.Net;
using System.Text.Json;
using Kakeibo.Api.Tests.Infrastructure;
using Xunit;

namespace Kakeibo.Api.Tests.Authentication;

/// <summary>Cognito JWTによる認証ガード（トークンなし・不正トークン・期限切れは401、有効トークンは処理される）。</summary>
public class AuthGuardTests(KakeiboApiTestFactory factory) : EntriesApiTestBase(factory)
{
    /// <summary>既定のAuthorizationヘッダを持たない素のクライアント（テストDB共有のためアプリを起動済み）。</summary>
    private HttpClient ClientWithoutToken() => Factory.CreateClient();

    private async Task AssertUnauthorizedAndNoDbWriteAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, CountEntries());
    }

    // T1: トークンなしで収支CRUDのどのAPIを呼んでも401。
    [Fact]
    public async Task No_token_returns_401()
    {
        using var client = ClientWithoutToken();

        var body = EntryBody();
        await AssertUnauthorizedAndNoDbWriteAsync(await client.GetAsync("/api/entries?month=2031-01"));
        await AssertUnauthorizedAndNoDbWriteAsync(await client.PostAsync("/api/entries", Json(body)));
        await AssertUnauthorizedAndNoDbWriteAsync(await client.PutAsync("/api/entries/1", Json(body)));
        await AssertUnauthorizedAndNoDbWriteAsync(await client.DeleteAsync("/api/entries/1"));
    }

    // T2: 既定の鍵（JWKSの鍵）とは異なる鍵で署名したトークンは署名検証に失敗する
    [Fact]
    public async Task Tampered_token_returns_401()
    {
        var token = Factory.Tokens.CreateAccessToken(
            signingKey: TestSigningKeys.Secondary).Value;

        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        await AssertUnauthorizedAndNoDbWriteAsync(
            await client.GetAsync("/api/entries?month=2031-01"));
    }

    // T3: 期限切れトークンは拒否される（ClockSkew=0）
    [Fact]
    public async Task Expired_token_returns_401()
    {
        var token = Factory.Tokens.CreateAccessToken(expiresAt: DateTimeOffset.UtcNow - TimeSpan.FromSeconds(1)).Value;

        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        await AssertUnauthorizedAndNoDbWriteAsync(
            await client.GetAsync("/api/entries?month=2031-01"));
    }

    // T5a: 発行者が違うトークンは拒否される
    [Fact]
    public async Task Wrong_issuer_token_returns_401()
    {
        var token = Factory.Tokens.CreateAccessToken(
            issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_otherpool").Value;

        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        await AssertUnauthorizedAndNoDbWriteAsync(
            await client.GetAsync("/api/entries?month=2031-01"));
    }

    // T5b: token_use / client_id クレームが欠落したトークンは拒否される
    [Fact]
    public async Task Token_with_missing_claims_returns_401()
    {
        // 空文字Sentinel指定でclaimを欠落させる
        var token = Factory.Tokens.CreateAccessToken(
            tokenUse: "omit:token_use",
            clientId: "omit:client_id").Value;

        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        await AssertUnauthorizedAndNoDbWriteAsync(
            await client.GetAsync("/api/entries?month=2031-01"));
    }

    // T5c: IDトークン（token_use=id）は拒否される
    [Fact]
    public async Task Id_token_returns_401()
    {
        var token = Factory.Tokens.CreateAccessToken(tokenUse: "id").Value;

        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        await AssertUnauthorizedAndNoDbWriteAsync(
            await client.GetAsync("/api/entries?month=2031-01"));
    }

    // T5d: 別のApp Client向けトークンは拒否される
    [Fact]
    public async Task Wrong_client_token_returns_401()
    {
        var token = Factory.Tokens.CreateAccessToken(clientId: "other-app-client").Value;

        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        await AssertUnauthorizedAndNoDbWriteAsync(
            await client.GetAsync("/api/entries?month=2031-01"));
    }

    // T5e:Bearerスキーマの形式不正
    [Fact]
    public async Task Malformed_bearer_returns_401()
    {
        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "not.a.jwt");

        await AssertUnauthorizedAndNoDbWriteAsync(
            await client.GetAsync("/api/entries?month=2031-01"));
    }

    // T4: 有効トークンがあればリクエストが処理され200が返る
    [Fact]
    public async Task Valid_token_returns_200()
    {
        var response = await Client.GetAsync("/api/entries?month=2031-01");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await JsonBodyAsync(response);
        Assert.Equal(JsonValueKind.Array, json.ValueKind);
        Assert.Empty(json.EnumerateArray());
    }

    [Fact]
    public async Task Signup_endpoints_do_not_exist_even_for_an_authenticated_user()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await Client.PostAsync("/api/signup", Json(new { }))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client.PostAsync("/api/auth/signup", Json(new { }))).StatusCode);
    }
}
