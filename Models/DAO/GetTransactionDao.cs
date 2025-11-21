using KakeiboApp.Models.DATA;
using Microsoft.EntityFrameworkCore;
using System.Runtime.InteropServices;

namespace KakeiboApp.Models.DAO
{
    public class GetTransactionDao
    {
        private readonly KakeiboContext context;
        public GetTransactionDao()
        { 
            context = new KakeiboContext(
                new DbContextOptionsBuilder<KakeiboContext>()
                .UseSqlite("Data Source=kakeibo.db")
                    .Options);
        }
        public List<MainViewData> GetTransactions()
        {
            var transactions = context.Transactions.Include(t => t.Category).Select(t => new MainViewData
            {
                Name = t.Name,
                Amount = t.Amount,
                CategoryName = t.Category.CategoryName,
            }).ToList();

            return transactions;
        }

        public int GetTotalIncome()
        {
            var totalIncome = context.Transactions
                .Where(x => x.Category.IsIncome)
                .Sum(x => x.Amount);

            return totalIncome;
        }

        public int GetTotalExpense()
        {
            var totalExpense = context.Transactions
                .Where(x => !x.Category.IsIncome)
                .Sum(x => x.Amount);
            return totalExpense;
        }
    }
}
