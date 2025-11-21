using KakeiboApp.Models.Entities;

namespace KakeiboApp.Models.Views
{
    public class ArchiveViewModel: ViewModelBase
    {
        public ArchiveViewModel()
        {
            Title = "Archive";
        }

        public List<Archive> Archives { get; set; }
    }
}
