using Kakeibo.Services.Category;
using Microsoft.AspNetCore.Mvc;

namespace Kakeibo.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CategoryController : ControllerBase
    {
        private readonly ILogger<CategoryController> _logger;
        private readonly ICategory _categoryService;
        public CategoryController(ILogger<CategoryController> logger, ICategory categoryService)
        {
            _logger = logger;
            _categoryService = categoryService;
        }

        [HttpGet(Name = "GetCategories")]
        public async Task<IActionResult> GetCategories()
        {
            try
            {
                _logger.LogInformation("Getting categories");
                var categories = await _categoryService.GetCategories();
                if(categories == null || categories.Count == 0)
                {
                    _logger.LogInformation("No categories found");
                    return NotFound("No categories found.");
                }
                _logger.LogInformation("categories retrieved");
                return Ok(categories);
            }
            catch(Exception ex)
            {
                _logger.LogError(ex, "Error occurred while getting categories");
                return StatusCode(500, "An error occurred while processing your request.");
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetCategoryById(int id)
        {
            try
            {
                _logger.LogInformation($"Getting category with id {id}");
                var category = await _categoryService.GetCategoryById(id);
                if(category == null)
                {
                    _logger.LogInformation($"Category with id {id} not found");
                    return NotFound($"Category with id {id} not found.");
                }
                _logger.LogInformation($"Category with id {id} retrieved");
                return Ok(category);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error occurred while getting category with id {id}");
                return StatusCode(500, "An error occurred while processing your request.");

            }
        }
    }
}
