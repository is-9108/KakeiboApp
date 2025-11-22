using KakeiboApp.Models.Entities;

namespace KakeiboApp.Models.Views
{
    public class SubscriptionViewModel: ViewModelBase
    {
        public SubscriptionViewModel()
        {
            Title = "Subscription";
        }
        public List<Subscription> Subscriptions { get; set; }
    }
}
