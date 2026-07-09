const router = require("express").Router();
const ctrl = require("../controllers/routines.controller");

router.get("/today", ctrl.today);
router.get("/heatmap", ctrl.heatmap);

module.exports = router;
