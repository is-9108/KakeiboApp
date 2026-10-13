using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Kakeibo.Api.Tests.Infrastructure;

/// <summary>
/// テストクラスごとに専用のデータベースを用意するWebApplicationFactory。
/// テスト実行にはDBへの接続（composeで設定される環境変数 ConnectionStrings__DefaultConnection）が必要で、
/// `docker compose run --rm api dotnet test` のようにcompose経由で実行する。
/// </summary>
public sealed class KakeiboApiTestFactory : WebApplicationFactory<Program>
{
    private readonly string _baseConnectionString;
    private readonly string _testDatabaseName;
    private readonly string _testConnectionString;

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
    }

    /// <summary>テスト用データベースの接続文字列。テストから直接DBを操作するときに使う。</summary>
    public string TestConnectionString => _testConnectionString;

    // アプリ起動前にテスト用DBを作る。テーブルはProgram.csのMigrate()が作成する
    protected override IHost CreateHost(IHostBuilder builder)
    {
        CreateTestDatabase();
        return base.CreateHost(builder);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = _testConnectionString,
            });
        });
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
