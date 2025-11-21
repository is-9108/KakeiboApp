using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KakeiboApp.Models.Entities
{
    public class Transaction
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }
        /// <summary>
        /// カテゴリ
        /// </summary>
        public int CategoryId { get; set; }

        /// <summary>
        /// 名前
        /// </summary>
        public string Name { get; set; }
        /// <summary>
        /// 金額
        /// </summary>
        public int Amount { get; set; }

        public Category Category { get; set; }
    }
}
