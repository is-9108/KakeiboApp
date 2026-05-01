namespace Kakeibo.Services.Monthly
{
    public interface IMonthly
    {
        public Task<List<Models.Monthly>> GetMonthlies();
        public Task CreateMonthlyReport();
        public Task DeleteTransaction();
        public Task RegisterSubscription();
    }
}
