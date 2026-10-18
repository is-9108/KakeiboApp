using Microsoft.Extensions.Configuration;
using System.Text.RegularExpressions;

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
            !Regex.IsMatch(region, @"^[a-z]{2}(?:-[a-z]+)+-[0-9]$", RegexOptions.CultureInvariant) ||
            string.IsNullOrWhiteSpace(userPoolId) ||
            !Regex.IsMatch(userPoolId, $"^{Regex.Escape(region)}_[A-Za-z0-9]+$", RegexOptions.CultureInvariant) ||
            string.IsNullOrWhiteSpace(appClientId) ||
            !Regex.IsMatch(appClientId, @"^[A-Za-z0-9]+$", RegexOptions.CultureInvariant))
        {
            throw new InvalidOperationException(
                $"{sectionName}:Region / UserPoolId / AppClientId が不正です。" +
                "RegionはAWSリージョン形式、UserPoolIdは<Region>_<ID>形式、AppClientIdは英数字で設定してください。");
        }

        return new CognitoConfiguration(region, userPoolId, appClientId);
    }
}
