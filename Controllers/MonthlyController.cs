using Kakeibo.Services.Monthly;
using Microsoft.AspNetCore.Mvc;

namespace Kakeibo.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class MonthlyController : ControllerBase
    {
        private readonly ILogger<MonthlyController> _logger;
        private readonly IMonthly _monthlyService;

        public MonthlyController(IMonthly monthlyService, ILogger<MonthlyController> logger)
        {
            _logger = logger;
            _monthlyService = monthlyService;
        }

        [HttpGet(Name = "GetMonthly")]
        public async Task<IActionResult> GetMonthly()
        {
            try
            {
                _logger.LogInformation("Getting monthly data");
                var monthlyData = await _monthlyService.GetMonthlies();
                if (monthlyData == null)
                {
                    _logger.LogWarning("No monthly data found");
                    return NotFound();
                }
                _logger.LogInformation($"{monthlyData.Count} monthly data retrieved");
                return Ok(monthlyData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while getting monthly data");
                return StatusCode(500, "An error occurred while processing your request.");
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreateMonthlyReport()
        {
            try
            {
                _logger.LogInformation("Creating monthly report");
                await _monthlyService.CreateMonthlyReport();
                _logger.LogInformation("Monthly report created");
                _logger.LogInformation("Delete all transactions");
                await _monthlyService.DeleteTransaction();
                _logger.LogInformation("All transactions deleted");
                _logger.LogInformation("Register subscriptions");
                await _monthlyService.RegisterSubscription();
                _logger.LogInformation("Subscriptions registered");
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while creating monthly report");
                return StatusCode(500, "An error occurred while processing your request.");

            }
        }
    }
}
