using Kakeibo.Api.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Kakeibo.Api.Tests.Data;

/// <summary>
/// 起動時マイグレーションの判定。本番では設定にかかわらず実行せず、
/// 開発・テストでも明示的に有効化された場合だけ実行することを確認する。
/// </summary>
public class DatabaseMigrationTests
{
    [Fact]
    public void Production_does_not_migrate_even_when_enabled()
    {
        var configuration = Configuration(("Database:RunMigrationsOnStartup", "true"));

        Assert.False(DatabaseMigration.ShouldMigrate(Environment("Production"), configuration));
    }

    [Fact]
    public void Production_does_not_migrate_when_setting_is_missing()
    {
        Assert.False(DatabaseMigration.ShouldMigrate(Environment("Production"), Configuration()));
    }

    [Fact]
    public void Development_migrates_when_enabled()
    {
        var configuration = Configuration(("Database:RunMigrationsOnStartup", "true"));

        Assert.True(DatabaseMigration.ShouldMigrate(Environment("Development"), configuration));
    }

    [Fact]
    public void Development_does_not_migrate_when_setting_is_missing()
    {
        Assert.False(DatabaseMigration.ShouldMigrate(Environment("Development"), Configuration()));
    }

    [Fact]
    public void Development_does_not_migrate_when_disabled()
    {
        var configuration = Configuration(("Database:RunMigrationsOnStartup", "false"));

        Assert.False(DatabaseMigration.ShouldMigrate(Environment("Development"), configuration));
    }

    private static IConfiguration Configuration(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(pair => new KeyValuePair<string, string?>(pair.Key, pair.Value)))
            .Build();

    private static IHostEnvironment Environment(string environmentName) => new TestHostEnvironment(environmentName);

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Kakeibo.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
