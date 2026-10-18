using System.Security.Cryptography;

namespace Kakeibo.Api.Tests.Infrastructure;

/// <summary>
/// 認証テスト用のRSA署名鍵ペア（テストアセンブリ内で1つを共有）。
/// 公開鍵はKakeiboApiTestFactoryがアプリに注入し、秘密鍵はテストがトークンを発行するのに使う。
/// 実Cognitoには依存しない。
/// </summary>
public static class TestSigningKeys
{
    private static readonly Lazy<RsaSecurityKeyPair> Keys = new(CreateKeyPair);
    private static readonly Lazy<RsaSecurityKeyPair> SecondaryKeys = new(CreateKeyPair);

    public static RsaSecurityKeyPair Instance => Keys.Value;

    /// <summary>JWKSに含まれない鍵。署名失敗（不正署名）のテストで使う。</summary>
    public static RsaSecurityKeyPair Secondary => SecondaryKeys.Value;

    public sealed record RsaSecurityKeyPair(RSA Rsa, string Kid);

    private static RsaSecurityKeyPair CreateKeyPair()
    {
        var rsa = RSA.Create(2048);
        // kidは鍵を一意に特定できればよく、値自体に意味はない
        return new RsaSecurityKeyPair(rsa, "test-signing-key-1");
    }
}
