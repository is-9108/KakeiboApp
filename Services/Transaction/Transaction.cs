using Kakeibo.Data;
using Kakeibo.DTO;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Services.Transaction
{
    public class Transaction : ITransaction
    {
        private readonly AppDbContext _context;
        public Transaction(AppDbContext context)
        {
            _context = context;
        }
        public async Task<Models.Transaction> CreateTransaction(RequestCreateTransaction request)
        {
            var transaction = new Models.Transaction
            {
                CategoryId = request.Category,
                Amount = request.Amount,
                Memo = request.Memo,
                InsertDate = DateTime.UtcNow
            };
            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync();
            return transaction;
        }

        public async Task<int> DeleteTransaction(int id)
        {
            var transaction = _context.Transactions.Find(id);
            if (transaction == null)
            {
                throw new Exception($"Transaction with id {id} not found");
            }
            _context.Transactions.Remove(transaction);
            await _context.SaveChangesAsync();
            return id;
        }

        public async Task<Models.Transaction?> GetTransactionById(int id)
        {
            var transaction = await _context.Transactions.FindAsync(id);
            if (transaction == null)
            {
                throw new Exception($"Transaction with id {id} not found");
            }
            return transaction;
        }

        public async Task<List<Models.Transaction>> GetTransactions()
        {
            var transactions = await _context.Transactions.ToListAsync();
            return transactions;
        }

        public async Task<int> UpdateTransaction(Models.Transaction request)
        {
            var transaction = await _context.Transactions.FindAsync(request.Id);
            if (transaction == null)
            {
                throw new Exception($"Transaction with id {request.Id} not found");
            }
            transaction.CategoryId = request.CategoryId;
            transaction.Amount = request.Amount;
            transaction.Memo = request.Memo;
            _context.Transactions.Update(transaction);
            await _context.SaveChangesAsync();
            return request.Id;
        }
    }
}
