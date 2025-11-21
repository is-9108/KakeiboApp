using KakeiboApp.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using SQLitePCL;

namespace KakeiboApp.Models
{
    public class KakeiboContextFactory : IDesignTimeDbContextFactory<KakeiboContext>
    {
        public KakeiboContext CreateDbContext(string[] args)
        {
            // SQLite を初期化（デザイン時に必須）
            Batteries.Init();

            var optionsBuilder = new DbContextOptionsBuilder<KakeiboContext>();
            optionsBuilder.UseSqlite("Data Source=kakeibo.db");

            return new KakeiboContext(optionsBuilder.Options);
        }
    }
}