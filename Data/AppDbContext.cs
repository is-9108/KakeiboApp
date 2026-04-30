using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Data
{
    public class AppDbContext: DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<Models.Category> Categories { get; set; }
        public DbSet<Models.Transaction> Transactions { get; set; }
        public DbSet<Models.Monthly> Monthlies { get; set; }
        public DbSet<Models.Subscription> Subscriptions { get; set; }
    }
}
