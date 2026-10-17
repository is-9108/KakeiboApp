using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace Kakeibo.Api.Tests.Infrastructure;

/// <summary>
/// テストクラスごとに専用のデータベースを用意するWebApplicationFactory。
/// テスト実行にはDBへの接続（composeで設定される環境変数 ConnectionStrings__DefaultConnection）が必要で、
/// `docker compose run --rm api dotnet test` のようにcompose経由で実行する。
/// 実Cognitoには依存しない：TestSigningKeysで作ったローカル鍵で署名したトークンを検証させる。
/// </summary>
public sealed class KakeiboApiTestFactory : WebApplicationFactory<Program>
{
    private readonly string _baseConnectionString;
    private readonly string _testDatabaseName;
    private readonly string _testConnectionString;
    private readonly TestTokenFactory _tokenFactory;
    private readonly OpenIdConnectConfiguration _openIdConnectConfiguration;

    public KakeiboApiTestFactory()
    {
        _baseConnectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? throw new InvalidOperationException(
                "環境変数 ConnectionStrings__DefaultConnection が未設定です。docker compose run --rm api dotnet test のようにcompose経由で実行してください。");
        var builder = new NpgsqlConnectionStringBuilder(_baseConnectionString)
        {
            Database = _testDatabaseName = $"kakeibo_test_{Guid.NewGuid():N}",
        };
        _testConnectionString = builder.ConnectionString;
        _tokenFactory = new TestTokenFactory(TestSigningKeys.Instance);
        _openIdConnectConfiguration = CreateOpenIdConnectConfiguration(TestSigningKeys.Instance);
    }

    /// <summary>テスト用データベースの接続文字列。テストから直接DBを操作するときに使う。</summary>
    public string TestConnectionString => _testConnectionString;

    /// <summary>テスト用トークンの発行者。テストケースがトークンを作るときに使う。</summary>
    public TestTokenFactory Tokens => _tokenFactory;

    /// <summary>既定の合格トークンをAuthorizationヘッダとして作る。</summary>
    public System.Net.Http.Headers.AuthenticationHeaderValue CreateBearerHeader(DateTimeOffset? expiresAt = null) =>
        new("Bearer", _tokenFactory.CreateAccessToken(expiresAt).Value);

    // アプリ起動前にテスト用DBを作る。テーブルはProgram.csのMigrate()が作成する
    protected override IHost CreateHost(IHostBuilder builder)
    {
        CreateTestDatabase();
        return base.CreateHost(builder);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:DefaultConnection", _testConnectionString);
        builder.UseSetting("Cognito:Region", "test-region");
        builder.UseSetting("Cognito:UserPoolId", "test-user-pool");
        builder.UseSetting("Cognito:AppClientId", TestTokenFactory.AppClientId);

        builder.ConfigureServices(services =>
        {
            // 実CognitoのJWKSエンドポイントにアクセスさせない。
            // 検証鍵をローカル鍵（TestSigningKeys）に差し替え、発行者はテスト用User Poolに合わせる。
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                // 実CognitoのJWKS取得を封じ、検証鍵をローカル鍵に差し替える
                options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(_openIdConnectConfiguration);
                options.TokenValidationParameters.IssuerSigningKeys = _openIdConnectConfiguration.SigningKeys;
                options.TokenValidationParameters.ValidIssuer = TestTokenFactory.Issuer;
                options.TokenValidationParameters.ValidateAudience = false;
                options.TokenValidationParameters.ValidateLifetime = true;
                options.TokenValidationParameters.ClockSkew = TimeSpan.Zero;
            });
        });
    }

    private static OpenIdConnectConfiguration CreateOpenIdConnectConfiguration(TestSigningKeys.RsaSecurityKeyPair pair)
    {
        var jsonWebKey = JsonWebKeyConverter.ConvertFromRSASecurityKey(
            new RsaSecurityKey(pair.Rsa.ExportParameters(false)) { KeyId = pair.Kid });
        jsonWebKey.Use = "sig";
        jsonWebKey.Alg = SecurityAlgorithms.RsaSha256;
        var configuration = new OpenIdConnectConfiguration();
        configuration.SigningKeys.Add(jsonWebKey);
        return configuration;
    }

    // テスト終了後にテスト用DBを削除する。削除に失敗してもテスト結果には影響させない
    public override async ValueTask DisposeAsync()
    {
        try
        {
            DropTestDatabase();
        }
        catch (NpgsqlException)
        {
            // 後片付けの失敗は無視する
        }

        await base.DisposeAsync();
    }

    private void CreateTestDatabase()
    {
        using var connection = new NpgsqlConnection(_baseConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"CREATE DATABASE \"{_testDatabaseName}\"";
        command.ExecuteNonQuery();
    }

    private void DropTestDatabase()
    {
        using var connection = new NpgsqlConnection(_baseConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"DROP DATABASE \"{_testDatabaseName}\" WITH (FORCE)";
        command.ExecuteNonQuery();
    }
}
