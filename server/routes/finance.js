const router = require("express").Router();
const ctrl = require("../controllers/finance.controller");

router.get("/accounts", ctrl.listAccounts);
router.post("/accounts", ctrl.createAccount);
router.put("/accounts/:id", ctrl.updateAccount);
router.delete("/accounts/:id", ctrl.deleteAccount);

router.get("/categories", ctrl.listCategories);
router.post("/categories", ctrl.createCategory);
router.put("/categories/:id", ctrl.updateCategory);
router.delete("/categories/:id", ctrl.deleteCategory);

router.get("/transactions", ctrl.listTransactions);
router.post("/transactions", ctrl.createTransaction);
router.delete("/transactions/bulk", ctrl.bulkDeleteTransactions); // antes de /:id, senão "bulk" vira um id
router.put("/transactions/:id", ctrl.updateTransaction);
router.delete("/transactions/:id", ctrl.deleteTransaction);

router.get("/budgets", ctrl.listBudgets);
router.post("/budgets", ctrl.createBudget);
router.put("/budgets/:id", ctrl.updateBudget);
router.delete("/budgets/:id", ctrl.deleteBudget);

router.get("/recurring", ctrl.listRecurring);
router.post("/recurring", ctrl.createRecurring);
router.put("/recurring/:id", ctrl.updateRecurring);
router.delete("/recurring/:id", ctrl.deleteRecurring);

router.get("/installments/forecast", ctrl.installmentsForecast);
router.get("/installments", ctrl.listInstallments);
router.post("/installments", ctrl.createInstallment);
router.put("/installments/:id", ctrl.updateInstallment);
router.delete("/installments/:id", ctrl.deleteInstallment);

router.get("/savings-boxes", ctrl.listSavingsBoxes);
router.post("/savings-boxes", ctrl.createSavingsBox);
router.put("/savings-boxes/:id", ctrl.updateSavingsBox);
router.delete("/savings-boxes/:id", ctrl.deleteSavingsBox);
router.get("/savings-boxes/:id/entries", ctrl.listSavingsBoxEntries);
router.post("/savings-boxes/:id/entries", ctrl.createSavingsBoxEntry);

router.get("/summary", ctrl.summary);
router.get("/series", ctrl.series);
router.get("/donut", ctrl.donut);

module.exports = router;
