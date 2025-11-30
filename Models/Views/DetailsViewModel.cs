using KakeiboApp.Models.Entities;

namespace KakeiboApp.Models.Views
{
    public class DetailsViewModel: ViewModelBase
    {
        public DetailsViewModel() 
        { 
            Title = "Details";
        }

        public string CategoryName { get; set; }

        public List<Transaction> Details { get; set; }
    }
}
