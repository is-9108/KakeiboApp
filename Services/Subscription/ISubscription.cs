namespace Kakeibo.Services.Subscription
{
    public interface ISubscription
    {
        public Task<List<Models.Subscription>> GetSubscriptions();
        public Task<Models.Subscription> GetSubscription(int id);
        public Task CreateSubscription(DTO.RequestCreateSubscription request);
        public Task UpdateSubscription(Models.Subscription request);
        public Task DeleteSubscription(int id);
    }
}
