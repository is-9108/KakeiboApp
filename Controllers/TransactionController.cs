using Kakeibo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TransactionController : ControllerBase
    {
        private readonly ILogger<TransactionController> _logger;
        private readonly AppDbContext _context;
        private readonly Services.Transaction.ITransaction _transactionService;

        public TransactionController(AppDbContext context, ILogger<TransactionController> logger)
        {
            _context = context;
            _logger = logger;
            _transactionService = new Services.Transaction.Transaction(_context);
        }

        [HttpGet(Name = "GetTransactions")]
        public async Task<IActionResult> GetTransactions()
        {
            _logger.LogInformation("Getting transactions");
            var response = await _transactionService.GetTransactions();
            _logger.LogInformation($" {response.Count} transactions retrieved");
            return Ok(response);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetTransactionById(int id)
        {
            _logger.LogInformation($"Getting transaction with id {id}");
            var transaction = await _transactionService.GetTransactionById(id);
            _logger.LogInformation($"Transaction with id {id} retrieved");
            return Ok(transaction);
        }

        [HttpPost(Name = "CreateTransaction")]
        public async Task<IActionResult> CreateTransaction([FromBody] DTO.RequestCreateTransaction request)
        {
            _logger.LogInformation("Creating a new transaction");
            var transaction = await _transactionService.CreateTransaction(request);
            _logger.LogInformation($"Transaction with id {transaction.Id} created");
            return CreatedAtAction(nameof(ActionResult), new { id = transaction.Id }, transaction);
        }
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateTransaction(int id, [FromBody] Models.Transaction request)
        {
            _logger.LogInformation($"Updating transaction with id {id}");
            var transaction = await _transactionService.UpdateTransaction(request);
            _logger.LogInformation($"Transaction with id {transaction} updated");
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTransaction(int id)
        {
            _logger.LogInformation($"Deleting transaction with id {id}");
            var transaction = await _transactionService.DeleteTransaction(id);
            _logger.LogInformation($"Transaction with id {transaction} deleted");
            return NoContent();
        }
    }
}
