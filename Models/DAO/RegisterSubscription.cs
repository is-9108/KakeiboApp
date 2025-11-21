using KakeiboApp.Models.DATA;
using KakeiboApp.Models.Entities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace KakeiboApp.Models.DAO
{
    public class RegisterSubscription
    {
        private readonly KakeiboContext context;

        public RegisterSubscription()
        {
            context = new KakeiboContext(
                new DbContextOptionsBuilder<KakeiboContext>()
                .UseSqlite("Data Source=kakeibo.db")
                    .Options);
        }

        public void Register(string subscriptionName, int amount)
        {
            var subscription = new Subscription
            {
                SubscriptionName = subscriptionName,
                Amount = amount
            };
            context.Subscriptions.Add(subscription);
            context.SaveChanges();

            var transactions = context.Transactions.Where(x => x.Category.CategoryName == "サブスク").ToList();
            var subscriptions = context.Subscriptions.ToList();

            var transactionList = new List<Transaction>();

            foreach (var sub in subscriptions)
            {
                foreach (var t in transactions)
                {
                    if (t.Name == subscription.SubscriptionName)
                    {
                        continue;
                    }
                    else
                    {
                        var transaction = new Transaction
                        {
                            Name = sub.SubscriptionName,
                            Amount = sub.Amount,
                            CategoryId = 1
                        };
                        transactionList.Add(transaction);
                        break;
                    }
                }
            }
            if (transactionList.Count > 0)
            {
                context.Transactions.AddRange(transactionList);
                context.SaveChanges();
            }
        }
    }
}
