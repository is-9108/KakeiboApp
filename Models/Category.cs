namespace Kakeibo.Models
{
    public class Category
    {
        
        public int Id { get; set; }
        /// <summary>
        /// カテゴリ名
        /// </summary>
        public required string Name { get; set; }
        /// <summary>
        /// 収支フラグ。trueなら収入、falseなら支出。
        /// </summary>
        public bool IsIncome { get; set; }

    }
}
