using KakeiboApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using SQLitePCL;

namespace KakeiboApp.Models
{
    public class KakeiboContext : DbContext
    {
        public KakeiboContext(DbContextOptions<KakeiboContext> options)
        : base(options)
        {
        }

        public virtual DbSet<Archive> Archives { get; set; }
        public virtual DbSet<Category> Categories { get; set; }
        public virtual DbSet<Subscription> Subscriptions { get; set; }
        public virtual DbSet<Transaction> Transactions { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<Category>().HasData(
                new Category { Id = 1, CategoryName = "サブスク", IsIncome = false }
                );
        }
    }
}
