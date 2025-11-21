using System.ComponentModel.DataAnnotations;

namespace KakeiboApp.Models.Entities
{
    public class Archive
    {
        /// <summary>
        /// 日時
        /// </summary>
        [Key]
        public string date { get; set; }

        /// <summary>
        /// 収支
        /// </summary>
        public int Shuusi { get; set; }

        /// <summary>
        /// 収入
        /// </summary>
        public int Shuunyuu { get; set; }

        /// <summary>
        /// 支出
        /// </summary>
        public int Shishutu { get; set; }


    }
}
