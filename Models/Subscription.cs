namespace Kakeibo.Models
{
    public class Subscription
    {
        public int Id { get; set; }
        /// <summary>
        /// カテゴリ名
        /// </summary>
        public required string Name { get; set; }
        /// <summary>
        /// 料金
        /// </summary>
        public int Amount { get; set; }
    }
}
