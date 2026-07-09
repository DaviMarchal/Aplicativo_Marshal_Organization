const router = require("express").Router();
const ctrl = require("../controllers/goals.controller");

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

router.get("/:id/progress", ctrl.progress);
router.get("/:id/checkins", ctrl.listCheckins);
router.post("/:id/checkins", ctrl.createCheckin);
router.get("/:id/links", ctrl.listLinks);
router.post("/:id/links", ctrl.addLink);
router.delete("/:id/links/:taskId", ctrl.removeLink);

module.exports = router;
