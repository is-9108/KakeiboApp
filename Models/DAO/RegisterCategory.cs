using KakeiboApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace KakeiboApp.Models.DAO
{
    public class RegisterCategory
    {
        private KakeiboContext context;

        public RegisterCategory()
        {
            context = new KakeiboContext(
                new DbContextOptionsBuilder<KakeiboContext>()
                .UseSqlite("Data Source=kakeibo.db")
                    .Options);
        }
        /// <summary>
        /// true:収入, false:支出
        /// </summary>
        /// <param name="categoryName"></param>
        /// <param name="isIncome">true:収入, false:支出</param>
        public void Register(string categoryName, bool isIncome)
        {
            var category = new Category
            {
                CategoryName = categoryName,
                IsIncome = isIncome
            };

            context.Categories.Add(category);
            context.SaveChanges();
        }

        public List<Category> GetCategories()
        {
            return context.Categories.ToList();
        }

        public void Delete(int categoryId)
        {
            var category = context.Categories.Find(categoryId);
            if (category != null)
            {
                context.Categories.Remove(category);
                context.SaveChanges();
            }
        }
    }
}
