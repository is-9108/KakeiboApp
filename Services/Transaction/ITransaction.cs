namespace Kakeibo.Services.Transaction
{
    public interface ITransaction
    {
        public Task<List<Models.Transaction>> GetTransactions();
        public Task<Models.Transaction?> GetTransactionById(int id);
        public Task<Models.Transaction> CreateTransaction(DTO.RequestCreateTransaction request);
        public Task<int> UpdateTransaction(Models.Transaction request);
        public Task<int> DeleteTransaction(int id);
    }
}
