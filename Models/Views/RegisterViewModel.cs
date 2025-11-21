using KakeiboApp.Models.Entities;

namespace KakeiboApp.Models.Views
{
    public class RegisterViewModel: ViewModelBase
    {
        public RegisterViewModel()
        {
            Title = "Register";
        }
        public List<Category> Categories { get; set; }
        
    }
}
