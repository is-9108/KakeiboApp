using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KakeiboApp.Models.Entities
{
    public class Subscription
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        /// <summary>
        /// サブスクリプション名
        /// </summary>
        public string SubscriptionName { get; set; }

        /// <summary>
        /// 金額
        /// </summary>
        public int Amount { get; set; }
    }
}
