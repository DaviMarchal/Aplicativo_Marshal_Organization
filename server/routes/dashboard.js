const router = require("express").Router();
const ctrl = require("../controllers/dashboard.controller");

router.get("/", ctrl.get);

module.exports = router;
