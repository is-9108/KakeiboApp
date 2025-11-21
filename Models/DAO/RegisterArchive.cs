using KakeiboApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace KakeiboApp.Models.DAO
{
    public class RegisterArchive
    {
        private readonly KakeiboContext context;
        public RegisterArchive()
        {
            context = new KakeiboContext(
                new DbContextOptionsBuilder<KakeiboContext>()
                .UseSqlite("Data Source=kakeibo.db")
                    .Options);
        }
        public void Register()
        {
            var transactions = new GetTransactionDao();
            var archive = new Archive
            {
                date = DateTime.Now.ToString("yyyy-MM"),
                Shishutu = transactions.GetTotalExpense(),
                Shuunyuu = transactions.GetTotalIncome(),
                Shuusi = transactions.GetTotalIncome() - transactions.GetTotalExpense()
            };
            context.Archives.Add(archive);
            context.SaveChanges();
        }
    }
}
