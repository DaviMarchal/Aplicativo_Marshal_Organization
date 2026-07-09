const pool = require("../db");
const { todayStr, daysBetween, addDays, dayOfWeek } = require("../utils/dates");

const GOAL_DURATION_DAYS = 180;

async function list(req, res, next) {
  try {
    const { status } = req.query;
    const clauses = ["user_id = ?"];
    const params = [req.userId];
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT * FROM goals WHERE ${clauses.join(" AND ")} ORDER BY status = 'active' DESC, start_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT * FROM goals WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: "Meta não encontrada." });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Toda meta nova já nasce com uma rotina diária vinculada (os 7 dias da
// semana) — é assim que o usuário marca "feito hoje" dia a dia ao longo dos
// 6 meses, reaproveitando o mecanismo de rotina/task_completions que já
// existe, em vez de um controle separado. Ver o filtro em
// routines.controller.js (today/heatmap) que só mostra essa rotina enquanto
// a meta ligada estiver ativa e dentro do período — depois que a meta acaba
// ou é concluída/abandonada, ela para de aparecer sozinha.
async function create(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { title, description = null, focus_areas = "", start_date, status = "active" } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "Título é obrigatório." });
    const start = start_date || todayStr();
    const end = addDays(start, GOAL_DURATION_DAYS);

    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO goals (user_id, title, description, focus_areas, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, title.trim(), description, focus_areas, start, end, status]
    );
    const goalId = result.insertId;

    const [taskResult] = await conn.query(
      `INSERT INTO tasks (user_id, title, is_routine, color, category) VALUES (?, ?, 1, '#FF7A00', 'Meta')`,
      [req.userId, title.trim()]
    );
    const taskId = taskResult.insertId;
    await conn.query(
      `INSERT INTO task_days (task_id, day_of_week) VALUES (?,0),(?,1),(?,2),(?,3),(?,4),(?,5),(?,6)`,
      [taskId, taskId, taskId, taskId, taskId, taskId, taskId]
    );
    await conn.query(`INSERT INTO goal_task_links (goal_id, task_id) VALUES (?, ?)`, [goalId, taskId]);

    await conn.commit();
    res.status(201).json({ id: goalId, start_date: start, end_date: end, routine_task_id: taskId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function update(req, res, next) {
  try {
    const { title, description, focus_areas, start_date, end_date, status } = req.body;
    const [result] = await pool.query(
      `UPDATE goals SET title=?, description=?, focus_areas=?, start_date=?, end_date=?, status=? WHERE id=? AND user_id=?`,
      [title, description, focus_areas, start_date, end_date, status, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Meta não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM goals WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Meta não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// GET /api/goals/:id/progress
async function progress(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT * FROM goals WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: "Meta não encontrada." });
    const goal = rows[0];
    const today = todayStr();

    const totalDays = daysBetween(goal.start_date, goal.end_date);
    const elapsedRaw = daysBetween(goal.start_date, today);
    const elapsed = Math.max(0, Math.min(elapsedRaw, totalDays));

    // consistência e progresso: % de conclusão das rotinas vinculadas dentro
    // do período da meta. O anel/dias-restantes andam com dias DE VERDADE
    // marcados como feitos, não com o calendário passando sozinho — bater o
    // check hoje já tem que descontar 1 dia dos 180, não só o relógio.
    const [links] = await pool.query(`SELECT task_id FROM goal_task_links WHERE goal_id = ?`, [goal.id]);
    let consistency = null;
    let daysCompleted = 0;
    if (links.length) {
      const taskIds = links.map((l) => l.task_id);
      const [days] = await pool.query(`SELECT task_id, day_of_week FROM task_days WHERE task_id IN (?)`, [taskIds]);
      const [completions] = await pool.query(
        `SELECT task_id, done_date FROM task_completions
         WHERE task_id IN (?) AND completed = 1 AND done_date BETWEEN ? AND ?`,
        [taskIds, goal.start_date, today]
      );
      const daysByTask = {};
      days.forEach((d) => (daysByTask[d.task_id] ||= new Set()).add(d.day_of_week));
      const completedByTask = {};
      completions.forEach((c) => (completedByTask[c.task_id] ||= new Set()).add(c.done_date));

      let scheduledCount = 0;
      let doneCount = 0;
      taskIds.forEach((id) => {
        let cursor = goal.start_date;
        while (cursor <= today) {
          const dow = dayOfWeek(cursor);
          if (daysByTask[id]?.has(dow)) {
            scheduledCount++;
            if (completedByTask[id]?.has(cursor)) doneCount++;
          }
          cursor = addDays(cursor, 1);
        }
      });
      consistency = scheduledCount > 0 ? Math.round((doneCount / scheduledCount) * 100) : 0;

      // dias distintos (independente de quantas rotinas vinculadas) em que
      // pelo menos uma foi marcada feita — isso é o que "anda" o anel.
      const distinctDates = new Set();
      completions.forEach((c) => distinctDates.add(c.done_date));
      daysCompleted = distinctDates.size;
    }

    const remaining = Math.max(0, totalDays - daysCompleted);
    const pct = totalDays > 0 ? Math.round((daysCompleted / totalDays) * 100) : 0;

    let alert = null;
    if (goal.status === "active") {
      if (remaining === 1) alert = "Falta 1 dia para o fim da meta!";
      else if (remaining === 7) alert = "Faltam 7 dias para o fim da meta.";
      else if (remaining === 30) alert = "Faltam 30 dias para o fim da meta.";
    }

    res.json({
      goal_id: goal.id,
      total_days: totalDays,
      elapsed_days: elapsed,
      days_completed: daysCompleted,
      remaining_days: remaining,
      percent: pct,
      alert,
      consistency,
    });
  } catch (err) {
    next(err);
  }
}

// checkins/links são filhos de goals sem user_id próprio — a dona é sempre
// checada via subquery na própria goals (id + user_id), senão um usuário
// conseguiria ler/escrever check-ins de metas de outra conta só sabendo o id.
async function assertOwnsGoal(goalId, userId) {
  const [[goal]] = await pool.query(`SELECT id FROM goals WHERE id = ? AND user_id = ?`, [goalId, userId]);
  return !!goal;
}

// GET /api/goals/:id/checkins
async function listCheckins(req, res, next) {
  try {
    if (!(await assertOwnsGoal(req.params.id, req.userId))) return res.status(404).json({ error: "Meta não encontrada." });
    const [rows] = await pool.query(
      `SELECT * FROM goal_checkins WHERE goal_id = ? ORDER BY checkin_date DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/goals/:id/checkins
async function createCheckin(req, res, next) {
  try {
    if (!(await assertOwnsGoal(req.params.id, req.userId))) return res.status(404).json({ error: "Meta não encontrada." });
    const { checkin_date = todayStr(), progress: prog = 0, note = null } = req.body;
    const [result] = await pool.query(
      `INSERT INTO goal_checkins (goal_id, checkin_date, progress, note) VALUES (?, ?, ?, ?)`,
      [req.params.id, checkin_date, prog, note]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

// GET /api/goals/:id/links
async function listLinks(req, res, next) {
  try {
    if (!(await assertOwnsGoal(req.params.id, req.userId))) return res.status(404).json({ error: "Meta não encontrada." });
    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.category, t.color FROM goal_task_links gl
       JOIN tasks t ON t.id = gl.task_id WHERE gl.goal_id = ?`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/goals/:id/links { task_id }
async function addLink(req, res, next) {
  try {
    const { task_id } = req.body;
    if (!task_id) return res.status(400).json({ error: "task_id é obrigatório." });
    if (!(await assertOwnsGoal(req.params.id, req.userId))) return res.status(404).json({ error: "Meta não encontrada." });
    const [[task]] = await pool.query(`SELECT id FROM tasks WHERE id = ? AND user_id = ?`, [task_id, req.userId]);
    if (!task) return res.status(404).json({ error: "Task não encontrada." });
    await pool.query(
      `INSERT IGNORE INTO goal_task_links (goal_id, task_id) VALUES (?, ?)`,
      [req.params.id, task_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/goals/:id/links/:taskId
async function removeLink(req, res, next) {
  try {
    if (!(await assertOwnsGoal(req.params.id, req.userId))) return res.status(404).json({ error: "Meta não encontrada." });
    await pool.query(`DELETE FROM goal_task_links WHERE goal_id = ? AND task_id = ?`, [
      req.params.id,
      req.params.taskId,
    ]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  progress,
  listCheckins,
  createCheckin,
  listLinks,
  addLink,
  removeLink,
};
