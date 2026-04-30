using Kakeibo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CategoryController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<CategoryController> _logger;
        private readonly Services.Category.ICategory _categoryService;
        public CategoryController(AppDbContext context, ILogger<CategoryController> logger)
        {
            _context = context;
            _logger = logger;
            _categoryService = new Services.Category.Category(_context);
        }

        [HttpGet(Name = "GetCategories")]
        public async Task<IActionResult> ActionResult()
        {
            _logger.LogInformation("Getting categories");
            var categories = await _categoryService.GetCategories();
            _logger.LogInformation("categories retrieved");
            return Ok(categories);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ActionResult(int id)
        {
            _logger.LogInformation($"Getting category with id {id}");
            var category = await _categoryService.GetCategoryById(id);
            _logger.LogInformation($"Category with id {id} retrieved");
            return Ok(category);
        }
    }
}
