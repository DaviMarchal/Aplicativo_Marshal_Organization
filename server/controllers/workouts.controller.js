const pool = require("../db");
const { todayStr, addDays, dayOfWeek, monthRange } = require("../utils/dates");
const { computeStreak } = require("../utils/recurrence");

// ============================== EXERCÍCIOS ==================================
async function listExercises(req, res, next) {
  try {
    const { muscle_group } = req.query;
    const params = [req.userId];
    let where = "WHERE user_id = ?";
    if (muscle_group) {
      where += " AND muscle_group = ?";
      params.push(muscle_group);
    }
    const [rows] = await pool.query(`SELECT * FROM exercises ${where} ORDER BY muscle_group, name`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createExercise(req, res, next) {
  try {
    const { name, muscle_group } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nome é obrigatório." });
    const [result] = await pool.query(`INSERT INTO exercises (user_id, name, muscle_group) VALUES (?, ?, ?)`, [
      req.userId,
      name.trim(),
      muscle_group || null,
    ]);
    res.status(201).json({ id: result.insertId, name, muscle_group });
  } catch (err) {
    next(err);
  }
}

async function updateExercise(req, res, next) {
  try {
    const { name, muscle_group } = req.body;
    const [result] = await pool.query(`UPDATE exercises SET name=?, muscle_group=? WHERE id=? AND user_id=?`, [
      name,
      muscle_group,
      req.params.id,
      req.userId,
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: "Exercício não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteExercise(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM exercises WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Exercício não encontrado." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================== PLANOS DE TREINO ============================
async function attachPlanDetails(plans) {
  if (!plans.length) return plans;
  const ids = plans.map((p) => p.id);
  const [exRows] = await pool.query(
    `SELECT wpe.*, e.name AS exercise_name, e.muscle_group FROM workout_plan_exercises wpe
     JOIN exercises e ON e.id = wpe.exercise_id WHERE wpe.plan_id IN (?) ORDER BY wpe.sort_order`,
    [ids]
  );
  const [dayRows] = await pool.query(`SELECT plan_id, day_of_week FROM workout_schedule WHERE plan_id IN (?)`, [
    ids,
  ]);
  const exByPlan = {};
  exRows.forEach((r) => (exByPlan[r.plan_id] ||= []).push(r));
  const daysByPlan = {};
  dayRows.forEach((r) => (daysByPlan[r.plan_id] ||= []).push(r.day_of_week));
  return plans.map((p) => ({
    ...p,
    exercises: exByPlan[p.id] || [],
    days: (daysByPlan[p.id] || []).sort((a, b) => a - b),
  }));
}

async function listPlans(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT * FROM workout_plans WHERE user_id = ? ORDER BY name`, [req.userId]);
    res.json(await attachPlanDetails(rows));
  } catch (err) {
    next(err);
  }
}

async function getPlan(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT * FROM workout_plans WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: "Plano não encontrado." });
    const [full] = await attachPlanDetails(rows);
    res.json(full);
  } catch (err) {
    next(err);
  }
}

async function createPlan(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { name, notes = null, days = [], exercises = [] } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nome do plano é obrigatório." });

    await conn.beginTransaction();
    const [result] = await conn.query(`INSERT INTO workout_plans (user_id, name, notes) VALUES (?, ?, ?)`, [
      req.userId,
      name.trim(),
      notes,
    ]);
    const planId = result.insertId;

    if (days.length) {
      await conn.query(
        `INSERT INTO workout_schedule (plan_id, day_of_week) VALUES ${days.map(() => "(?, ?)").join(",")}`,
        days.flatMap((d) => [planId, d])
      );
    }
    if (exercises.length) {
      await conn.query(
        `INSERT INTO workout_plan_exercises (plan_id, exercise_id, sets, reps, weight, sort_order) VALUES ${exercises
          .map(() => "(?, ?, ?, ?, ?, ?)")
          .join(",")}`,
        exercises.flatMap((e, i) => [planId, e.exercise_id, e.sets || 3, e.reps || "10", e.weight || null, i])
      );
    }
    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM workout_plans WHERE id = ?`, [planId]);
    const [full] = await attachPlanDetails(rows);
    res.status(201).json(full);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function updatePlan(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const [existing] = await pool.query(`SELECT id FROM workout_plans WHERE id = ? AND user_id = ?`, [id, req.userId]);
    if (!existing.length) return res.status(404).json({ error: "Plano não encontrado." });

    const { name, notes = null, days = [], exercises = [] } = req.body;
    await conn.beginTransaction();
    await conn.query(`UPDATE workout_plans SET name=?, notes=? WHERE id=?`, [name, notes, id]);

    await conn.query(`DELETE FROM workout_schedule WHERE plan_id = ?`, [id]);
    if (days.length) {
      await conn.query(
        `INSERT INTO workout_schedule (plan_id, day_of_week) VALUES ${days.map(() => "(?, ?)").join(",")}`,
        days.flatMap((d) => [id, d])
      );
    }
    await conn.query(`DELETE FROM workout_plan_exercises WHERE plan_id = ?`, [id]);
    if (exercises.length) {
      await conn.query(
        `INSERT INTO workout_plan_exercises (plan_id, exercise_id, sets, reps, weight, sort_order) VALUES ${exercises
          .map(() => "(?, ?, ?, ?, ?, ?)")
          .join(",")}`,
        exercises.flatMap((e, i) => [id, e.exercise_id, e.sets || 3, e.reps || "10", e.weight || null, i])
      );
    }
    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM workout_plans WHERE id = ?`, [id]);
    const [full] = await attachPlanDetails(rows);
    res.json(full);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function deletePlan(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM workout_plans WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Plano não encontrado." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================== HOJE / AMANHÃ ================================
async function planFor(date, userId) {
  const dow = dayOfWeek(date);
  const [plans] = await pool.query(
    `SELECT wp.* FROM workout_plans wp
     JOIN workout_schedule ws ON ws.plan_id = wp.id AND ws.day_of_week = ?
     WHERE wp.user_id = ? GROUP BY wp.id`,
    [dow, userId]
  );
  if (!plans.length) return [];
  const full = await attachPlanDetails(plans);
  const ids = plans.map((p) => p.id);
  const [logs] = await pool.query(`SELECT plan_id, completed FROM workout_logs WHERE plan_id IN (?) AND log_date = ?`, [
    ids,
    date,
  ]);
  const logByPlan = Object.fromEntries(logs.map((l) => [l.plan_id, !!l.completed]));
  return full.map((p) => ({ ...p, done: !!logByPlan[p.id] }));
}

async function today(req, res, next) {
  try {
    res.json(await planFor(todayStr(), req.userId));
  } catch (err) {
    next(err);
  }
}

async function tomorrow(req, res, next) {
  try {
    res.json(await planFor(addDays(todayStr(), 1), req.userId));
  } catch (err) {
    next(err);
  }
}

// POST /api/workouts/:planId/log { date, completed, notes, entries: [{exercise_id, sets_done, reps_done, weight_done}] }
async function log(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { planId } = req.params;
    const { date = todayStr(), completed = true, notes = null, entries = [] } = req.body;

    const [[plan]] = await pool.query(`SELECT id FROM workout_plans WHERE id = ? AND user_id = ?`, [planId, req.userId]);
    if (!plan) return res.status(404).json({ error: "Plano não encontrado." });

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO workout_logs (plan_id, log_date, completed, notes) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE completed = VALUES(completed), notes = VALUES(notes)`,
      [planId, date, completed ? 1 : 0, notes]
    );
    const [[logRow]] = await conn.query(`SELECT id FROM workout_logs WHERE plan_id = ? AND log_date = ?`, [
      planId,
      date,
    ]);
    if (entries.length) {
      await conn.query(`DELETE FROM workout_log_entries WHERE workout_log_id = ?`, [logRow.id]);
      await conn.query(
        `INSERT INTO workout_log_entries (workout_log_id, exercise_id, sets_done, reps_done, weight_done) VALUES ${entries
          .map(() => "(?, ?, ?, ?, ?)")
          .join(",")}`,
        entries.flatMap((e) => [logRow.id, e.exercise_id, e.sets_done || null, e.reps_done || null, e.weight_done || null])
      );
    }
    await conn.commit();

    const [dayRows] = await pool.query(`SELECT day_of_week FROM workout_schedule WHERE plan_id = ?`, [planId]);
    const [compRows] = await pool.query(
      `SELECT log_date FROM workout_logs WHERE plan_id = ? AND completed = 1`,
      [planId]
    );
    const streak = computeStreak(
      new Set(compRows.map((r) => r.log_date)),
      new Set(dayRows.map((r) => r.day_of_week)),
      todayStr()
    );

    res.json({ plan_id: Number(planId), date, completed, streak });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// GET /api/workouts/:planId/history?month=YYYY-MM — heatmap mensal de frequência
async function history(req, res, next) {
  try {
    const { planId } = req.params;
    const [[plan]] = await pool.query(`SELECT id FROM workout_plans WHERE id = ? AND user_id = ?`, [planId, req.userId]);
    if (!plan) return res.status(404).json({ error: "Plano não encontrado." });
    const month = req.query.month || todayStr().slice(0, 7);
    const { from, to } = monthRange(`${month}-01`);

    const [dayRows] = await pool.query(`SELECT day_of_week FROM workout_schedule WHERE plan_id = ?`, [planId]);
    const scheduledDays = new Set(dayRows.map((r) => r.day_of_week));

    const [logs] = await pool.query(
      `SELECT log_date, completed FROM workout_logs WHERE plan_id = ? AND log_date BETWEEN ? AND ?`,
      [planId, from, to]
    );
    const completedByDate = new Set(logs.filter((l) => l.completed).map((l) => l.log_date));

    const out = [];
    let cursor = from;
    while (cursor <= to) {
      const scheduled = scheduledDays.has(dayOfWeek(cursor));
      out.push({ date: cursor, scheduled, completed: completedByDate.has(cursor) });
      cursor = addDays(cursor, 1);
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
}

// GET /api/workouts/:planId/streak
async function streak(req, res, next) {
  try {
    const { planId } = req.params;
    const [[plan]] = await pool.query(`SELECT id FROM workout_plans WHERE id = ? AND user_id = ?`, [planId, req.userId]);
    if (!plan) return res.status(404).json({ error: "Plano não encontrado." });
    const [dayRows] = await pool.query(`SELECT day_of_week FROM workout_schedule WHERE plan_id = ?`, [planId]);
    const [compRows] = await pool.query(
      `SELECT log_date FROM workout_logs WHERE plan_id = ? AND completed = 1`,
      [planId]
    );
    const value = computeStreak(
      new Set(compRows.map((r) => r.log_date)),
      new Set(dayRows.map((r) => r.day_of_week)),
      todayStr()
    );
    res.json({ plan_id: Number(planId), streak: value });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  today,
  tomorrow,
  log,
  history,
  streak,
};
