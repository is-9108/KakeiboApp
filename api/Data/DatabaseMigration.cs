using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Kakeibo.Api.Data;

/// <summary>
/// 起動時にEF Coreのマイグレーションを実行するか判定する。
/// 本番（Production）では設定にかかわらず実行しない。開発・テストでも明示的に有効化された場合だけ実行する。
/// これにより、本番で設定が未指定の場合もDDLを実行しない安全側の動作になる。
/// </summary>
public static class DatabaseMigration
{
    /// <summary>起動時マイグレーションを有効化する設定キー。</summary>
    public const string ConfigurationKey = "Database:RunMigrationsOnStartup";

    public static bool ShouldMigrate(IHostEnvironment environment, IConfiguration configuration) =>
        !environment.IsProduction() &&
        configuration.GetValue<bool>(ConfigurationKey);
}
