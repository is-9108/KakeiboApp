namespace Kakeibo.Models
{
    public class Monthly
    {
        public int Id { get; set; }
        /// <summary>
        /// 収支
        /// </summary>
        public int Shuusi { get; set; }
        /// <summary>
        /// 給料
        /// </summary>
        public int Kyuuryo { get; set; } = 0;
        /// <summary>
        /// その他収入
        /// </summary>
        public int SonotaShuunyuu { get; set; } = 0;
        /// <summary>
        /// 家賃
        /// </summary>
        public int Yatin { get; set; } = 0;
        /// <summary>
        /// 食費
        /// </summary>
        public int Shokuhi { get; set; } = 0;
        /// <summary>
        /// 交通費
        /// </summary>
        public int Kootsuuhi { get; set; } = 0;
        /// <summary>
        /// 外食費
        /// </summary>
        public int Gaishokuhi { get; set; } = 0;
        /// <summary>
        /// 日用品費
        /// </summary>
        public int Nichiyouhin { get; set; } = 0;
        /// <summary>
        /// 書籍
        /// </summary>
        public int Shoseki { get; set; } = 0;
        /// <summary>
        /// サブスク
        /// </summary>
        public int Subscription { get; set; } = 0;
        /// <summary>
        /// 光熱費
        /// </summary>
        public int Koutsuuhi { get; set; } = 0;
        /// <summary>
        /// 水道代
        /// </summary>
        public int Suidouhi { get; set; } = 0;
        /// <summary>
        /// 服
        /// </summary>
        public int Fuku { get; set; }
        /// <summary>
        /// その他支出
        /// 
        /// </summary>
        public int SonotaShishutsu { get; set; } = 0;

    }
}
