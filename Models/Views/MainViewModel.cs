using KakeiboApp.Models.DATA;

namespace KakeiboApp.Models.Views
{
    public class MainViewModel:ViewModelBase
    {
        public MainViewModel()
        {
            Title = "Main";
        }
        public List<MainViewData> Transactions{get;set;}
        public int TotalIncome { get; set; }
        public int TotalExpense { get; set; }
    }
}
