// Controller compartilhado por Rotina e Tasks (Kanban) — ambos vivem na
// tabela `tasks`, diferenciados pela flag is_routine.
const pool = require("../db");
const { todayStr } = require("../utils/dates");
const { computeStreak } = require("../utils/recurrence");

async function attachTagsAndDays(tasks) {
  if (tasks.length === 0) return tasks;
  const ids = tasks.map((t) => t.id);
  const [tagRows] = await pool.query(
    `SELECT task_id, tag FROM task_tags WHERE task_id IN (?)`,
    [ids]
  );
  const [dayRows] = await pool.query(
    `SELECT task_id, day_of_week FROM task_days WHERE task_id IN (?)`,
    [ids]
  );
  const tagsByTask = {};
  tagRows.forEach((r) => {
    (tagsByTask[r.task_id] ||= []).push(r.tag);
  });
  const daysByTask = {};
  dayRows.forEach((r) => {
    (daysByTask[r.task_id] ||= []).push(r.day_of_week);
  });
  return tasks.map((t) => ({
    ...t,
    tags: tagsByTask[t.id] || [],
    days: (daysByTask[t.id] || []).sort((a, b) => a - b),
  }));
}

async function list(req, res, next) {
  try {
    const { is_routine, status, priority, tag, search } = req.query;
    const clauses = ["t.user_id = ?"];
    const params = [req.userId];

    if (is_routine !== undefined) {
      clauses.push("t.is_routine = ?");
      params.push(is_routine === "1" || is_routine === "true" ? 1 : 0);
    }
    if (status) {
      clauses.push("t.status = ?");
      params.push(status);
    }
    if (priority) {
      clauses.push("t.priority = ?");
      params.push(priority);
    }
    if (search) {
      clauses.push("(t.title LIKE ? OR t.description LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (tag) {
      clauses.push("t.id IN (SELECT task_id FROM task_tags WHERE tag = ?)");
      params.push(tag);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT * FROM tasks t ${where} ORDER BY t.sort_order ASC, t.created_at DESC`,
      params
    );
    res.json(await attachTagsAndDays(rows));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT * FROM tasks WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: "Task não encontrada." });
    const [full] = await attachTagsAndDays(rows);
    res.json(full);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const {
      title,
      description = null,
      priority = "medium",
      status = "todo",
      is_routine = false,
      time_of_day = null,
      color = "#FF7A00",
      category = null,
      due_date = null,
      days = [],
      tags = [],
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Título é obrigatório." });
    }

    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO tasks (user_id, title, description, priority, status, is_routine, time_of_day, color, category, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, title.trim(), description, priority, status, is_routine ? 1 : 0, time_of_day, color, category, due_date]
    );
    const taskId = result.insertId;

    if (Array.isArray(days) && days.length) {
      await conn.query(
        `INSERT INTO task_days (task_id, day_of_week) VALUES ${days.map(() => "(?, ?)").join(",")}`,
        days.flatMap((d) => [taskId, d])
      );
    }
    if (Array.isArray(tags) && tags.length) {
      await conn.query(
        `INSERT INTO task_tags (task_id, tag) VALUES ${tags.map(() => "(?, ?)").join(",")}`,
        tags.flatMap((tg) => [taskId, tg])
      );
    }

    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM tasks WHERE id = ?`, [taskId]);
    const [full] = await attachTagsAndDays(rows);
    res.status(201).json(full);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function update(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const [existing] = await pool.query(`SELECT id FROM tasks WHERE id = ? AND user_id = ?`, [id, req.userId]);
    if (!existing.length) return res.status(404).json({ error: "Task não encontrada." });

    const {
      title,
      description = null,
      priority = "medium",
      status = "todo",
      is_routine = false,
      time_of_day = null,
      color = "#FF7A00",
      category = null,
      due_date = null,
      days = [],
      tags = [],
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Título é obrigatório." });
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE tasks SET title=?, description=?, priority=?, status=?, is_routine=?, time_of_day=?, color=?, category=?, due_date=? WHERE id=?`,
      [title.trim(), description, priority, status, is_routine ? 1 : 0, time_of_day, color, category, due_date, id]
    );
    await conn.query(`DELETE FROM task_days WHERE task_id = ?`, [id]);
    if (Array.isArray(days) && days.length) {
      await conn.query(
        `INSERT INTO task_days (task_id, day_of_week) VALUES ${days.map(() => "(?, ?)").join(",")}`,
        days.flatMap((d) => [id, d])
      );
    }
    await conn.query(`DELETE FROM task_tags WHERE task_id = ?`, [id]);
    if (Array.isArray(tags) && tags.length) {
      await conn.query(
        `INSERT INTO task_tags (task_id, tag) VALUES ${tags.map(() => "(?, ?)").join(",")}`,
        tags.flatMap((tg) => [id, tg])
      );
    }
    await conn.commit();

    const [rows] = await pool.query(`SELECT * FROM tasks WHERE id = ?`, [id]);
    const [full] = await attachTagsAndDays(rows);
    res.json(full);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function remove(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Task não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Usado pelo Kanban ao soltar um card em outra coluna (e opcionalmente reordenar)
async function updateStatus(req, res, next) {
  try {
    const { status, sort_order } = req.body;
    const validStatuses = ["todo", "in_progress", "in_review", "done"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    const [result] = await pool.query(
      `UPDATE tasks SET status = ?, sort_order = COALESCE(?, sort_order) WHERE id = ? AND user_id = ?`,
      [status, sort_order ?? null, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Task não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Marca/desmarca a conclusão de uma task (rotina ou task recorrente) numa data.
async function toggle(req, res, next) {
  try {
    const { id } = req.params;
    const date = req.body.date || todayStr();

    const [taskRows] = await pool.query(`SELECT * FROM tasks WHERE id = ? AND user_id = ?`, [id, req.userId]);
    if (!taskRows.length) return res.status(404).json({ error: "Task não encontrada." });

    const [existing] = await pool.query(
      `SELECT id FROM task_completions WHERE task_id = ? AND done_date = ?`,
      [id, date]
    );

    let completed;
    if (existing.length) {
      await pool.query(`DELETE FROM task_completions WHERE id = ?`, [existing[0].id]);
      completed = false;
    } else {
      await pool.query(
        `INSERT INTO task_completions (task_id, done_date, completed) VALUES (?, ?, 1)`,
        [id, date]
      );
      completed = true;
    }

    const [dayRows] = await pool.query(`SELECT day_of_week FROM task_days WHERE task_id = ?`, [id]);
    const [compRows] = await pool.query(
      `SELECT done_date FROM task_completions WHERE task_id = ? AND completed = 1`,
      [id]
    );
    const scheduledDays = new Set(dayRows.map((r) => r.day_of_week));
    const completedDates = new Set(compRows.map((r) => r.done_date));
    const streak = computeStreak(completedDates, scheduledDays, todayStr());

    res.json({ id: Number(id), date, completed, streak });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove, updateStatus, toggle, attachTagsAndDays };
