using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KakeiboApp.Models.Entities
{
    public class Category
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        /// <summary>
        /// カテゴリ名
        /// </summary>
        public string CategoryName { get; set; }

        /// <summary>
        /// true:収入、false：支出
        /// </summary>
        public bool IsIncome { get; set; }
    }
}
