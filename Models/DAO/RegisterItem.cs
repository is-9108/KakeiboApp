using Microsoft.EntityFrameworkCore;

namespace KakeiboApp.Models.DAO
{
    public class RegisterItem
    {
        private readonly KakeiboContext context;

        public RegisterItem()
        {
            context = new KakeiboContext(
                new DbContextOptionsBuilder<KakeiboContext>()
                .UseSqlite("Data Source=kakeibo.db")
                    .Options);
        }
        public void Register(string name, int categoryId, int amount)
        {
            var transaction = new Entities.Transaction
            {
                Name = name,
                CategoryId = categoryId,
                Amount = amount
            };
            context.Transactions.Add(transaction);
            context.SaveChanges();
        }
    }
}
