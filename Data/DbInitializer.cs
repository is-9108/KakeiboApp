namespace Kakeibo.Data
{
    public class DbInitializer
    {
        public static async Task Initialize(AppDbContext context)
        {
            await context.Database.EnsureCreatedAsync();
            if (context.Categories.Any())
            {
                return; 
            }
            var categories = new Models.Category[]
            {
                new Models.Category { Name = "給料", IsIncome = true},
                new Models.Category { Name = "その他収入", IsIncome = true},
                new Models.Category { Name = "家賃", IsIncome = false},
                new Models.Category { Name = "食費", IsIncome = false},
                new Models.Category { Name = "光熱費", IsIncome = false},
                new Models.Category { Name = "外食費", IsIncome = false},
                new Models.Category { Name = "日用品", IsIncome = false},
                new Models.Category { Name = "書籍", IsIncome = false},
                new Models.Category { Name = "サブスク", IsIncome = false},
                new Models.Category { Name = "交通費", IsIncome = false},
                new Models.Category { Name = "水道代", IsIncome = false},
                new Models.Category { Name = "服", IsIncome = false},
                new Models.Category { Name = "その他支出", IsIncome = false}
            };
            await context.Categories.AddRangeAsync(categories);
            await context.SaveChangesAsync();
        }
    }
}
