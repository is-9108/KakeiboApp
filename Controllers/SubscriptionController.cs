using Kakeibo.Services.Subscription;
using Microsoft.AspNetCore.Mvc;

namespace Kakeibo.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SubscriptionController : ControllerBase
    {
        private readonly ILogger<SubscriptionController> _logger;
        private readonly ISubscription _subscriptionService;
        public SubscriptionController(ISubscription subscriptionService, ILogger<SubscriptionController> logger)
        {
            _logger = logger;
            _subscriptionService = subscriptionService;
        }

        [HttpGet(Name = "GetSubscriptions")]
        public async Task<IActionResult> GetSubscriptions()
        {
            try
            {
                _logger.LogInformation("Getting subscriptions");
                var subscriptions = await _subscriptionService.GetSubscriptions();
                if (subscriptions == null)
                {
                    _logger.LogWarning("No subscriptions found");
                    return NotFound();
                }
                _logger.LogInformation($"{subscriptions.Count} subscriptions retrieved");
                return Ok(subscriptions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while getting subscriptions");
                return StatusCode(500, "An error occurred while processing your request.");
            }
        }
        [HttpGet("{id}", Name = "GetSubscription")]
        public async Task<IActionResult> GetSubscriptionById(int id)
        {
            try
            {
                _logger.LogInformation($"Getting subscription with id {id}");
                var subscription = await _subscriptionService.GetSubscription(id);
                if (subscription == null)
                {
                    _logger.LogWarning($"Subscription with id {id} not found");
                    return NotFound();
                }
                _logger.LogInformation($"Subscription with id {id} retrieved");
                return Ok(subscription);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error occurred while getting subscription with id {id}");
                return StatusCode(500, "An error occurred while processing your request.");

            }
        }
        [HttpPost]
        public async Task<IActionResult> CreateSubscription(DTO.RequestCreateSubscription request)
        {
            try
            {
                _logger.LogInformation("Creating subscription");
                await _subscriptionService.CreateSubscription(request);
                _logger.LogInformation("Subscription created");
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while creating subscription");
                return StatusCode(500, "An error occurred while processing your request.");
            }
        }
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateSubscription(int id,Models.Subscription request)
        {
            try
            {
                _logger.LogInformation($"Updating subscription with id {id}");
                await _subscriptionService.UpdateSubscription(request);
                _logger.LogInformation($"Subscription with id {id} updated");
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error occurred while updating subscription with id {request.Id}");
                return StatusCode(500, "An error occurred while processing your request.");

            }
        }
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSubscription(int id)
        {
            try
            {
                _logger.LogInformation($"Deleting subscription with id {id}");
                await _subscriptionService.DeleteSubscription(id);
                _logger.LogInformation($"Subscription with id {id} deleted");
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error occurred while deleting subscription with id {id}");
                return StatusCode(500, "An error occurred while processing your request.");

            }
        }
    }
}
