const pool = require("../db");
const { todayStr, monthRange, previousMonthRange, addDays, dayOfWeek } = require("../utils/dates");

// ============================== CONTAS ======================================
async function listAccounts(req, res, next) {
  try {
    const [accounts] = await pool.query(`SELECT * FROM accounts WHERE user_id = ?`, [req.userId]);
    const [balances] = await pool.query(
      `SELECT account_id,
              SUM(CASE WHEN kind='income' THEN amount ELSE -amount END) AS delta
       FROM transactions WHERE user_id = ? GROUP BY account_id`,
      [req.userId]
    );
    const deltaByAccount = Object.fromEntries(balances.map((b) => [b.account_id, Number(b.delta)]));
    res.json(
      accounts.map((a) => ({
        ...a,
        balance: Number(a.opening_balance) + (deltaByAccount[a.id] || 0),
      }))
    );
  } catch (err) {
    next(err);
  }
}

async function createAccount(req, res, next) {
  try {
    const { name, type = "bank", opening_balance = 0 } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nome da conta é obrigatório." });
    const [result] = await pool.query(
      `INSERT INTO accounts (user_id, name, type, opening_balance) VALUES (?, ?, ?, ?)`,
      [req.userId, name.trim(), type, opening_balance]
    );
    res.status(201).json({ id: result.insertId, name, type, opening_balance });
  } catch (err) {
    next(err);
  }
}

async function updateAccount(req, res, next) {
  try {
    const { name, type, opening_balance } = req.body;
    const [result] = await pool.query(
      `UPDATE accounts SET name=?, type=?, opening_balance=? WHERE id=? AND user_id=?`,
      [name, type, opening_balance, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Conta não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM accounts WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Conta não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================== CATEGORIAS ==================================
async function listCategories(req, res, next) {
  try {
    const { kind } = req.query;
    const params = [req.userId];
    let where = "WHERE user_id = ?";
    if (kind) {
      where += " AND kind = ?";
      params.push(kind);
    }
    const [rows] = await pool.query(`SELECT * FROM categories ${where} ORDER BY name ASC`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const { name, kind, color = "#6694FF", icon = null } = req.body;
    if (!name || !kind) return res.status(400).json({ error: "Nome e tipo são obrigatórios." });
    const [result] = await pool.query(
      `INSERT INTO categories (user_id, name, kind, color, icon) VALUES (?, ?, ?, ?, ?)`,
      [req.userId, name.trim(), kind, color, icon]
    );
    res.status(201).json({ id: result.insertId, name, kind, color, icon });
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { name, kind, color, icon } = req.body;
    const [result] = await pool.query(
      `UPDATE categories SET name=?, kind=?, color=?, icon=? WHERE id=? AND user_id=?`,
      [name, kind, color, icon, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Categoria não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM categories WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Categoria não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================== RECORRENTES ==================================
// Sem cron/serviço em segundo plano — a cada visita a Finanças (listTransactions
// ou summary), gera preguiçosamente a transação real do mês corrente pra cada
// recorrente ativa que já venceu e ainda não foi gerada esse mês.
//
// listTransactions e summary chamam isso em paralelo (Promise.all no front),
// então SELECT-depois-INSERT tem corrida: as duas leem last_generated_date
// antigo antes de qualquer uma escrever, e as duas geram a transação (visto
// na prática: 3 duplicatas de uma vez). O UPDATE condicional abaixo resolve
// isso via lock de linha do InnoDB — só quem "ganha" a corrida (affectedRows
// > 0) segue pra criar a transação; a(s) chamada(s) concorrente(s) perdedora(s)
// batem no WHERE já desatualizado e não fazem nada.
async function generateDueRecurringTransactions(userId) {
  const today = todayStr();
  const [y, m] = today.split("-").map(Number);
  const [recurrings] = await pool.query(`SELECT id, day_of_month FROM recurring_transactions WHERE user_id = ? AND active = 1`, [userId]);
  for (const r of recurrings) {
    const targetDate = `${y}-${String(m).padStart(2, "0")}-${String(r.day_of_month).padStart(2, "0")}`;
    if (targetDate > today) continue; // ainda não chegou o dia esse mês

    const [updateResult] = await pool.query(
      `UPDATE recurring_transactions SET last_generated_date = ? WHERE id = ? AND (last_generated_date IS NULL OR last_generated_date < ?)`,
      [targetDate, r.id, targetDate]
    );
    if (updateResult.affectedRows === 0) continue; // outra chamada concorrente já gerou esse mês

    const [[full]] = await pool.query(`SELECT * FROM recurring_transactions WHERE id = ?`, [r.id]);
    await pool.query(
      `INSERT INTO transactions (user_id, account_id, category_id, kind, amount, description, tx_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, full.account_id, full.category_id, full.kind, full.amount, full.description, targetDate]
    );
  }
}

async function listRecurring(req, res, next) {
  try {
    await generateDueRecurringTransactions(req.userId);
    await generateDueInstallments(req.userId);
    const [rows] = await pool.query(
      `SELECT r.*, a.name AS account_name, c.name AS category_name, c.color AS category_color
       FROM recurring_transactions r
       LEFT JOIN accounts a ON a.id = r.account_id
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ? ORDER BY r.day_of_month ASC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createRecurring(req, res, next) {
  try {
    const { account_id, category_id = null, kind, amount, description = null, day_of_month } = req.body;
    if (!account_id || !kind || !amount || !day_of_month) {
      return res.status(400).json({ error: "Conta, tipo, valor e dia do mês são obrigatórios." });
    }
    if (day_of_month < 1 || day_of_month > 28) {
      return res.status(400).json({ error: "Dia do mês deve ser entre 1 e 28 (evita mês com menos dias)." });
    }
    const [result] = await pool.query(
      `INSERT INTO recurring_transactions (user_id, account_id, category_id, kind, amount, description, day_of_month) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, account_id, category_id, kind, amount, description, day_of_month]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateRecurring(req, res, next) {
  try {
    const { account_id, category_id, kind, amount, description, day_of_month, active } = req.body;
    if (day_of_month < 1 || day_of_month > 28) {
      return res.status(400).json({ error: "Dia do mês deve ser entre 1 e 28 (evita mês com menos dias)." });
    }
    const [result] = await pool.query(
      `UPDATE recurring_transactions SET account_id=?, category_id=?, kind=?, amount=?, description=?, day_of_month=?, active=? WHERE id=? AND user_id=?`,
      [account_id, category_id, kind, amount, description, day_of_month, active ? 1 : 0, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Transação recorrente não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteRecurring(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM recurring_transactions WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Transação recorrente não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================== PARCELADAS ===================================
// Mesmo mecanismo preguiçoso das recorrentes (ver generateDueRecurringTransactions
// acima), mas com fim: para de gerar quando installments_generated atinge
// installments_total, e a própria compra fica inativa depois disso.
function computeInstallmentAmount(totalAmount, installmentsTotal, installmentIndex) {
  const total = Number(totalAmount);
  // divide em centavos e absorve o resto na última parcela — evita que o
  // arredondamento faça a soma das parcelas divergir do total em R$0,01+
  const base = Math.floor((total * 100) / installmentsTotal) / 100;
  if (installmentIndex < installmentsTotal) return base;
  return Number((total - base * (installmentsTotal - 1)).toFixed(2));
}

async function generateDueInstallments(userId) {
  const today = todayStr();
  const [y, m] = today.split("-").map(Number);
  const [purchases] = await pool.query(
    `SELECT id, day_of_month FROM installment_purchases
     WHERE user_id = ? AND active = 1 AND installments_generated < installments_total`,
    [userId]
  );
  for (const p of purchases) {
    const targetDate = `${y}-${String(m).padStart(2, "0")}-${String(p.day_of_month).padStart(2, "0")}`;
    if (targetDate > today) continue;

    const [updateResult] = await pool.query(
      `UPDATE installment_purchases SET last_generated_date = ?, installments_generated = installments_generated + 1
       WHERE id = ? AND (last_generated_date IS NULL OR last_generated_date < ?) AND installments_generated < installments_total`,
      [targetDate, p.id, targetDate]
    );
    if (updateResult.affectedRows === 0) continue; // outra chamada concorrente já gerou esse mês

    const [[full]] = await pool.query(`SELECT * FROM installment_purchases WHERE id = ?`, [p.id]);
    const amount = computeInstallmentAmount(full.total_amount, full.installments_total, full.installments_generated);
    await pool.query(
      `INSERT INTO transactions (user_id, account_id, category_id, kind, amount, description, tx_date) VALUES (?, ?, ?, 'expense', ?, ?, ?)`,
      [userId, full.account_id, full.category_id, amount, `${full.description} (${full.installments_generated}/${full.installments_total})`, targetDate]
    );
    if (full.installments_generated >= full.installments_total) {
      await pool.query(`UPDATE installment_purchases SET active = 0 WHERE id = ?`, [p.id]);
    }
  }
}

// GET /api/finance/installments/forecast — quanto de parcela ainda vou pagar
// nos próximos N meses, somando todas as compras parceladas ativas. Cada
// parcela restante cai num mês consecutivo a partir da última já gerada.
async function installmentsForecast(req, res, next) {
  try {
    await generateDueInstallments(req.userId);
    const months = Math.min(12, Math.max(1, Number(req.query.months) || 6));
    const today = todayStr();
    const [y0, m0] = today.split("-").map(Number);

    const buckets = Array.from({ length: months }, (_, i) => {
      const total = m0 - 1 + i;
      const y = y0 + Math.floor(total / 12);
      const m = (total % 12) + 1;
      return { key: `${y}-${String(m).padStart(2, "0")}`, total: 0 };
    });
    const indexByKey = Object.fromEntries(buckets.map((b, i) => [b.key, i]));

    const [rows] = await pool.query(
      `SELECT * FROM installment_purchases WHERE user_id = ? AND active = 1 AND installments_generated < installments_total`,
      [req.userId]
    );
    for (const r of rows) {
      let cursorY = y0;
      let cursorM = m0;
      if (r.last_generated_date) {
        const [ly, lm] = r.last_generated_date.split("-").map(Number);
        cursorY = ly;
        cursorM = lm + 1;
        if (cursorM > 12) {
          cursorM = 1;
          cursorY++;
        }
      }
      for (let idx = r.installments_generated + 1; idx <= r.installments_total; idx++) {
        const key = `${cursorY}-${String(cursorM).padStart(2, "0")}`;
        if (indexByKey[key] !== undefined) {
          buckets[indexByKey[key]].total += computeInstallmentAmount(r.total_amount, r.installments_total, idx);
        }
        cursorM++;
        if (cursorM > 12) {
          cursorM = 1;
          cursorY++;
        }
      }
    }

    res.json(buckets.map((b) => ({ ...b, total: Number(b.total.toFixed(2)) })));
  } catch (err) {
    next(err);
  }
}

async function listInstallments(req, res, next) {
  try {
    await generateDueInstallments(req.userId);
    const [rows] = await pool.query(
      `SELECT i.*, a.name AS account_name, c.name AS category_name, c.color AS category_color
       FROM installment_purchases i
       LEFT JOIN accounts a ON a.id = i.account_id
       LEFT JOIN categories c ON c.id = i.category_id
       WHERE i.user_id = ? ORDER BY i.active DESC, i.day_of_month ASC`,
      [req.userId]
    );
    res.json(
      rows.map((r) => ({
        ...r,
        total_amount: Number(r.total_amount),
        installment_amount: computeInstallmentAmount(r.total_amount, r.installments_total, r.installments_generated + 1),
        remaining_amount: Number(
          (Number(r.total_amount) - (r.installments_generated / r.installments_total) * Number(r.total_amount)).toFixed(2)
        ),
      }))
    );
  } catch (err) {
    next(err);
  }
}

async function createInstallment(req, res, next) {
  try {
    const { account_id, category_id = null, description, total_amount, installments_total, day_of_month } = req.body;
    if (!account_id || !description || !total_amount || !installments_total || !day_of_month) {
      return res.status(400).json({ error: "Conta, descrição, valor total, nº de parcelas e dia do mês são obrigatórios." });
    }
    if (day_of_month < 1 || day_of_month > 28) {
      return res.status(400).json({ error: "Dia do mês deve ser entre 1 e 28 (evita mês com menos dias)." });
    }
    if (installments_total < 1 || installments_total > 60) {
      return res.status(400).json({ error: "Número de parcelas deve ser entre 1 e 60." });
    }
    const [result] = await pool.query(
      `INSERT INTO installment_purchases (user_id, account_id, category_id, description, total_amount, installments_total, day_of_month)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, account_id, category_id, description.trim(), total_amount, installments_total, day_of_month]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateInstallment(req, res, next) {
  try {
    const { account_id, category_id, description, total_amount, installments_total, day_of_month, active } = req.body;
    if (day_of_month < 1 || day_of_month > 28) {
      return res.status(400).json({ error: "Dia do mês deve ser entre 1 e 28 (evita mês com menos dias)." });
    }
    const [result] = await pool.query(
      `UPDATE installment_purchases SET account_id=?, category_id=?, description=?, total_amount=?, installments_total=?, day_of_month=?, active=?
       WHERE id=? AND user_id=?`,
      [account_id, category_id, description, total_amount, installments_total, day_of_month, active ? 1 : 0, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Compra parcelada não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteInstallment(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM installment_purchases WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Compra parcelada não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================== CAIXINHAS ====================================
// Reserva de dinheiro separada das contas — controle manual, não gera
// transações. Saldo é sempre calculado a partir das entries (nunca guardado).
async function listSavingsBoxes(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, COALESCE(SUM(e.amount), 0) AS balance
       FROM savings_boxes b LEFT JOIN savings_box_entries e ON e.box_id = b.id
       WHERE b.user_id = ? GROUP BY b.id ORDER BY b.created_at ASC`,
      [req.userId]
    );
    res.json(rows.map((r) => ({ ...r, balance: Number(r.balance), target_amount: r.target_amount === null ? null : Number(r.target_amount) })));
  } catch (err) {
    next(err);
  }
}

async function createSavingsBox(req, res, next) {
  try {
    const { name, target_amount = null, color = "#6694FF" } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nome da caixinha é obrigatório." });
    const [result] = await pool.query(
      `INSERT INTO savings_boxes (user_id, name, target_amount, color) VALUES (?, ?, ?, ?)`,
      [req.userId, name.trim(), target_amount, color]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateSavingsBox(req, res, next) {
  try {
    const { name, target_amount, color } = req.body;
    const [result] = await pool.query(
      `UPDATE savings_boxes SET name=?, target_amount=?, color=? WHERE id=? AND user_id=?`,
      [name, target_amount ?? null, color, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Caixinha não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteSavingsBox(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM savings_boxes WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Caixinha não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listSavingsBoxEntries(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT e.* FROM savings_box_entries e JOIN savings_boxes b ON b.id = e.box_id
       WHERE e.box_id = ? AND b.user_id = ? ORDER BY e.entry_date DESC, e.id DESC`,
      [req.params.id, req.userId]
    );
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (err) {
    next(err);
  }
}

// POST /api/finance/savings-boxes/:id/entries { amount, note, entry_date }
// amount positivo = depósito, negativo = resgate (validado contra o saldo atual)
async function createSavingsBoxEntry(req, res, next) {
  try {
    const { id } = req.params;
    const { amount, note = null, entry_date = todayStr() } = req.body;
    if (!amount || Number(amount) === 0) return res.status(400).json({ error: "Valor é obrigatório." });

    const [[box]] = await pool.query(
      `SELECT b.id, COALESCE(SUM(e.amount), 0) AS balance FROM savings_boxes b
       LEFT JOIN savings_box_entries e ON e.box_id = b.id WHERE b.id = ? AND b.user_id = ? GROUP BY b.id`,
      [id, req.userId]
    );
    if (!box) return res.status(404).json({ error: "Caixinha não encontrada." });
    if (Number(amount) < 0 && Number(box.balance) + Number(amount) < 0) {
      const available = Number(box.balance).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return res.status(400).json({ error: `Saldo insuficiente na caixinha (disponível: R$ ${available}).` });
    }

    const [result] = await pool.query(
      `INSERT INTO savings_box_entries (box_id, amount, entry_date, note) VALUES (?, ?, ?, ?)`,
      [id, amount, entry_date, note]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

// ============================== TRANSAÇÕES ==================================
async function listTransactions(req, res, next) {
  try {
    await generateDueRecurringTransactions(req.userId);
    await generateDueInstallments(req.userId);
    const { account_id, category_id, kind, from, to, search } = req.query;
    const clauses = ["tx.user_id = ?"];
    const params = [req.userId];
    if (account_id) {
      clauses.push("tx.account_id = ?");
      params.push(account_id);
    }
    if (category_id) {
      clauses.push("tx.category_id = ?");
      params.push(category_id);
    }
    if (kind) {
      clauses.push("tx.kind = ?");
      params.push(kind);
    }
    if (from) {
      clauses.push("tx.tx_date >= ?");
      params.push(from);
    }
    if (to) {
      clauses.push("tx.tx_date <= ?");
      params.push(to);
    }
    if (search) {
      clauses.push("tx.description LIKE ?");
      params.push(`%${search}%`);
    }
    const [rows] = await pool.query(
      `SELECT tx.*, a.name AS account_name, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM transactions tx
       LEFT JOIN accounts a ON a.id = tx.account_id
       LEFT JOIN categories c ON c.id = tx.category_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY tx.tx_date DESC, tx.id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createTransaction(req, res, next) {
  try {
    const { account_id, category_id = null, kind, amount, description = null, tx_date } = req.body;
    if (!account_id || !kind || !amount || !tx_date) {
      return res.status(400).json({ error: "Conta, tipo, valor e data são obrigatórios." });
    }
    const [result] = await pool.query(
      `INSERT INTO transactions (user_id, account_id, category_id, kind, amount, description, tx_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, account_id, category_id, kind, amount, description, tx_date]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateTransaction(req, res, next) {
  try {
    const { account_id, category_id, kind, amount, description, tx_date } = req.body;
    const [result] = await pool.query(
      `UPDATE transactions SET account_id=?, category_id=?, kind=?, amount=?, description=?, tx_date=?
       WHERE id=? AND user_id=?`,
      [account_id, category_id, kind, amount, description, tx_date, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Transação não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteTransaction(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM transactions WHERE id=? AND user_id=?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Transação não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// DELETE /api/finance/transactions/bulk?month=YYYY-MM — "resetar" o mês.
// Só mexe na tabela transactions; não toca em recurring_transactions nem
// installment_purchases (o contador de parcelas geradas não recua), então
// uma recorrente/parcelada que já gerou a transação desse mês não vai gerar
// de novo até o mês seguinte, mesmo depois do reset.
async function bulkDeleteTransactions(req, res, next) {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : todayStr().slice(0, 7);
    const { from, to } = monthRange(`${month}-01`);
    const [result] = await pool.query(`DELETE FROM transactions WHERE user_id = ? AND tx_date BETWEEN ? AND ?`, [req.userId, from, to]);
    res.json({ deleted: result.affectedRows });
  } catch (err) {
    next(err);
  }
}

// ============================== ORÇAMENTOS ==================================
async function listBudgets(req, res, next) {
  try {
    const { from, to } = monthRange(todayStr());
    const [rows] = await pool.query(
      `SELECT b.*, c.name AS category_name, c.color AS category_color,
              COALESCE(SUM(tx.amount), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN transactions tx ON tx.category_id = b.category_id AND tx.kind='expense' AND tx.tx_date BETWEEN ? AND ?
       WHERE c.user_id = ?
       GROUP BY b.id`,
      [from, to, req.userId]
    );
    res.json(rows.map((r) => ({ ...r, spent: Number(r.spent) })));
  } catch (err) {
    next(err);
  }
}

async function createBudget(req, res, next) {
  try {
    const { category_id, monthly_limit } = req.body;
    if (!category_id || !monthly_limit) {
      return res.status(400).json({ error: "Categoria e limite mensal são obrigatórios." });
    }
    const [[category]] = await pool.query(`SELECT id FROM categories WHERE id = ? AND user_id = ?`, [category_id, req.userId]);
    if (!category) return res.status(404).json({ error: "Categoria não encontrada." });
    const [result] = await pool.query(
      `INSERT INTO budgets (category_id, monthly_limit) VALUES (?, ?)`,
      [category_id, monthly_limit]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateBudget(req, res, next) {
  try {
    const { monthly_limit } = req.body;
    const [result] = await pool.query(
      `UPDATE budgets b JOIN categories c ON c.id = b.category_id SET b.monthly_limit=? WHERE b.id=? AND c.user_id=?`,
      [monthly_limit, req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Orçamento não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteBudget(req, res, next) {
  try {
    const [result] = await pool.query(
      `DELETE b FROM budgets b JOIN categories c ON c.id = b.category_id WHERE b.id=? AND c.user_id=?`,
      [req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Orçamento não encontrado." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================== KPIs / GRÁFICOS =============================

async function sumKind(userId, from, to) {
  const [rows] = await pool.query(
    `SELECT kind, COALESCE(SUM(amount),0) AS total FROM transactions
     WHERE user_id=? AND tx_date BETWEEN ? AND ? GROUP BY kind`,
    [userId, from, to]
  );
  const out = { income: 0, expense: 0 };
  rows.forEach((r) => (out[r.kind] = Number(r.total)));
  return out;
}

function pctChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

// GET /api/finance/summary?period=month
async function summary(req, res, next) {
  try {
    await generateDueRecurringTransactions(req.userId);
    await generateDueInstallments(req.userId);
    const today = todayStr();
    const cur = monthRange(today);
    const prev = previousMonthRange(today);

    const [curSums, prevSums, accounts] = await Promise.all([
      sumKind(req.userId, cur.from, cur.to),
      sumKind(req.userId, prev.from, prev.to),
      pool.query(
        `SELECT a.opening_balance,
                COALESCE(SUM(CASE WHEN tx.kind='income' THEN tx.amount ELSE -tx.amount END),0) AS delta
         FROM accounts a LEFT JOIN transactions tx ON tx.account_id = a.id
         WHERE a.user_id = ? GROUP BY a.id`,
        [req.userId]
      ),
    ]);

    const saldoAtual = accounts[0].reduce(
      (sum, a) => sum + Number(a.opening_balance) + Number(a.delta),
      0
    );
    const economiaAtual = curSums.income - curSums.expense;
    const economiaAnterior = prevSums.income - prevSums.expense;

    res.json({
      saldo_atual: saldoAtual,
      entradas: curSums.income,
      saidas: curSums.expense,
      economia: economiaAtual,
      entradas_variacao: pctChange(curSums.income, prevSums.income),
      saidas_variacao: pctChange(curSums.expense, prevSums.expense),
      economia_variacao: pctChange(economiaAtual, economiaAnterior),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/finance/series?period=1D|1S|1M|1A|MAX
// Série de gastos líquidos (saídas - entradas) por dia/semana/mês, pro gráfico com glow.
async function series(req, res, next) {
  try {
    const period = (req.query.period || "1M").toUpperCase();
    const today = todayStr();
    const config = {
      "1D": { days: 2, bucket: "day" },
      "1S": { days: 7, bucket: "day" },
      "1M": { days: 30, bucket: "day" },
      "1A": { days: 365, bucket: "week" },
      MAX: { days: 1825, bucket: "month" },
    }[period] || { days: 30, bucket: "day" };

    const from = addDays(today, -config.days);
    const [rows] = await pool.query(
      `SELECT tx_date, kind, amount FROM transactions WHERE user_id=? AND tx_date BETWEEN ? AND ? ORDER BY tx_date ASC`,
      [req.userId, from, today]
    );

    const bucketKey = (dateStr) => {
      if (config.bucket === "day") return dateStr;
      if (config.bucket === "week") {
        const day = dayOfWeek(dateStr);
        return addDays(dateStr, -((day + 6) % 7)); // segunda-feira daquela semana
      }
      return dateStr.slice(0, 7); // YYYY-MM
    };

    const buckets = {};
    rows.forEach((r) => {
      const key = bucketKey(r.tx_date);
      buckets[key] ||= { date: key, entradas: 0, saidas: 0 };
      buckets[key][r.kind === "income" ? "entradas" : "saidas"] += Number(r.amount);
    });

    const series = Object.values(buckets)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((b) => ({ ...b, saldo: b.entradas - b.saidas }));

    res.json(series);
  } catch (err) {
    next(err);
  }
}

// GET /api/finance/donut?period=month — gastos por categoria (mês atual)
async function donut(req, res, next) {
  try {
    const { from, to } = monthRange(todayStr());
    // LEFT JOIN (não JOIN): gastos sem categoria não podem simplesmente sumir do
    // gráfico — aparecem agrupados como "Sem categoria" em vez de somem calados.
    const [rows] = await pool.query(
      `SELECT COALESCE(c.id, 0) AS id, COALESCE(c.name, 'Sem categoria') AS name,
              COALESCE(c.color, '#6B6B72') AS color, COALESCE(SUM(tx.amount),0) AS total
       FROM transactions tx LEFT JOIN categories c ON c.id = tx.category_id
       WHERE tx.user_id=? AND tx.kind='expense' AND tx.tx_date BETWEEN ? AND ?
       GROUP BY c.id ORDER BY total DESC`,
      [req.userId, from, to]
    );
    res.json(rows.map((r) => ({ ...r, total: Number(r.total) })));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkDeleteTransactions,
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  listRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  listInstallments,
  createInstallment,
  updateInstallment,
  deleteInstallment,
  installmentsForecast,
  listSavingsBoxes,
  createSavingsBox,
  updateSavingsBox,
  deleteSavingsBox,
  listSavingsBoxEntries,
  createSavingsBoxEntry,
  summary,
  series,
  donut,
};
