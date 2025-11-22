using KakeiboApp.Models.Entities;

namespace KakeiboApp.Models.Views
{
    public class CategoryViewModel: ViewModelBase
    {
        public CategoryViewModel() 
        { 
            Title = "Category";
        }
        public List<Category> Categories { get; set; }
    }
}
