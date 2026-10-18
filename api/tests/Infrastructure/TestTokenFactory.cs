using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;

namespace Kakeibo.Api.Tests.Infrastructure;

/// <summary>
/// テスト用のCognito形式アクセストークンを発行する。
/// 既定の発行者・クライアントはKakeiboApiTestFactoryが設定する値と一致させる。
/// </summary>
public sealed class TestTokenFactory
{
    /// <summary>このファクトリが既定で使う発行者（テスト用User Poolの発行者URL）。</summary>
    public const string Issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testpool";

    /// <summary>このファクトリが既定で使うApp Client ID。</summary>
    public const string AppClientId = "testappclient";

    /// <summary>既定のtoken_use値。</summary>
    public const string DefaultTokenUse = "access";

    private readonly TestSigningKeys.RsaSecurityKeyPair _signingKey;

    public TestTokenFactory(TestSigningKeys.RsaSecurityKeyPair signingKey)
    {
        _signingKey = signingKey;
    }

    /// <summary>検証で合格する既定のトークンを作る。引数でクレームや鍵を上書きできる。</summary>
    public TestToken CreateAccessToken(
        DateTimeOffset? expiresAt = null,
        string? issuer = null,
        string? audience = null,
        string? tokenUse = null,
        string? clientId = null,
        TestSigningKeys.RsaSecurityKeyPair? signingKey = null,
        IReadOnlyDictionary<string, object?>? customClaims = null)
    {
        var now = DateTimeOffset.UtcNow;
        var expiresAtUtc = (expiresAt ?? now.AddMinutes(10)).UtcDateTime;
        var notBeforeUtc = expiresAtUtc <= now.UtcDateTime ? expiresAtUtc.AddSeconds(-1) : now.UtcDateTime;

        // token_use = access / client_id をpayloadに入れる（JwtSecurityTokenHandlerがaudとして扱わないよう
        // Claimsに直接入れる。token_use / client_id は null を明示すると欠落させる）
        var claims = new Dictionary<string, object?>(customClaims ?? new Dictionary<string, object?>())
        {
            ["sub"] = "00000000-0000-0000-0000-000000000001",
            ["username"] = "test-user",
            ["token_use"] = tokenUse ?? DefaultTokenUse,
            ["client_id"] = clientId ?? AppClientId,
        };
        // null（既定）ではなく「欠落」を明示したい場合は空文字のSentinel値を指定する
        const string omitTokenUse = "omit:token_use";
        const string omitClientId = "omit:client_id";
        void NormalizeClaim(string claimName, string omitMarker)
        {
            if (claims.TryGetValue(claimName, out var value) && Equals(value, omitMarker))
            {
                claims.Remove(claimName);
            }
        }
        NormalizeClaim("token_use", omitTokenUse);
        NormalizeClaim("client_id", omitClientId);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer ?? Issuer,
            Audience = audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = notBeforeUtc,
            Expires = expiresAtUtc,
            SigningCredentials = SigningCredentialsFor(signingKey ?? _signingKey),
            Claims = claims,
        };

        var token = new JwtSecurityTokenHandler().CreateJwtSecurityToken(descriptor);
        return new TestToken(token.RawData ?? "");
    }

    private static SigningCredentials SigningCredentialsFor(TestSigningKeys.RsaSecurityKeyPair pair) =>
        new(new RsaSecurityKey(pair.Rsa) { KeyId = pair.Kid }, SecurityAlgorithms.RsaSha256);

    /// <summary>発行済みトークンの文字列。</summary>
    public sealed record TestToken(string Value);
}
