using KakeiboApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace KakeiboApp.Models.DAO
{
    public class GetArcheveDao
    {
        private readonly KakeiboContext context;
        public GetArcheveDao()
        {
            context = new KakeiboContext(
                new DbContextOptionsBuilder<KakeiboContext>()
                .UseSqlite("Data Source=kakeibo.db")
                    .Options);
        }

        public List<Archive> GetArchives()
        {
            var archives = context.Archives.ToList();
            return archives;
        }
    }
}
