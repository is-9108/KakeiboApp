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

        public IActionResult Category()
        {
            var viewModel = new CategoryViewModel()
            {
                Categories = new Models.DAO.RegisterCategory().GetCategories()
            };
            return View(viewModel.Title,viewModel);
        }

        public IActionResult Subscription()
        {
            var viewModel = new SubscriptionViewModel()
            {
                Subscriptions = new Models.DAO.RegisterSubscription().GetSubscriptions()
            };
            return View(viewModel.Title,viewModel);
        }

        [HttpGet]
        public IActionResult CategoryRegister()
        {
            var viewModel = new CategoryRegister();
            return View(viewModel.Title);
        }

        [HttpPost]
        public IActionResult CategoryRegister(string name, bool isIncome)
        {
            var viewModel = new CategoryRegister();
            var dao = new Models.DAO.RegisterCategory();
            dao.Register(name, isIncome);
            return View(viewModel.Title);
        }
        [HttpGet]
        public IActionResult SubscriptionRegister()
        {
            var viewModel = new SubscriptionRegister();
            viewModel.Subscriptions = new Models.DAO.RegisterSubscription().GetSubscriptions();
            return View(viewModel.Title);
        }

        [HttpPost]
        public IActionResult SubscriptionRegister(string subscriptionName,int Amount)
        {
            var dao = new Models.DAO.RegisterSubscription();
            dao.Register(subscriptionName, Amount);
            var transactionDao = new Models.DAO.RegisterItem();
            transactionDao.Register(subscriptionName, 1, Amount);
            return View("SubscriptionRegister");
        }

        public IActionResult Archive()
        {
            var viewModel = new ArchiveViewModel()
            {
                Archives = new Models.DAO.GetArcheveDao().GetArchives()
            };
            return View(viewModel.Title,viewModel);
        }

        public IActionResult RegisterArchive()
        {
            var viewModel = new Models.DAO.RegisterArchive();
            viewModel.Register();
            var dao = new Models.DAO.RegisterSubscription();
            dao.FirstRegister();
            return Archive();
        }

        public IActionResult DeleteCategory(int id)
        {
            var dao = new Models.DAO.RegisterCategory();
            dao.Delete(id);
            return Category();
        }

        public IActionResult DeleteSubscription(int id) 
        {
            var dao = new Models.DAO.RegisterSubscription();
            dao.Delete(id);
            return Subscription();
        }

        public IActionResult Details(int categoryID,string categoryName)
        {
            var viewModel = new DetailsViewModel();
            var dao = new Models.DAO.GetTransactionDao();
            viewModel.Details = dao.GetDetail(categoryID);
            viewModel.CategoryName = categoryName;

            return View(viewModel.Title,viewModel);
        }

        public IActionResult Delete(int ID)
        {
            var dao = new Models.DAO.GetTransactionDao();
            dao.Delete(ID);
            return View();
        }
    }
}
