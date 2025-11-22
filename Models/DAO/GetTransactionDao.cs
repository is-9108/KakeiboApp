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
            var transactions = context.Transactions
                .GroupBy(x => x.Category.CategoryName)
                .Select(g => new MainViewData
                {
                    CategoryName = g.Key,
                    TotalAmount = g.Sum(t => t.Amount)
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
