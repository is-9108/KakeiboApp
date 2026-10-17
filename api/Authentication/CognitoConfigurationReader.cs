using Microsoft.Extensions.Configuration;

namespace Kakeibo.Api.Authentication;

/// <summary>認証に使うCognitoの設定。</summary>
public sealed record CognitoConfiguration(string Region, string UserPoolId, string AppClientId)
{
    /// <summary>JWTの発行者（iss）とOIDCメタデータのURLのもとになるUser PoolのURL。</summary>
    public string Issuer => $"https://cognito-idp.{Region}.amazonaws.com/{UserPoolId}";
}

/// <summary>
/// 設定のCognitoセクション（Region / UserPoolId / AppClientId）を読み、
/// どれかが欠けていれば例外を投げる。認証設定が不完全なまま起動しないようにするため。
/// </summary>
public static class CognitoConfigurationReader
{
    public static CognitoConfiguration Read(IConfiguration configuration) =>
        Read(configuration, sectionName: "Cognito");

    public static CognitoConfiguration Read(IConfiguration configuration, string sectionName)
    {
        var section = configuration.GetSection(sectionName);
        var region = section["Region"];
        var userPoolId = section["UserPoolId"];
        var appClientId = section["AppClientId"];

        if (string.IsNullOrWhiteSpace(region) ||
            string.IsNullOrWhiteSpace(userPoolId) ||
            string.IsNullOrWhiteSpace(appClientId))
        {
            throw new InvalidOperationException(
                $"{sectionName}:Region / {sectionName}:UserPoolId / {sectionName}:AppClientId を設定してください。" +
                "いずれかが欠けたまま認証を無効化して起動することはありません。");
        }

        return new CognitoConfiguration(region, userPoolId, appClientId);
    }
}
