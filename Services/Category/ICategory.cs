namespace Kakeibo.Services.Category
{
    public interface ICategory
    {
        public Task<List<Models.Category>> GetCategories();
        public Task<Models.Category?> GetCategoryById(int id);
    }
}
