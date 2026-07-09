// Relatório mensal de Finanças — HTML autocontido (sem depender do bundle da
// SPA) pra abrir numa aba do navegador padrão e usar Ctrl+P → "Salvar como
// PDF". Evita puxar uma lib de PDF só pra isso; o navegador já faz esse
// trabalho de graça.
const pool = require("../db");
const { todayStr, monthRange } = require("../utils/dates");

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmtBRL(n) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// installments_forecast reaproveita a mesma fórmula de finance.controller —
// duplicada aqui pra não criar uma dependência circular entre controllers só
// por causa de uma função de 5 linhas.
function computeInstallmentAmount(totalAmount, installmentsTotal, installmentIndex) {
  const total = Number(totalAmount);
  const base = Math.floor((total * 100) / installmentsTotal) / 100;
  if (installmentIndex < installmentsTotal) return base;
  return Number((total - base * (installmentsTotal - 1)).toFixed(2));
}

async function financeReport(req, res, next) {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : todayStr().slice(0, 7);
    const { from, to } = monthRange(`${month}-01`);
    const [year, monthNum] = month.split("-").map(Number);

    const [transactions] = await pool.query(
      `SELECT tx.*, a.name AS account_name, c.name AS category_name, c.color AS category_color
       FROM transactions tx
       LEFT JOIN accounts a ON a.id = tx.account_id
       LEFT JOIN categories c ON c.id = tx.category_id
       WHERE tx.user_id = ? AND tx.tx_date BETWEEN ? AND ?
       ORDER BY tx.tx_date ASC, tx.id ASC`,
      [req.userId, from, to]
    );

    const sums = { income: 0, expense: 0 };
    transactions.forEach((t) => (sums[t.kind] += Number(t.amount)));

    const [categories] = await pool.query(
      `SELECT COALESCE(c.name, 'Sem categoria') AS name, COALESCE(SUM(tx.amount), 0) AS total
       FROM transactions tx LEFT JOIN categories c ON c.id = tx.category_id
       WHERE tx.user_id = ? AND tx.kind = 'expense' AND tx.tx_date BETWEEN ? AND ?
       GROUP BY c.id ORDER BY total DESC`,
      [req.userId, from, to]
    );

    const [budgets] = await pool.query(
      `SELECT b.*, c.name AS category_name, COALESCE(SUM(tx.amount), 0) AS spent
       FROM budgets b JOIN categories c ON c.id = b.category_id
       LEFT JOIN transactions tx ON tx.category_id = b.category_id AND tx.kind = 'expense' AND tx.tx_date BETWEEN ? AND ?
       WHERE c.user_id = ?
       GROUP BY b.id ORDER BY c.name ASC`,
      [from, to, req.userId]
    );

    const [installments] = await pool.query(
      `SELECT i.*, a.name AS account_name FROM installment_purchases i
       LEFT JOIN accounts a ON a.id = i.account_id
       WHERE i.user_id = ? AND i.active = 1 ORDER BY i.day_of_month ASC`,
      [req.userId]
    );

    const [savingsBoxes] = await pool.query(
      `SELECT b.*, COALESCE(SUM(e.amount), 0) AS balance FROM savings_boxes b
       LEFT JOIN savings_box_entries e ON e.box_id = b.id
       WHERE b.user_id = ? GROUP BY b.id ORDER BY b.name ASC`,
      [req.userId]
    );

    const economia = sums.income - sums.expense;
    const totalCategorias = categories.reduce((s, c) => s + Number(c.total), 0);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Marshal Organization — Relatório de ${MONTHS[monthNum - 1]} de ${year}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Inter, Arial, sans-serif; color: #17171a; margin: 0; padding: 40px 48px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .subtitle { color: #6b6b72; font-size: 13px; margin: 0 0 28px; }
  .no-print button { font-family: inherit; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
  .kpi { border: 1px solid #e4e4e7; border-radius: 12px; padding: 14px 16px; }
  .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #8b8b93; margin-bottom: 6px; }
  .kpi .value { font-size: 20px; font-weight: 700; }
  .positive { color: #0a9c5c; }
  .negative { color: #d1382e; }
  section { margin-bottom: 28px; break-inside: avoid; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #45454b; border-bottom: 2px solid #17171a; padding-bottom: 6px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ececef; }
  th { color: #8b8b93; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { color: #a1a1aa; font-size: 12.5px; padding: 8px 0; }
  .bar-bg { background: #ececef; border-radius: 4px; height: 6px; overflow: hidden; width: 100px; display: inline-block; vertical-align: middle; }
  .bar-fill { height: 100%; background: #ff7a00; }
  .print-btn { background: #ff7a00; color: #150900; border: none; border-radius: 999px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 24px; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 0 24px; }
  }
</style>
</head>
<body>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">Imprimir / Salvar como PDF</button>
  </div>

  <h1>Marshal Organization — Relatório de Finanças</h1>
  <p class="subtitle">${MONTHS[monthNum - 1]} de ${year} · gerado em ${fmtDate(todayStr())}</p>

  <div class="kpis">
    <div class="kpi"><div class="label">Entradas</div><div class="value positive">${fmtBRL(sums.income)}</div></div>
    <div class="kpi"><div class="label">Saídas</div><div class="value negative">${fmtBRL(sums.expense)}</div></div>
    <div class="kpi"><div class="label">Economia do mês</div><div class="value ${economia >= 0 ? "positive" : "negative"}">${fmtBRL(economia)}</div></div>
  </div>

  <section>
    <h2>Gastos por categoria</h2>
    ${
      categories.length
        ? `<table>
             <thead><tr><th>Categoria</th><th class="num">Valor</th><th class="num">% do total</th></tr></thead>
             <tbody>
               ${categories
                 .map((c) => {
                   const pct = totalCategorias > 0 ? Math.round((Number(c.total) / totalCategorias) * 100) : 0;
                   return `<tr><td>${esc(c.name)}</td><td class="num">${fmtBRL(c.total)}</td><td class="num">${pct}%</td></tr>`;
                 })
                 .join("")}
             </tbody>
           </table>`
        : `<p class="empty">Nenhum gasto categorizado nesse mês.</p>`
    }
  </section>

  <section>
    <h2>Orçamentos do mês</h2>
    ${
      budgets.length
        ? `<table>
             <thead><tr><th>Categoria</th><th class="num">Gasto</th><th class="num">Limite</th><th class="num">%</th></tr></thead>
             <tbody>
               ${budgets
                 .map((b) => {
                   const pct = Math.min(100, Math.round((Number(b.spent) / Number(b.monthly_limit)) * 100));
                   const over = Number(b.spent) > Number(b.monthly_limit);
                   return `<tr><td>${esc(b.category_name)}</td><td class="num${over ? " negative" : ""}">${fmtBRL(b.spent)}</td><td class="num">${fmtBRL(b.monthly_limit)}</td><td class="num">${pct}%</td></tr>`;
                 })
                 .join("")}
             </tbody>
           </table>`
        : `<p class="empty">Nenhum orçamento definido.</p>`
    }
  </section>

  <section>
    <h2>Compras parceladas ativas</h2>
    ${
      installments.length
        ? `<table>
             <thead><tr><th>Descrição</th><th>Conta</th><th class="num">Parcela</th><th class="num">Progresso</th></tr></thead>
             <tbody>
               ${installments
                 .map((i) => {
                   const amount = computeInstallmentAmount(i.total_amount, i.installments_total, i.installments_generated + 1);
                   return `<tr><td>${esc(i.description)}</td><td>${esc(i.account_name)}</td><td class="num">${fmtBRL(amount)}/mês</td><td class="num">${i.installments_generated}/${i.installments_total}</td></tr>`;
                 })
                 .join("")}
             </tbody>
           </table>`
        : `<p class="empty">Nenhuma compra parcelada ativa.</p>`
    }
  </section>

  <section>
    <h2>Caixinhas</h2>
    ${
      savingsBoxes.length
        ? `<table>
             <thead><tr><th>Nome</th><th class="num">Saldo</th><th class="num">Meta</th></tr></thead>
             <tbody>
               ${savingsBoxes
                 .map(
                   (b) =>
                     `<tr><td>${esc(b.name)}</td><td class="num">${fmtBRL(b.balance)}</td><td class="num">${b.target_amount ? fmtBRL(b.target_amount) : "—"}</td></tr>`
                 )
                 .join("")}
             </tbody>
           </table>`
        : `<p class="empty">Nenhuma caixinha cadastrada.</p>`
    }
  </section>

  <section>
    <h2>Transações do mês (${transactions.length})</h2>
    ${
      transactions.length
        ? `<table>
             <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th class="num">Valor</th></tr></thead>
             <tbody>
               ${transactions
                 .map((t) => {
                   const positive = t.kind === "income";
                   return `<tr><td>${fmtDate(t.tx_date)}</td><td>${esc(t.description || t.category_name || "—")}</td><td>${esc(t.category_name || "Sem categoria")}</td><td>${esc(t.account_name)}</td><td class="num ${positive ? "positive" : "negative"}">${positive ? "+" : "-"} ${fmtBRL(t.amount)}</td></tr>`;
                 })
                 .join("")}
             </tbody>
           </table>`
        : `<p class="empty">Nenhuma transação nesse mês.</p>`
    }
  </section>
</body>
</html>`;

    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
}

module.exports = { financeReport };
