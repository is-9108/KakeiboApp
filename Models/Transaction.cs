namespace Kakeibo.Models
{
    public class Transaction
    {
        public int Id { get; set; }
        /// <summary>
        /// カテゴリID
        /// </summary>
        public int CategoryId { get; set; }
        /// <summary>
        /// 金額
        /// </summary>
        public int Amount { get; set; }
        public string Memo { get; set; } = string.Empty;
        public DateTime InsertDate { get; set; }

    }
}
