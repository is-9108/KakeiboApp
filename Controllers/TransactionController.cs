using Kakeibo.Services.Transaction;
using Microsoft.AspNetCore.Mvc;

namespace Kakeibo.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TransactionController : ControllerBase
    {
        private readonly ILogger<TransactionController> _logger;
        private readonly ITransaction _transactionService;

        public TransactionController(ITransaction transactionService, ILogger<TransactionController> logger)
        {
            _logger = logger;
            _transactionService = transactionService;
        }

        [HttpGet(Name = "GetTransactions")]
        public async Task<IActionResult> GetTransactions()
        {
            try
            {
                _logger.LogInformation("Getting transactions");
                var response = await _transactionService.GetTransactions();
                if (response == null || response.Count == 0)
                {
                    _logger.LogInformation("No transactions found");
                    return NotFound("No transactions found.");
                }
                _logger.LogInformation($" {response.Count} transactions retrieved");
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while getting transactions");
                return StatusCode(500, "An error occurred while processing your request.");
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetTransactionById(int id)
        {
            try
            {
                _logger.LogInformation($"Getting transaction with id {id}");
                var transaction = await _transactionService.GetTransactionById(id);
                if (transaction == null)
                {
                    _logger.LogInformation($"Transaction with id {id} not found");
                    return NotFound($"Transaction with id {id} not found.");
                }
                _logger.LogInformation($"Transaction with id {id} retrieved");
                return Ok(transaction);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error occurred while getting transaction with id {id}");
                return StatusCode(500, "An error occurred while processing your request.");
            }
        }

        [HttpPost(Name = "CreateTransaction")]
        public async Task<IActionResult> CreateTransaction([FromBody] DTO.RequestCreateTransaction request)
        {
            try
            {
                _logger.LogInformation("Creating a new transaction");
                var transaction = await _transactionService.CreateTransaction(request);
                _logger.LogInformation($"Transaction with id {transaction.Id} created");
                return CreatedAtAction(nameof(GetTransactionById), new { id = transaction.Id }, transaction);

            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while creating transaction");
                return StatusCode(500, "An error occurred while processing your request.");
            }
        }
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateTransaction(int id, [FromBody] Models.Transaction request)
        {
            try
            {
                _logger.LogInformation($"Updating transaction with id {id}");
                var transaction = await _transactionService.UpdateTransaction(request);
                _logger.LogInformation($"Transaction with id {transaction} updated");
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error occurred while updating transaction with id {id}");
                return StatusCode(500, "An error occurred while processing your request.");

            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTransaction(int id)
        {
            try
            {
                _logger.LogInformation($"Deleting transaction with id {id}");
                var transaction = await _transactionService.DeleteTransaction(id);
                _logger.LogInformation($"Transaction with id {transaction} deleted");
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error occurred while deleting transaction with id {id}");
                return StatusCode(500, "An error occurred while processing your request.");

            }
        }
    }
}
