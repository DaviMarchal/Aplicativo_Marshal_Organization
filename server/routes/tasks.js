const router = require("express").Router();
const ctrl = require("../controllers/tasks.controller");

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.patch("/:id/status", ctrl.updateStatus);
router.post("/:id/toggle", ctrl.toggle);

module.exports = router;
