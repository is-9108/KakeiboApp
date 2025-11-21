using KakeiboApp.Models.Views;
using Microsoft.AspNetCore.Mvc;

namespace KakeiboApp.Controllers
{
    public class KakeiboController : Controller
    {
        public IActionResult Index()
        {
            var viewModel = new MainViewModel()
            {
                Transactions = new Models.DAO.GetTransactionDao().GetTransactions(),
                TotalIncome = new Models.DAO.GetTransactionDao().GetTotalIncome(),
                TotalExpense = new Models.DAO.GetTransactionDao().GetTotalExpense()
            };
            return View(viewModel.Title,viewModel);
        }

        [HttpGet]
        public IActionResult Register()
        {
            var viewModel = new RegisterViewModel();
            viewModel.Categories = new Models.DAO.GetCategoriesDao().GetTransactions();
            return View(viewModel.Title,viewModel);
        }

        [HttpPost]
        public IActionResult Register(string itemName, int categoryId, int amount)
        {
            var dao = new Models.DAO.RegisterItem();
            dao.Register(itemName, categoryId, amount);
            return Register();
        }

        [HttpPost]
        public IActionResult RegisterItem(MainViewModel model)
        {

            return View("Main");
        }
        [HttpGet]
        public IActionResult CategoryRegister()
        {
            return View("CategoryRegister");
        }

        [HttpPost]
        public IActionResult CategoryRegister(string name, bool isIncome)
        {
            var dao = new Models.DAO.RegisterCategory();
            dao.Register(name, isIncome);
            return View("CategoryRegister");
        }
        [HttpGet]
        public IActionResult SubscriptionRegister()
        {
            return View("SubscriptionRegister");
        }

        [HttpPost]
        public IActionResult SubscriptionRegister(string subscriptionName,int Amount)
        {
            var dao = new Models.DAO.RegisterSubscription();
            dao.Register(subscriptionName, Amount);
            return View("SubscriptionRegister");
        }

    }
}
