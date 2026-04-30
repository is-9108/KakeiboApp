
using Kakeibo.Data;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Services.Monthly
{
    public class Monthly : IMonthly
    {
        private readonly AppDbContext _context;
        public Monthly(AppDbContext context)
        {
            _context = context;
        }
        public async Task CreateMonthlyReport()
        {
            var lastReport = await _context.Transactions
                .Where(t => t.InsertDate <= DateTime.UtcNow).ToListAsync();
            var report = new Models.Monthly
            {
                Shuusi = lastReport.Sum(t => t.Amount),
                Kyuuryo = lastReport.Where(t => t.CategoryId == 1).Sum(t => t.Amount),
                SonotaShuunyuu = lastReport.Where(t => t.CategoryId == 2).Sum(t => t.Amount),
                Yatin = lastReport.Where(t => t.CategoryId == 3).Sum(t => t.Amount),
                Shokuhi = lastReport.Where(t => t.CategoryId == 4).Sum(t => t.Amount),
                Kootsuuhi = lastReport.Where(t => t.CategoryId == 5).Sum(t => t.Amount),
                Gaishokuhi = lastReport.Where(t => t.CategoryId == 6).Sum(t => t.Amount),
                Nichiyouhin = lastReport.Where(t => t.CategoryId == 7).Sum(t => t.Amount),
                Shoseki = lastReport.Where(t => t.CategoryId == 8).Sum(t => t.Amount),
                Subscription = lastReport.Where(t => t.CategoryId == 9).Sum(t => t.Amount),
                Koutsuuhi = lastReport.Where(t => t.CategoryId == 10).Sum(t => t.Amount),
                Suidouhi = lastReport.Where(t => t.CategoryId == 11).Sum(t => t.Amount),
                Fuku = lastReport.Where(t => t.CategoryId == 12).Sum(t => t.Amount),
                SonotaShishutsu = lastReport.Where(t => t.CategoryId == 13).Sum(t => t.Amount)
            };
            _context.Monthlies.Add(report);
            await _context.SaveChangesAsync();
            return;
        }

        public async Task<List<Models.Monthly>> GetMonthlies()
        {
            var report = await _context.Monthlies.ToListAsync();
            return report;
        }
    }
}
