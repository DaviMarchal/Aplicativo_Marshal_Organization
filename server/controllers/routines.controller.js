// Endpoints especiais de Rotina: resolução "o que aparece hoje" + heatmap mensal.
const pool = require("../db");
const { todayStr, dayOfWeek, monthRange, addDays } = require("../utils/dates");
const { computeStreak } = require("../utils/recurrence");

// GET /api/routines/today?date=YYYY-MM-DD
// Gera dinamicamente a lista de rotinas cujo dia_da_semana bate com a data,
// cruzando com task_completions pra saber o que já foi marcado + streak de cada uma.
async function today(req, res, next) {
  try {
    const date = req.query.date || todayStr();
    const dow = dayOfWeek(date);

    // rotinas ligadas a uma meta (goal_task_links) só contam enquanto a meta
    // estiver ativa e a data cair dentro do período dela — depois que a meta
    // acaba/é concluída/abandonada, a rotina para de aparecer sozinha aqui
    // (mas continua existindo, editável em "Todas as rotinas").
    const [tasks] = await pool.query(
      `SELECT t.* FROM tasks t
       JOIN task_days td ON td.task_id = t.id AND td.day_of_week = ?
       WHERE t.is_routine = 1 AND t.user_id = ?
         AND (
           NOT EXISTS (SELECT 1 FROM goal_task_links gl WHERE gl.task_id = t.id)
           OR EXISTS (
             SELECT 1 FROM goal_task_links gl JOIN goals g ON g.id = gl.goal_id
             WHERE gl.task_id = t.id AND g.status = 'active' AND ? BETWEEN g.start_date AND g.end_date
           )
         )
       GROUP BY t.id
       ORDER BY (t.time_of_day IS NULL), t.time_of_day ASC, t.title ASC`,
      [dow, req.userId, date]
    );

    if (!tasks.length) return res.json([]);

    const ids = tasks.map((t) => t.id);
    const [completions] = await pool.query(
      `SELECT task_id, done_date, completed FROM task_completions WHERE task_id IN (?)`,
      [ids]
    );
    const [days] = await pool.query(`SELECT task_id, day_of_week FROM task_days WHERE task_id IN (?)`, [ids]);

    const completionsByTask = {};
    completions.forEach((c) => {
      (completionsByTask[c.task_id] ||= []).push(c);
    });
    const daysByTask = {};
    days.forEach((d) => {
      (daysByTask[d.task_id] ||= []).push(d.day_of_week);
    });

    const result = tasks.map((t) => {
      const taskCompletions = completionsByTask[t.id] || [];
      const doneToday = taskCompletions.some((c) => c.done_date === date && c.completed);
      const completedDates = new Set(taskCompletions.filter((c) => c.completed).map((c) => c.done_date));
      const scheduledDays = new Set(daysByTask[t.id] || []);
      return {
        ...t,
        done: doneToday,
        streak: computeStreak(completedDates, scheduledDays, date),
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/routines/heatmap?month=YYYY-MM
// Para cada dia do mês: quantas rotinas estavam agendadas e quantas foram concluídas
// (intensidade = completed/scheduled), pra montar o heatmap estilo GitHub contributions.
async function heatmap(req, res, next) {
  try {
    const month = req.query.month || todayStr().slice(0, 7);
    const { from, to } = monthRange(`${month}-01`);

    const [routines] = await pool.query(
      `SELECT t.id FROM tasks t WHERE t.is_routine = 1 AND t.user_id = ?`,
      [req.userId]
    );
    if (!routines.length) return res.json([]);
    const ids = routines.map((r) => r.id);

    const [days] = await pool.query(`SELECT task_id, day_of_week FROM task_days WHERE task_id IN (?)`, [ids]);
    const daysByTask = {};
    days.forEach((d) => (daysByTask[d.task_id] ||= new Set()).add(d.day_of_week));

    // mesma regra do today(): rotina ligada a meta só conta como "agendada"
    // nos dias dentro do período de uma meta ativa.
    const [goalLinks] = await pool.query(
      `SELECT gl.task_id, g.status, g.start_date, g.end_date FROM goal_task_links gl JOIN goals g ON g.id = gl.goal_id WHERE gl.task_id IN (?)`,
      [ids]
    );
    const goalsByTask = {};
    goalLinks.forEach((g) => (goalsByTask[g.task_id] ||= []).push(g));
    function isScheduledOn(taskId, dateStr, dow) {
      if (!daysByTask[taskId]?.has(dow)) return false;
      const links = goalsByTask[taskId];
      if (!links) return true;
      return links.some((g) => g.status === "active" && dateStr >= g.start_date && dateStr <= g.end_date);
    }

    const [completions] = await pool.query(
      `SELECT task_id, done_date FROM task_completions
       WHERE task_id IN (?) AND completed = 1 AND done_date BETWEEN ? AND ?`,
      [ids, from, to]
    );
    const completedByDate = {};
    completions.forEach((c) => {
      (completedByDate[c.done_date] ||= new Set()).add(c.task_id);
    });

    const out = [];
    let cursor = from;
    while (cursor <= to) {
      const dow = dayOfWeek(cursor);
      const scheduled = ids.filter((id) => isScheduledOn(id, cursor, dow));
      const completedSet = completedByDate[cursor] || new Set();
      out.push({
        date: cursor,
        scheduled: scheduled.length,
        completed: scheduled.filter((id) => completedSet.has(id)).length,
      });
      cursor = addDays(cursor, 1);
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
}

module.exports = { today, heatmap };
