using Kakeibo.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Kakeibo.Api.Data;

/// <summary>dotnet ef コマンド用のDbContextファクトリ。アプリ起動時はDIで解決される。</summary>
public class KakeiboDbContextFactory : IDesignTimeDbContextFactory<KakeiboDbContext>
{
    public KakeiboDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<KakeiboDbContext>();
        optionsBuilder.UseNpgsql("Host=localhost;Database=kakeibo_design_time");
        return new KakeiboDbContext(optionsBuilder.Options);
    }
}
