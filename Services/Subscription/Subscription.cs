using Kakeibo.Data;
using Kakeibo.DTO;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Services.Subscription
{
    public class Subscription : ISubscription
    {
        private readonly AppDbContext _context;
        public Subscription(AppDbContext context)
        {
            _context = context;
        }
        public async Task CreateSubscription(RequestCreateSubscription request)
        {
            var subscription = new Models.Subscription
            {
                Name = request.Name,
                Amount = request.Amount
            };
            await _context.Subscriptions.AddAsync(subscription);
            await _context.SaveChangesAsync();
            return;
        }

        public async Task DeleteSubscription(int id)
        {
            await _context.Subscriptions.Where(x => x.Id == id).ExecuteDeleteAsync();
            return;

        }

        public async Task<Models.Subscription> GetSubscription(int id)
        {
            var subscription = await _context.Subscriptions.FirstOrDefaultAsync(x => x.Id == id);
            return subscription;
        }

        public async Task<List<Models.Subscription>> GetSubscriptions()
        {
            var subscriptions = await _context.Subscriptions.ToListAsync();
            return subscriptions;
        }

        public async Task UpdateSubscription(Models.Subscription request)
        {
            var subscription = _context.Subscriptions.FirstOrDefault(x => x.Id == request.Id);
            if (subscription == null)
            {
                throw new Exception("Subscription not found");
            }
            subscription.Name = request.Name;
            subscription.Amount = request.Amount;
            await _context.SaveChangesAsync();
            return;
        }

    }
}
