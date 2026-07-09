const router = require("express").Router();
const ctrl = require("../controllers/settings.controller");

router.get("/", ctrl.getSettings);
router.put("/", ctrl.updateSettings);
router.get("/export", ctrl.exportData);
router.post("/import", ctrl.importData);

module.exports = router;
