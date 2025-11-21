using KakeiboApp.Models.DATA;
using KakeiboApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace KakeiboApp.Models.DAO
{
    public class GetCategoriesDao
    {
        private KakeiboContext context;
        public GetCategoriesDao()
        {
            context = new KakeiboContext(
                new DbContextOptionsBuilder<KakeiboContext>()
                .UseSqlite("Data Source=kakeibo.db")
                    .Options);
        }
        public List<Category> GetTransactions()
        {

            var categories = context.Categories.ToList();

            return categories;
        }
    }
}
