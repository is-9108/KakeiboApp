using Kakeibo.Data;
using Microsoft.AspNetCore.Mvc;

namespace Kakeibo.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class MonthlyController : ControllerBase
    {
        private readonly ILogger<MonthlyController> _logger;
        private readonly AppDbContext _context;
        private readonly Services.Monthly.IMonthly _monthlyService;

        public MonthlyController(AppDbContext context, ILogger<MonthlyController> logger)
        {
            _context = context;
            _logger = logger;
            _monthlyService = new Services.Monthly.Monthly(_context);
        }

        [HttpGet(Name = "GetMonthly")]
        public IActionResult ActionResult()
        {
            _logger.LogInformation("Getting monthly data");
            var monthlyData = _monthlyService.GetMonthlies().Result;
            _logger.LogInformation($"{monthlyData.Count} monthly data retrieved");
            return Ok(monthlyData);
        }

        [HttpPost]
        public IActionResult CreateMonthlyReport()
        {
            _logger.LogInformation("Creating monthly report");
            _monthlyService.CreateMonthlyReport().Wait();
            _logger.LogInformation("Monthly report created");
            return NoContent();
        }
    }
}
