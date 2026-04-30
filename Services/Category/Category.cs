
using Kakeibo.Data;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Services.Category
{
    public class Category : ICategory
    {
        private readonly AppDbContext _context;
        public Category(AppDbContext context)
        {
            _context = context;
        }
        public async Task<List<Models.Category>> GetCategories()
        {
            var categories = await _context.Categories.ToListAsync();
            return categories;
        }

        public async Task<Models.Category?> GetCategoryById(int id)
        {
            var category = await _context.Categories.FindAsync(id);
            return category;
        }
    }
}
