// Configurações do app: nome de exibição + export de backup.
const pool = require("../db");
const { MULTI_USER } = require("../middleware/auth");

async function getSettings(req, res, next) {
  try {
    const [[user]] = await pool.query(`SELECT name FROM users WHERE id = ?`, [req.userId]);
    res.json({ name: user?.name || "Davi" });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome não pode ficar vazio." });
    await pool.query(`UPDATE users SET name = ? WHERE id = ?`, [name, req.userId]);
    res.json({ name });
  } catch (err) {
    next(err);
  }
}

// Dump de todas as tabelas do app num único JSON — backup manual, sem
// segredos de conexão nem nada específico de ambiente.
const EXPORT_TABLES = [
  "users",
  "tasks",
  "task_days",
  "task_tags",
  "task_completions",
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "recurring_transactions",
  "installment_purchases",
  "savings_boxes",
  "savings_box_entries",
  "notes",
  "note_tags",
  "goals",
  "goal_checkins",
  "goal_task_links",
  "exercises",
  "workout_plans",
  "workout_plan_exercises",
  "workout_schedule",
  "workout_logs",
  "workout_log_entries",
];

// exportData/importData fazem TRUNCATE + reinsert em tabelas inteiras (todas
// as contas de uma vez, incluindo `users`) — no modo desktop isso é seguro
// porque só existe um usuário; no modo web apagaria os dados de TODO MUNDO.
// Por isso o recurso fica bloqueado quando MULTI_USER=true.
function blockInMultiUser(req, res) {
  if (MULTI_USER) {
    res.status(403).json({ error: "Backup completo não está disponível no modo web." });
    return true;
  }
  return false;
}

async function exportData(req, res, next) {
  if (blockInMultiUser(req, res)) return;
  try {
    const data = {};
    for (const table of EXPORT_TABLES) {
      const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
      data[table] = rows;
    }
    res.json({ exported_at: new Date().toISOString(), version: 1, data });
  } catch (err) {
    next(err);
  }
}

// Restaura um backup gerado por exportData: apaga tudo e reinsere do zero,
// preservando os IDs originais (necessário pras FKs entre tabelas baterem).
// Destrutivo por natureza — a confirmação pesada fica a cargo do front.
async function importData(req, res, next) {
  if (blockInMultiUser(req, res)) return;
  const { data } = req.body;
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Arquivo de backup inválido: campo 'data' ausente." });
  }
  for (const table of EXPORT_TABLES) {
    if (data[table] !== undefined && !Array.isArray(data[table])) {
      return res.status(400).json({ error: `Arquivo de backup inválido: '${table}' deveria ser uma lista.` });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);

    for (const table of EXPORT_TABLES) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
    }
    // reinsere na mesma ordem do export — inócuo com FK_CHECKS=0, mas mantém
    // o comportamento previsível se algum dia isso mudar.
    for (const table of EXPORT_TABLES) {
      const rows = data[table] || [];
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = `(${columns.map(() => "?").join(",")})`;
      const values = rows.flatMap((row) => columns.map((c) => row[c]));
      await conn.query(
        `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(",")}) VALUES ${rows.map(() => placeholders).join(",")}`,
        values
      );
    }

    // salvaguarda: backup sem linha de usuário deixaria a tabela vazia e
    // quebraria a saudação do Dashboard e a própria tela de Configurações.
    const [[userCount]] = await conn.query(`SELECT COUNT(*) AS n FROM users`);
    if (userCount.n === 0) {
      await conn.query(`INSERT INTO users (id, name) VALUES (1, 'Davi')`);
    }

    await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
    await conn.commit();
    res.json({ ok: true, tables_restored: EXPORT_TABLES.filter((t) => (data[t] || []).length) });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = { getSettings, updateSettings, exportData, importData };
