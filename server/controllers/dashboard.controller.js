// GET /api/dashboard — agrega tudo que a home precisa numa chamada só.
const pool = require("../db");
const { todayStr, dayOfWeek, monthRange, addDays, daysBetween } = require("../utils/dates");

async function get(req, res, next) {
  try {
    const today = todayStr();
    const dow = dayOfWeek(today);

    const [[user]] = await pool.query(`SELECT name FROM users WHERE id = ?`, [req.userId]);

    // ---- Rotina de hoje ----
    const [routineTasks] = await pool.query(
      `SELECT t.* FROM tasks t
       JOIN task_days td ON td.task_id = t.id AND td.day_of_week = ?
       WHERE t.is_routine = 1 AND t.user_id = ? GROUP BY t.id ORDER BY (t.time_of_day IS NULL), t.time_of_day`,
      [dow, req.userId]
    );
    let routineToday = [];
    if (routineTasks.length) {
      const ids = routineTasks.map((t) => t.id);
      const [completions] = await pool.query(
        `SELECT task_id, done_date, completed FROM task_completions WHERE task_id IN (?)`,
        [ids]
      );
      const doneTodaySet = new Set(
        completions.filter((c) => c.done_date === today && c.completed).map((c) => c.task_id)
      );
      routineToday = routineTasks.map((t) => ({ ...t, done: doneTodaySet.has(t.id) }));
    }
    const routinePercent = routineToday.length
      ? Math.round((routineToday.filter((r) => r.done).length / routineToday.length) * 100)
      : 0;

    // ---- Tasks pendentes hoje (kanban não-rotina, vencendo hoje ou atrasadas, não concluídas) ----
    const [[{ pendentes }]] = await pool.query(
      `SELECT COUNT(*) AS pendentes FROM tasks
       WHERE user_id = ? AND is_routine = 0 AND status != 'done' AND due_date IS NOT NULL AND due_date <= ?`,
      [req.userId, today]
    );

    // ---- Finanças: saldo do mês ----
    const { from, to } = monthRange(today);
    const [[finRow]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE 0 END),0) AS entradas,
         COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) AS saidas
       FROM transactions WHERE user_id=? AND tx_date BETWEEN ? AND ?`,
      [req.userId, from, to]
    );
    const [accountRows] = await pool.query(
      `SELECT a.opening_balance,
              COALESCE(SUM(CASE WHEN tx.kind='income' THEN tx.amount ELSE -tx.amount END),0) AS delta
       FROM accounts a LEFT JOIN transactions tx ON tx.account_id = a.id
       WHERE a.user_id = ? GROUP BY a.id`,
      [req.userId]
    );
    const saldoMes = accountRows.reduce((s, a) => s + Number(a.opening_balance) + Number(a.delta), 0);

    // ---- Mini gráfico de gastos da semana (últimos 7 dias) ----
    const weekFrom = addDays(today, -6);
    const [weekRows] = await pool.query(
      `SELECT tx_date, SUM(amount) AS total FROM transactions
       WHERE user_id=? AND kind='expense' AND tx_date BETWEEN ? AND ? GROUP BY tx_date`,
      [req.userId, weekFrom, today]
    );
    const totalsByDate = Object.fromEntries(weekRows.map((r) => [r.tx_date, Number(r.total)]));
    const weekSeries = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      weekSeries.push({ date: d, total: totalsByDate[d] || 0, isToday: d === today });
    }

    // ---- Treino de hoje ----
    const [planRows] = await pool.query(
      `SELECT wp.* FROM workout_plans wp
       JOIN workout_schedule ws ON ws.plan_id = wp.id AND ws.day_of_week = ?
       WHERE wp.user_id = ? GROUP BY wp.id`,
      [dow, req.userId]
    );
    let workoutToday = null;
    if (planRows.length) {
      const plan = planRows[0];
      const [[logRow]] = await pool.query(
        `SELECT completed FROM workout_logs WHERE plan_id = ? AND log_date = ?`,
        [plan.id, today]
      );
      workoutToday = { id: plan.id, name: plan.name, done: !!logRow?.completed };
    }

    // ---- Meta ativa ----
    const [goalRows] = await pool.query(
      `SELECT * FROM goals WHERE user_id = ? AND status = 'active' ORDER BY start_date DESC LIMIT 1`,
      [req.userId]
    );
    let activeGoal = null;
    if (goalRows.length) {
      const goal = goalRows[0];
      const totalDays = daysBetween(goal.start_date, goal.end_date);
      const elapsed = Math.max(0, Math.min(daysBetween(goal.start_date, today), totalDays));
      activeGoal = {
        id: goal.id,
        title: goal.title,
        total_days: totalDays,
        elapsed_days: elapsed,
        remaining_days: Math.max(0, totalDays - elapsed),
        percent: totalDays > 0 ? Math.round((elapsed / totalDays) * 100) : 0,
      };
    }

    res.json({
      user_name: user?.name || "Davi",
      date: today,
      kpis: {
        saldo_mes: saldoMes,
        tasks_pendentes_hoje: pendentes,
        rotina_percent_hoje: routinePercent,
        meta_dias_restantes: activeGoal ? activeGoal.remaining_days : null,
      },
      routine_today: routineToday,
      workout_today: workoutToday,
      week_expenses: weekSeries,
      active_goal: activeGoal,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { get };
