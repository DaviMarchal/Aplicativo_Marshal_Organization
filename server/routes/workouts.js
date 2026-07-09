const router = require("express").Router();
const ctrl = require("../controllers/workouts.controller");

router.get("/exercises", ctrl.listExercises);
router.post("/exercises", ctrl.createExercise);
router.put("/exercises/:id", ctrl.updateExercise);
router.delete("/exercises/:id", ctrl.deleteExercise);

router.get("/plans", ctrl.listPlans);
router.get("/plans/:id", ctrl.getPlan);
router.post("/plans", ctrl.createPlan);
router.put("/plans/:id", ctrl.updatePlan);
router.delete("/plans/:id", ctrl.deletePlan);

router.get("/today", ctrl.today);
router.get("/tomorrow", ctrl.tomorrow);
router.post("/:planId/log", ctrl.log);
router.get("/:planId/history", ctrl.history);
router.get("/:planId/streak", ctrl.streak);

module.exports = router;
