import { api, API_ORIGIN } from "../api.js";
import { toastSuccess, toastError, toastUndo } from "../components/toast.js";
import { openModal, closeModal, confirmModal } from "../components/modal.js";
import { emptyStateHtml } from "../components/empty-state.js";
import { ICONS } from "../components/icons.js";
import { attachRipple, animateCountUp } from "../components/card.js";
import { lineChartGlow, donutChart, barChartWeek } from "../components/chart-helpers.js";
import { revealOnScroll } from "../components/scroll-reveal.js";
import { themeToggleHtml } from "../app.js";
import { formatCurrency, todayStr } from "../format.js";

const PERIODS = ["1D", "1S", "1M", "1A", "MAX"];
const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function monthShortLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

let currentPeriod = "1M";
let lineChartInstance = null;
let donutChartInstance = null;
let forecastChartInstance = null;
let savingsDonutChartInstance = null;

export async function render(container, { setHeader, params: routeParams, isCurrent = () => true }) {
  container.innerHTML = `<div class="skeleton h-96 w-full"></div>`;

  const [accounts, categories] = await Promise.all([
    api.get("/finance/accounts").catch(() => []),
    api.get("/finance/categories").catch(() => []),
  ]);

  setHeader(`
    <div class="flex items-center justify-between anim-stagger-in">
      <h1 class="text-2xl font-semibold text-text-hi">Finanças</h1>
      <div class="flex items-center gap-2">
        <button id="monthly-report-btn" type="button" class="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2">
          <span class="w-4 h-4 [&>svg]:w-full [&>svg]:h-full">${ICONS.download}</span> Relatório mensal
        </button>
        ${themeToggleHtml()}
      </div>
    </div>
  `);
  document.getElementById("monthly-report-btn").addEventListener("click", openMonthlyReportModal);
  attachRipple(document.getElementById("monthly-report-btn"));

  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-6";

  // ---- Header gradiente com KPIs ----
  const header = document.createElement("div");
  header.className = "gradient-header rounded-card p-6 anim-stagger-in";
  header.innerHTML = `
    <div class="flex items-center justify-between mb-6 relative z-10">
      <div class="font-label text-[11px] text-white/80">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
      <div class="flex gap-2">
        <button id="add-income" type="button" class="btn-ghost px-4 py-2 text-sm bg-white/10 border-white/20 text-white">+ Entrada</button>
        <button id="add-expense" type="button" class="btn-accent px-4 py-2 text-sm">+ Saída</button>
      </div>
    </div>
    <div id="fin-kpis" class="grid grid-cols-2 xl:grid-cols-4 gap-4 relative z-10"></div>
  `;
  wrap.appendChild(header);

  // ---- Gráficos ----
  const chartsRow = document.createElement("div");
  chartsRow.className = "grid grid-cols-1 lg:grid-cols-3 gap-6 anim-stagger-in";
  chartsRow.innerHTML = `
    <div class="glass-card p-5 lg:col-span-2">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-text-hi">Saldo ao longo do tempo</h3>
        <div id="period-toggle" class="flex items-center gap-1 glass-card p-1 rounded-full">
          ${PERIODS.map((p) => `<button data-period="${p}" class="period-btn px-3 py-1 text-xs rounded-full">${p}</button>`).join("")}
        </div>
      </div>
      <div id="line-chart-wrap" class="h-64"><canvas id="line-chart"></canvas></div>
    </div>
    <div class="glass-card p-5">
      <h3 class="font-semibold text-text-hi mb-4">Gastos por categoria</h3>
      <div class="h-64 relative"><canvas id="donut-chart"></canvas></div>
      <div id="donut-legend" class="flex flex-col gap-1.5 mt-4 text-xs"></div>
    </div>
  `;
  wrap.appendChild(chartsRow);

  // ---- Gráficos: parcelas futuras + caixinhas ----
  const chartsRow2 = document.createElement("div");
  chartsRow2.className = "grid grid-cols-1 lg:grid-cols-3 gap-6 anim-stagger-in";
  chartsRow2.innerHTML = `
    <div class="glass-card p-5 lg:col-span-2">
      <h3 class="font-semibold text-text-hi mb-1">Compromisso de parcelas</h3>
      <p class="text-[11px] text-text-lo font-label mb-4">Quanto das parceladas ativas ainda pesa nos próximos meses</p>
      <div id="forecast-chart-wrap" class="h-56"><canvas id="forecast-chart"></canvas></div>
    </div>
    <div class="glass-card p-5">
      <h3 class="font-semibold text-text-hi mb-4">Distribuição das caixinhas</h3>
      <div id="savings-donut-wrap" class="h-56 relative"><canvas id="savings-donut-chart"></canvas></div>
      <div id="savings-donut-legend" class="flex flex-col gap-1.5 mt-4 text-xs"></div>
    </div>
  `;
  wrap.appendChild(chartsRow2);

  // ---- Orçamentos ----
  const budgetsSection = document.createElement("div");
  budgetsSection.className = "glass-card p-5 anim-stagger-in";
  budgetsSection.innerHTML = `<h3 class="font-semibold text-text-hi mb-4">Orçamentos do mês</h3><div id="budgets-list" class="flex flex-col gap-3"></div>`;
  wrap.appendChild(budgetsSection);

  // ---- Contas ----
  const accountsSection = document.createElement("div");
  accountsSection.className = "glass-card p-5 anim-stagger-in";
  accountsSection.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-text-hi">Contas</h3>
      <button id="new-account" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg">+ Conta</button>
    </div>
    <div id="accounts-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"></div>
  `;
  wrap.appendChild(accountsSection);

  // ---- Categorias ----
  const categoriesSection = document.createElement("div");
  categoriesSection.className = "glass-card p-5 anim-stagger-in";
  categoriesSection.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-text-hi">Categorias</h3>
      <button id="new-category" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg">+ Categoria</button>
    </div>
    <div id="categories-list" class="flex flex-col gap-4"></div>
  `;
  wrap.appendChild(categoriesSection);

  // ---- Transações recorrentes ----
  const recurringSection = document.createElement("div");
  recurringSection.className = "glass-card p-5 anim-stagger-in";
  recurringSection.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="font-semibold text-text-hi">Recorrentes</h3>
        <p class="text-[11px] text-text-lo font-label mt-0.5">Aluguel, assinaturas... lançadas sozinhas todo mês</p>
      </div>
      <button id="new-recurring" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg">+ Recorrente</button>
    </div>
    <div id="recurring-list" class="flex flex-col gap-2"></div>
  `;
  wrap.appendChild(recurringSection);

  // ---- Compras parceladas ----
  const installmentsSection = document.createElement("div");
  installmentsSection.className = "glass-card p-5 anim-stagger-in";
  installmentsSection.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="font-semibold text-text-hi">Compras parceladas</h3>
        <p class="text-[11px] text-text-lo font-label mt-0.5">Notebook em 12x, essas coisas — lançadas sozinhas todo mês até acabar</p>
      </div>
      <button id="new-installment" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg">+ Parcelada</button>
    </div>
    <div id="installments-list" class="flex flex-col gap-2"></div>
  `;
  wrap.appendChild(installmentsSection);

  // ---- Caixinhas ----
  const savingsSection = document.createElement("div");
  savingsSection.className = "glass-card p-5 anim-stagger-in";
  savingsSection.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="font-semibold text-text-hi">Caixinhas</h3>
        <p class="text-[11px] text-text-lo font-label mt-0.5">Reservas separadas das contas — saldo controlado manualmente</p>
      </div>
      <button id="new-savings-box" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg">+ Caixinha</button>
    </div>
    <div id="savings-boxes-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"></div>
  `;
  wrap.appendChild(savingsSection);

  // ---- Transações ----
  const txSection = document.createElement("div");
  txSection.className = "glass-card p-5 anim-stagger-in";
  txSection.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-text-hi">Transações recentes</h3>
      <button id="reset-month-btn" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg text-negative">Apagar transações do mês...</button>
    </div>
    <div id="tx-list" class="flex flex-col gap-2"></div>
  `;
  txSection.querySelector("#reset-month-btn").addEventListener("click", () => openResetMonthModal(refresh));
  wrap.appendChild(txSection);

  container.innerHTML = "";
  container.appendChild(wrap);

  header.querySelector("#add-income").addEventListener("click", () => openTransactionModal("income", accounts, categories, refresh));
  header.querySelector("#add-expense").addEventListener("click", () => openTransactionModal("expense", accounts, categories, refresh));
  accountsSection.querySelector("#new-account").addEventListener("click", () => openAccountModal(null, refresh));
  categoriesSection.querySelector("#new-category").addEventListener("click", () => openCategoryModal(null, refresh));
  recurringSection.querySelector("#new-recurring").addEventListener("click", () => openRecurringModal(null, accounts, categories, refresh));
  installmentsSection.querySelector("#new-installment").addEventListener("click", () => openInstallmentModal(null, accounts, categories, refresh));
  savingsSection.querySelector("#new-savings-box").addEventListener("click", () => openSavingsBoxModal(null, refresh));
  attachRipple(header.querySelector("#add-income"));
  attachRipple(header.querySelector("#add-expense"));

  // ação rápida do ⌘K: #/financas?new=income|expense abre direto o modal
  if (routeParams?.new === "income") header.querySelector("#add-income").click();
  else if (routeParams?.new === "expense") header.querySelector("#add-expense").click();

  chartsRow.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPeriod = btn.dataset.period;
      loadSeries();
    });
  });

  await Promise.all([
    loadSummary(),
    loadSeries(),
    loadDonut(),
    loadBudgets(),
    renderAccounts(accounts, refresh),
    renderCategories(categories, refresh),
    loadRecurring(accounts, categories),
    loadInstallments(accounts, categories),
    loadSavingsBoxes(),
    loadInstallmentForecast(),
    loadSavingsDonut(),
    loadTransactions(accounts, categories),
  ]);

  function refresh() {
    if (!isCurrent()) return;
    render(container, { setHeader, isCurrent });
  }

  async function loadSummary() {
    try {
      const s = await api.get("/finance/summary");
      if (!isCurrent()) return;
      const kpiHost = document.getElementById("fin-kpis");
      kpiHost.innerHTML = "";
      kpiHost.appendChild(finKpi("Saldo atual", s.saldo_atual, null));
      kpiHost.appendChild(finKpi("Entradas", s.entradas, s.entradas_variacao));
      kpiHost.appendChild(finKpi("Saídas", s.saidas, s.saidas_variacao));
      kpiHost.appendChild(finKpi("Economia do mês", s.economia, s.economia_variacao));
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadSeries() {
    updatePeriodButtons();
    try {
      const series = await api.get(`/finance/series?period=${currentPeriod}`);
      if (!isCurrent()) return;
      const wrap = document.getElementById("line-chart-wrap");
      if (lineChartInstance) {
        lineChartInstance.destroy();
        lineChartInstance = null;
      }
      if (!series.length) {
        wrap.innerHTML = emptyStateHtml({ icon: ICONS.trending, title: "Nenhuma transação ainda", subtitle: "Adicione uma entrada ou saída pra ver o gráfico." });
        return;
      }
      // reconstrói o <canvas> — a chamada anterior pode ter deixado um empty state no lugar dele
      wrap.innerHTML = `<canvas id="line-chart"></canvas>`;
      lineChartInstance = lineChartGlow(document.getElementById("line-chart"), {
        labels: series.map((s) => s.date.slice(5)),
        data: series.map((s) => s.saldo),
        color: "#FF7A00",
        label: "Saldo líquido",
      });
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadDonut() {
    try {
      const data = await api.get("/finance/donut");
      if (!isCurrent()) return;
      const canvas = document.getElementById("donut-chart");
      if (!data.length) {
        canvas.parentElement.innerHTML = emptyStateHtml({ icon: ICONS.donut, title: "Sem gastos este mês" });
        return;
      }
      if (donutChartInstance) donutChartInstance.destroy();
      donutChartInstance = donutChart(canvas, {
        labels: data.map((d) => d.name),
        data: data.map((d) => d.total),
        colors: data.map((d) => d.color),
      });
      document.getElementById("donut-legend").innerHTML = data
        .map(
          (d) => `<div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-text-mid"><span class="w-2 h-2 rounded-full" style="background:${d.color}"></span>${d.name}</span>
            <span class="tabular text-text-hi">${formatCurrency(d.total)}</span>
          </div>`
        )
        .join("");
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadBudgets() {
    try {
      const budgets = await api.get("/finance/budgets");
      if (!isCurrent()) return;
      const host = document.getElementById("budgets-list");
      if (!budgets.length) {
        host.innerHTML = emptyStateHtml({ icon: ICONS.metas, title: "Nenhum orçamento definido" });
        return;
      }
      host.innerHTML = budgets
        .map((b) => {
          const pct = Math.min(100, Math.round((b.spent / b.monthly_limit) * 100));
          const over = b.spent > b.monthly_limit;
          return `
          <div>
            <div class="flex items-center justify-between text-sm mb-1.5">
              <span class="text-text-hi flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${b.category_color}"></span>${b.category_name}</span>
              <span class="tabular ${over ? "text-negative" : "text-text-mid"}">${formatCurrency(b.spent)} / ${formatCurrency(b.monthly_limit)}</span>
            </div>
            <div class="h-2 rounded-full bg-white/5 overflow-hidden">
              <div class="h-full rounded-full" style="width:${pct}%; background:${over ? "var(--red)" : "var(--accent)"}; transition: width 0.8s cubic-bezier(.2,.8,.2,1);"></div>
            </div>
          </div>`;
        })
        .join("");
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadRecurring(accountsList, categoriesList) {
    try {
      const recurring = await api.get("/finance/recurring");
      if (!isCurrent()) return;
      const host = document.getElementById("recurring-list");
      if (!recurring.length) {
        host.innerHTML = emptyStateHtml({ icon: ICONS.rotina, title: "Nenhuma recorrente cadastrada", subtitle: "Cadastre o aluguel ou uma assinatura pra não esquecer de lançar todo mês." });
        return;
      }
      host.innerHTML = "";
      recurring.forEach((r) => host.appendChild(recurringRow(r, accountsList, categoriesList, refresh)));
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadInstallments(accountsList, categoriesList) {
    try {
      const installments = await api.get("/finance/installments");
      if (!isCurrent()) return;
      const host = document.getElementById("installments-list");
      if (!installments.length) {
        host.innerHTML = emptyStateHtml({ icon: ICONS.card, title: "Nenhuma parcelada cadastrada", subtitle: "Cadastre uma compra parcelada pra não esquecer de acompanhar." });
        return;
      }
      host.innerHTML = "";
      installments.forEach((i) => host.appendChild(installmentRow(i, accountsList, categoriesList, refresh)));
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadSavingsBoxes() {
    try {
      const boxes = await api.get("/finance/savings-boxes");
      if (!isCurrent()) return;
      const host = document.getElementById("savings-boxes-list");
      if (!boxes.length) {
        host.innerHTML = emptyStateHtml({ icon: ICONS.wallet, title: "Nenhuma caixinha ainda", subtitle: "Crie uma caixinha pra separar dinheiro de um objetivo." });
        return;
      }
      host.innerHTML = "";
      boxes.forEach((b) => host.appendChild(savingsBoxCard(b, refresh)));
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadInstallmentForecast() {
    try {
      const forecast = await api.get("/finance/installments/forecast?months=6");
      if (!isCurrent()) return;
      const wrap = document.getElementById("forecast-chart-wrap");
      if (forecastChartInstance) {
        forecastChartInstance.destroy();
        forecastChartInstance = null;
      }
      if (!forecast.some((f) => f.total > 0)) {
        wrap.innerHTML = emptyStateHtml({ icon: ICONS.card, title: "Nenhuma parcela futura" });
        return;
      }
      wrap.innerHTML = `<canvas id="forecast-chart"></canvas>`;
      const currentMonthKey = todayStr().slice(0, 7);
      forecastChartInstance = barChartWeek(document.getElementById("forecast-chart"), {
        labels: forecast.map((f) => monthShortLabel(f.key)),
        data: forecast.map((f) => f.total),
        activeIndex: forecast.findIndex((f) => f.key === currentMonthKey),
      });
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadSavingsDonut() {
    try {
      const boxes = await api.get("/finance/savings-boxes");
      if (!isCurrent()) return;
      const canvas = document.getElementById("savings-donut-chart");
      const legend = document.getElementById("savings-donut-legend");
      if (savingsDonutChartInstance) {
        savingsDonutChartInstance.destroy();
        savingsDonutChartInstance = null;
      }
      const withBalance = boxes.filter((b) => b.balance > 0);
      if (!withBalance.length) {
        canvas.parentElement.innerHTML = emptyStateHtml({ icon: ICONS.wallet, title: "Nada guardado ainda" });
        legend.innerHTML = "";
        return;
      }
      savingsDonutChartInstance = donutChart(canvas, {
        labels: withBalance.map((b) => b.name),
        data: withBalance.map((b) => b.balance),
        colors: withBalance.map((b) => b.color),
      });
      legend.innerHTML = withBalance
        .map(
          (b) => `<div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-text-mid"><span class="w-2 h-2 rounded-full" style="background:${b.color}"></span>${b.name}</span>
            <span class="tabular text-text-hi">${formatCurrency(b.balance)}</span>
          </div>`
        )
        .join("");
    } catch (err) {
      toastError(err.message);
    }
  }

  async function loadTransactions(accountsList, categoriesList) {
    try {
      const txs = await api.get("/finance/transactions");
      if (!isCurrent()) return;
      const host = document.getElementById("tx-list");
      if (!txs.length) {
        host.innerHTML = emptyStateHtml({ icon: ICONS.card, title: "Nenhuma transação ainda", subtitle: "Adicione uma entrada ou saída pra começar." });
        return;
      }
      host.innerHTML = "";
      txs.slice(0, 25).forEach((tx) => host.appendChild(transactionRow(tx, accountsList, categoriesList, refresh)));
      revealOnScroll(host.children);
    } catch (err) {
      toastError(err.message);
    }
  }
}

function updatePeriodButtons() {
  document.querySelectorAll(".period-btn").forEach((btn) => {
    const active = btn.dataset.period === currentPeriod;
    btn.style.background = active ? "var(--accent)" : "transparent";
    btn.style.color = active ? "#150900" : "var(--text-mid)";
  });
}

function finKpi(label, value, variacao) {
  const el = document.createElement("div");
  el.className = "flex flex-col gap-1 min-w-0";
  const deltaHtml =
    variacao === null || variacao === undefined
      ? ""
      : `<span class="text-xs font-mono ${variacao >= 0 ? "text-positive" : "text-negative"}">${variacao >= 0 ? "↑" : "↓"} ${Math.abs(variacao)}%</span>`;
  el.innerHTML = `
    <span class="font-label text-[11px] text-white/70">${label}</span>
    <span data-value class="text-2xl font-bold tabular text-white truncate block">R$ 0,00</span>
    ${deltaHtml}
  `;
  animateCountUp(el.querySelector("[data-value]"), value, { prefix: "R$ ", decimals: 2 });
  return el;
}

function transactionRow(tx, accounts, categories, onChange) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 px-3 py-2.5 rounded-xl card-hover cursor-pointer";
  row.style.background = "var(--glass)";
  const positive = tx.kind === "income";
  row.innerHTML = `
    <span class="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0" style="background:${tx.category_color || "#6694FF"}22; color:${tx.category_color || "#6694FF"}">
      ${positive ? "↑" : "↓"}
    </span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text-hi truncate">${tx.description || tx.category_name || "Transação"}</p>
      <p class="text-[11px] text-text-lo font-label">${tx.category_name || "Sem categoria"} · ${tx.account_name} · ${tx.tx_date.slice(5)}</p>
    </div>
    <span class="tabular text-sm font-medium ${positive ? "text-positive" : "text-negative"}">${positive ? "+" : "-"} ${formatCurrency(tx.amount)}</span>
    <button type="button" data-delete class="btn-ghost w-7 h-7 rounded-full flex items-center justify-center text-xs text-negative shrink-0">✕</button>
  `;
  row.querySelector("[data-delete]").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await confirmModal({ title: "Excluir transação", message: "Tem certeza que quer excluir esta transação?", confirmLabel: "Excluir" });
    if (!ok) return;
    try {
      await api.del(`/finance/transactions/${tx.id}`);
      onChange();
      toastUndo(`"${tx.description || tx.category_name || "Transação"}" excluída`, async () => {
        try {
          await api.post("/finance/transactions", {
            account_id: tx.account_id,
            category_id: tx.category_id,
            kind: tx.kind,
            amount: tx.amount,
            description: tx.description,
            tx_date: tx.tx_date,
          });
          toastSuccess("Restaurada");
          onChange();
        } catch (err) {
          toastError(err.message);
        }
      });
    } catch (err) {
      toastError(err.message);
    }
  });
  return row;
}

function recurringRow(r, accounts, categories, onChange) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 px-3 py-2.5 rounded-xl card-hover cursor-pointer";
  row.style.background = "var(--glass)";
  row.style.opacity = r.active ? "1" : "0.5";
  const positive = r.kind === "income";
  row.innerHTML = `
    <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style="background:${r.category_color || "#6694FF"}22; color:${r.category_color || "#6694FF"}">
      <span class="w-4 h-4 [&>svg]:w-full [&>svg]:h-full">${ICONS.rotina}</span>
    </span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text-hi truncate">${r.description || r.category_name || "Recorrente"}${r.active ? "" : " · pausada"}</p>
      <p class="text-[11px] text-text-lo font-label">${r.category_name || "Sem categoria"} · ${r.account_name} · todo dia ${r.day_of_month}</p>
    </div>
    <span class="tabular text-sm font-medium ${positive ? "text-positive" : "text-negative"}">${positive ? "+" : "-"} ${formatCurrency(r.amount)}</span>
  `;
  row.addEventListener("click", () => openRecurringModal(r, accounts, categories, onChange));
  return row;
}

function installmentRow(i, accounts, categories, onChange) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 px-3 py-2.5 rounded-xl card-hover cursor-pointer";
  row.style.background = "var(--glass)";
  row.style.opacity = i.active ? "1" : "0.5";
  const pct = Math.round((i.installments_generated / i.installments_total) * 100);
  row.innerHTML = `
    <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style="background:${i.category_color || "#6694FF"}22; color:${i.category_color || "#6694FF"}">
      <span class="w-4 h-4 [&>svg]:w-full [&>svg]:h-full">${ICONS.card}</span>
    </span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text-hi truncate">${i.description}${i.active ? "" : " · quitada"}</p>
      <p class="text-[11px] text-text-lo font-label">${i.installments_generated}/${i.installments_total} parcelas · ${i.account_name} · dia ${i.day_of_month}${i.active ? ` · faltam ${formatCurrency(i.remaining_amount)}` : ""}</p>
      <div class="h-1 rounded-full bg-white/5 overflow-hidden mt-1.5 max-w-[160px]">
        <div class="h-full rounded-full" style="width:${pct}%; background:var(--accent)"></div>
      </div>
    </div>
    <span class="tabular text-sm font-medium text-negative shrink-0">${formatCurrency(i.installment_amount)}${i.active ? "/mês" : ""}</span>
  `;
  row.addEventListener("click", () => openInstallmentModal(i, accounts, categories, onChange));
  return row;
}

function savingsBoxCard(box, onChange) {
  const card = document.createElement("div");
  card.className = "glass-panel p-4 rounded-2xl flex flex-col gap-3";
  const pct = box.target_amount ? Math.min(100, Math.round((box.balance / box.target_amount) * 100)) : null;
  card.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <p class="text-text-hi font-medium truncate flex items-center gap-2">
        <span class="w-2 h-2 rounded-full shrink-0" style="background:${box.color}"></span>${box.name}
      </p>
      <button type="button" data-edit class="btn-ghost w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-text-mid shrink-0">✎</button>
    </div>
    <p class="tabular text-xl font-semibold text-text-hi truncate">${formatCurrency(box.balance)}</p>
    ${
      box.target_amount
        ? `<div>
             <div class="h-1.5 rounded-full bg-white/5 overflow-hidden mb-1">
               <div class="h-full rounded-full" style="width:${pct}%; background:${box.color}"></div>
             </div>
             <p class="text-[11px] text-text-lo font-label">${pct}% de ${formatCurrency(box.target_amount)}</p>
           </div>`
        : ""
    }
    <div class="flex gap-2 mt-1">
      <button type="button" data-deposit class="btn-ghost flex-1 px-3 py-1.5 text-xs rounded-lg text-positive">+ Depositar</button>
      <button type="button" data-withdraw class="btn-ghost flex-1 px-3 py-1.5 text-xs rounded-lg text-negative">- Resgatar</button>
    </div>
  `;
  card.querySelector("[data-edit]").addEventListener("click", (e) => {
    e.stopPropagation();
    openSavingsBoxModal(box, onChange);
  });
  card.querySelector("[data-deposit]").addEventListener("click", (e) => {
    e.stopPropagation();
    openSavingsEntryModal(box, "deposit", onChange);
  });
  card.querySelector("[data-withdraw]").addEventListener("click", (e) => {
    e.stopPropagation();
    openSavingsEntryModal(box, "withdraw", onChange);
  });
  return card;
}

function renderAccounts(accounts, onChange) {
  const host = document.getElementById("accounts-list");
  if (!accounts.length) {
    host.innerHTML = emptyStateHtml({ icon: ICONS.bank, title: "Nenhuma conta cadastrada" });
    return;
  }
  host.innerHTML = "";
  accounts.forEach((a) => {
    const card = document.createElement("div");
    card.className = "glass-panel p-4 rounded-2xl card-hover cursor-pointer";
    card.innerHTML = `
      <p class="font-label text-[11px] text-text-mid mb-1">${a.type.toUpperCase()}</p>
      <p class="text-text-hi font-medium mb-2">${a.name}</p>
      <p class="tabular text-lg font-semibold text-text-hi">${formatCurrency(a.balance)}</p>
    `;
    card.addEventListener("click", () => openAccountModal(a, onChange));
    host.appendChild(card);
  });
}

function renderCategories(categories, onChange) {
  const host = document.getElementById("categories-list");
  if (!categories.length) {
    host.innerHTML = emptyStateHtml({ icon: ICONS.tag, title: "Nenhuma categoria cadastrada" });
    return;
  }
  const groups = [
    { kind: "income", label: "Entradas" },
    { kind: "expense", label: "Saídas" },
  ];
  host.innerHTML = "";
  groups.forEach((g) => {
    const items = categories.filter((c) => c.kind === g.kind);
    if (!items.length) return;
    const block = document.createElement("div");
    block.innerHTML = `<p class="font-label text-[10px] text-text-lo mb-2">${g.label}</p>`;
    const chipsWrap = document.createElement("div");
    chipsWrap.className = "flex flex-wrap gap-2";
    items.forEach((c) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pill flex items-center gap-1.5 card-hover";
      chip.style.background = "var(--glass)";
      chip.style.color = "var(--text-hi)";
      chip.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:${c.color}"></span>${c.name}`;
      chip.addEventListener("click", () => openCategoryModal(c, onChange));
      chipsWrap.appendChild(chip);
    });
    block.appendChild(chipsWrap);
    host.appendChild(block);
  });
}

function openCategoryModal(category, onSaved) {
  const isEdit = !!category;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="category-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Nome</label>
        <input name="name" required class="input-glass w-full px-3 py-2 text-sm" value="${category?.name ?? ""}" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Tipo</label>
          <select name="kind" class="input-glass w-full px-3 py-2 text-sm">
            <option value="expense" ${!category || category?.kind === "expense" ? "selected" : ""}>Saída</option>
            <option value="income" ${category?.kind === "income" ? "selected" : ""}>Entrada</option>
          </select>
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Cor</label>
          <input name="color" type="color" class="h-9 w-full bg-transparent" value="${category?.color ?? "#6694FF"}" />
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar categoria"}</button>
      </div>
    </form>
  `;
  openModal({ title: isEdit ? "Editar categoria" : "Nova categoria", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({
        title: "Excluir categoria",
        message: `Tem certeza que quer excluir "${category.name}"? Transações com essa categoria ficarão sem categoria, e orçamentos vinculados a ela serão removidos.`,
        confirmLabel: "Excluir",
      });
      if (!ok) return;
      try {
        await api.del(`/finance/categories/${category.id}`);
        closeModal();
        onSaved();
        // orçamentos vinculados e a categorização das transações não voltam
        // (foram removidos/desvinculados em cascata) — só a categoria em si.
        toastUndo(`"${category.name}" excluída`, async () => {
          try {
            await api.post("/finance/categories", { name: category.name, kind: category.kind, color: category.color, icon: category.icon });
            toastSuccess("Restaurada");
            onSaved();
          } catch (err) {
            toastError(err.message);
          }
        });
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  body.querySelector("#category-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = { name: fd.get("name"), kind: fd.get("kind"), color: fd.get("color"), icon: category?.icon ?? null };
    try {
      if (isEdit) {
        await api.put(`/finance/categories/${category.id}`, payload);
        toastSuccess("Categoria atualizada");
      } else {
        await api.post("/finance/categories", payload);
        toastSuccess("Categoria criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openTransactionModal(kind, accounts, categories, onSaved) {
  const relevantCategories = categories.filter((c) => c.kind === kind);
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="tx-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Valor</label>
        <input name="amount" type="number" step="0.01" min="0.01" required class="input-glass w-full px-3 py-2 text-sm" placeholder="0,00" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Descrição</label>
        <input name="description" class="input-glass w-full px-3 py-2 text-sm" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Conta</label>
          <select name="account_id" class="input-glass w-full px-3 py-2 text-sm">
            ${accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Categoria</label>
          <select name="category_id" class="input-glass w-full px-3 py-2 text-sm">
            <option value="">Sem categoria</option>
            ${relevantCategories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
          </select>
        </div>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Data</label>
        <input name="tx_date" type="date" required class="input-glass w-full px-3 py-2 text-sm" value="${todayStr()}" />
      </div>
      <div class="flex justify-end gap-2 mt-2">
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">Adicionar ${kind === "income" ? "entrada" : "saída"}</button>
      </div>
    </form>
  `;
  openModal({ title: kind === "income" ? "Nova entrada" : "Nova saída", bodyEl: body });

  body.querySelector("#tx-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post("/finance/transactions", {
        kind,
        amount: Number(fd.get("amount")),
        description: fd.get("description") || null,
        account_id: Number(fd.get("account_id")),
        category_id: fd.get("category_id") ? Number(fd.get("category_id")) : null,
        tx_date: fd.get("tx_date"),
      });
      toastSuccess(kind === "income" ? "Entrada adicionada" : "Saída adicionada");
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openRecurringModal(recurring, accounts, categories, onSaved) {
  const isEdit = !!recurring;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="recurring-form" class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Tipo</label>
          <select name="kind" class="input-glass w-full px-3 py-2 text-sm">
            <option value="expense" ${!recurring || recurring?.kind === "expense" ? "selected" : ""}>Saída</option>
            <option value="income" ${recurring?.kind === "income" ? "selected" : ""}>Entrada</option>
          </select>
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Valor</label>
          <input name="amount" type="number" step="0.01" min="0.01" required class="input-glass w-full px-3 py-2 text-sm" value="${recurring?.amount ?? ""}" placeholder="0,00" />
        </div>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Descrição</label>
        <input name="description" class="input-glass w-full px-3 py-2 text-sm" value="${recurring?.description ?? ""}" placeholder="Aluguel, Netflix..." />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Conta</label>
          <select name="account_id" class="input-glass w-full px-3 py-2 text-sm">
            ${accounts.map((a) => `<option value="${a.id}" ${recurring?.account_id === a.id ? "selected" : ""}>${a.name}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Categoria</label>
          <select name="category_id" class="input-glass w-full px-3 py-2 text-sm">
            <option value="">Sem categoria</option>
            ${categories.map((c) => `<option value="${c.id}" ${recurring?.category_id === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
          </select>
        </div>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Dia do mês</label>
        <input name="day_of_month" type="number" min="1" max="28" required class="input-glass w-full px-3 py-2 text-sm" value="${recurring?.day_of_month ?? 1}" />
        <p class="text-[11px] text-text-lo mt-1">Entre 1 e 28, pra funcionar igual em todo mês.</p>
      </div>
      ${
        isEdit
          ? `<label class="flex items-center gap-2 text-sm text-text-mid cursor-pointer">
               <input type="checkbox" name="active" ${recurring?.active ? "checked" : ""} /> Ativa
             </label>`
          : ""
      }
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar recorrente"}</button>
      </div>
    </form>
  `;
  openModal({ title: isEdit ? "Editar recorrente" : "Nova recorrente", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Excluir recorrente", message: `Tem certeza que quer excluir "${recurring.description || "essa recorrente"}"? As transações já lançadas por ela continuam no histórico.`, confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/finance/recurring/${recurring.id}`);
        closeModal();
        onSaved();
        toastUndo(`"${recurring.description || "Recorrente"}" excluída`, async () => {
          try {
            await api.post("/finance/recurring", {
              account_id: recurring.account_id,
              category_id: recurring.category_id,
              kind: recurring.kind,
              amount: recurring.amount,
              description: recurring.description,
              day_of_month: recurring.day_of_month,
            });
            toastSuccess("Restaurada");
            onSaved();
          } catch (err) {
            toastError(err.message);
          }
        });
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  body.querySelector("#recurring-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      kind: fd.get("kind"),
      amount: Number(fd.get("amount")),
      description: fd.get("description") || null,
      account_id: Number(fd.get("account_id")),
      category_id: fd.get("category_id") ? Number(fd.get("category_id")) : null,
      day_of_month: Number(fd.get("day_of_month")),
      active: isEdit ? fd.get("active") === "on" : true,
    };
    try {
      if (isEdit) {
        await api.put(`/finance/recurring/${recurring.id}`, payload);
        toastSuccess("Recorrente atualizada");
      } else {
        await api.post("/finance/recurring", payload);
        toastSuccess("Recorrente criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openInstallmentModal(installment, accounts, categories, onSaved) {
  const isEdit = !!installment;
  const relevantCategories = categories.filter((c) => c.kind === "expense");
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="installment-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Descrição</label>
        <input name="description" required class="input-glass w-full px-3 py-2 text-sm" value="${installment?.description ?? ""}" placeholder="Notebook, celular..." />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Valor total</label>
          <input name="total_amount" type="number" step="0.01" min="0.01" required class="input-glass w-full px-3 py-2 text-sm" value="${installment?.total_amount ?? ""}" placeholder="0,00" />
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Nº de parcelas</label>
          <input name="installments_total" type="number" min="1" max="60" required class="input-glass w-full px-3 py-2 text-sm" value="${installment?.installments_total ?? 12}" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Conta</label>
          <select name="account_id" class="input-glass w-full px-3 py-2 text-sm">
            ${accounts.map((a) => `<option value="${a.id}" ${installment?.account_id === a.id ? "selected" : ""}>${a.name}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Categoria</label>
          <select name="category_id" class="input-glass w-full px-3 py-2 text-sm">
            <option value="">Sem categoria</option>
            ${relevantCategories.map((c) => `<option value="${c.id}" ${installment?.category_id === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
          </select>
        </div>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Dia de cobrança da fatura</label>
        <input name="day_of_month" type="number" min="1" max="28" required class="input-glass w-full px-3 py-2 text-sm" value="${installment?.day_of_month ?? 1}" />
        <p class="text-[11px] text-text-lo mt-1">Entre 1 e 28, pra funcionar igual em todo mês.</p>
      </div>
      ${
        isEdit
          ? `<p class="text-[11px] text-text-lo">${installment.installments_generated}/${installment.installments_total} parcelas já lançadas. Editar valor total ou nº de parcelas só muda as próximas.</p>
             <label class="flex items-center gap-2 text-sm text-text-mid cursor-pointer">
               <input type="checkbox" name="active" ${installment?.active ? "checked" : ""} /> Ativa
             </label>`
          : ""
      }
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar parcelada"}</button>
      </div>
    </form>
  `;
  openModal({ title: isEdit ? "Editar compra parcelada" : "Nova compra parcelada", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({
        title: "Excluir parcelada",
        message: `Tem certeza que quer excluir "${installment.description}"? As parcelas já lançadas continuam no histórico de transações — só o acompanhamento é removido.`,
        confirmLabel: "Excluir",
      });
      if (!ok) return;
      try {
        await api.del(`/finance/installments/${installment.id}`);
        closeModal();
        onSaved();
        toastSuccess(`"${installment.description}" excluída`);
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  body.querySelector("#installment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      description: fd.get("description"),
      total_amount: Number(fd.get("total_amount")),
      installments_total: Number(fd.get("installments_total")),
      account_id: Number(fd.get("account_id")),
      category_id: fd.get("category_id") ? Number(fd.get("category_id")) : null,
      day_of_month: Number(fd.get("day_of_month")),
      active: isEdit ? fd.get("active") === "on" : true,
    };
    try {
      if (isEdit) {
        await api.put(`/finance/installments/${installment.id}`, payload);
        toastSuccess("Parcelada atualizada");
      } else {
        await api.post("/finance/installments", payload);
        toastSuccess("Parcelada criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openSavingsBoxModal(box, onSaved) {
  const isEdit = !!box;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="savings-box-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Nome</label>
        <input name="name" required class="input-glass w-full px-3 py-2 text-sm" value="${box?.name ?? ""}" placeholder="Viagem, reserva de emergência..." />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Meta (opcional)</label>
          <input name="target_amount" type="number" step="0.01" min="0" class="input-glass w-full px-3 py-2 text-sm" value="${box?.target_amount ?? ""}" placeholder="0,00" />
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Cor</label>
          <input name="color" type="color" class="h-9 w-full bg-transparent" value="${box?.color ?? "#6694FF"}" />
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar caixinha"}</button>
      </div>
    </form>
  `;
  openModal({ title: isEdit ? "Editar caixinha" : "Nova caixinha", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const message =
        box.balance > 0
          ? `"${box.name}" ainda tem ${formatCurrency(box.balance)} guardado. Excluir apaga o histórico e esse valor some do controle de caixinhas (o dinheiro em si não é mexido, é só o registro). Tem certeza?`
          : `Tem certeza que quer excluir "${box.name}"?`;
      const ok = await confirmModal({ title: "Excluir caixinha", message, confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/finance/savings-boxes/${box.id}`);
        closeModal();
        onSaved();
        toastSuccess(`"${box.name}" excluída`);
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  body.querySelector("#savings-box-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get("name"),
      target_amount: fd.get("target_amount") ? Number(fd.get("target_amount")) : null,
      color: fd.get("color"),
    };
    try {
      if (isEdit) {
        await api.put(`/finance/savings-boxes/${box.id}`, payload);
        toastSuccess("Caixinha atualizada");
      } else {
        await api.post("/finance/savings-boxes", payload);
        toastSuccess("Caixinha criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openSavingsEntryModal(box, mode, onSaved) {
  const isDeposit = mode === "deposit";
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="savings-entry-form" class="flex flex-col gap-4">
      <p class="text-sm text-text-mid">Saldo atual: <span class="tabular text-text-hi">${formatCurrency(box.balance)}</span></p>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Valor</label>
        <input name="amount" type="number" step="0.01" min="0.01" required class="input-glass w-full px-3 py-2 text-sm" placeholder="0,00" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Nota (opcional)</label>
        <input name="note" class="input-glass w-full px-3 py-2 text-sm" />
      </div>
      <div class="flex justify-end gap-2 mt-2">
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isDeposit ? "Depositar" : "Resgatar"}</button>
      </div>
    </form>
  `;
  openModal({ title: `${isDeposit ? "Depositar em" : "Resgatar de"} "${box.name}"`, bodyEl: body });

  body.querySelector("#savings-entry-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = Math.abs(Number(fd.get("amount")));
    try {
      await api.post(`/finance/savings-boxes/${box.id}/entries`, {
        amount: isDeposit ? amount : -amount,
        note: fd.get("note") || null,
        entry_date: todayStr(),
      });
      toastSuccess(isDeposit ? "Depositado" : "Resgatado");
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

// Relatório mensal: abre uma aba do navegador padrão (o Electron intercepta
// window.open e manda pro browser externo — ver setWindowOpenHandler em
// electron/main.js) com um HTML autocontido pronto pra Ctrl+P → Salvar PDF.
function openMonthlyReportModal() {
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="report-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Mês</label>
        <input name="month" type="month" required class="input-glass w-full px-3 py-2 text-sm" value="${todayStr().slice(0, 7)}" />
      </div>
      <p class="text-[11px] text-text-lo">Abre numa aba do navegador — use Ctrl+P e escolha "Salvar como PDF".</p>
      <div class="flex justify-end gap-2 mt-2">
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">Gerar relatório</button>
      </div>
    </form>
  `;
  openModal({ title: "Relatório mensal", bodyEl: body });

  body.querySelector("#report-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const month = new FormData(e.target).get("month");
    window.open(`${API_ORIGIN}/print/finance-report?month=${month}`, "_blank");
    closeModal();
  });
}

function monthBounds(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // dia 0 do mês seguinte = último dia deste
  return { from: `${monthStr}-01`, to: `${monthStr}-${String(lastDay).padStart(2, "0")}` };
}

// "Resetar" o mês: só apaga linhas de transactions. Não mexe no progresso de
// recorrentes/parceladas (ver comentário de bulkDeleteTransactions no
// controller) — uma recorrente que já gerou a transação desse mês não vai
// gerar de novo sozinha até o mês seguinte, mesmo depois desse apagão.
function openResetMonthModal(onDeleted) {
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="reset-month-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Mês</label>
        <input name="month" type="month" required class="input-glass w-full px-3 py-2 text-sm" value="${todayStr().slice(0, 7)}" />
      </div>
      <p class="text-[11px] text-text-lo">Apaga todas as transações lançadas nesse mês (inclusive as geradas por recorrentes e parceladas). Não dá pra desfazer.</p>
      <div class="flex justify-end gap-2 mt-2">
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">Continuar</button>
      </div>
    </form>
  `;
  openModal({ title: "Apagar transações do mês", bodyEl: body });

  body.querySelector("#reset-month-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const month = new FormData(e.target).get("month");
    const { from, to } = monthBounds(month);

    let count;
    try {
      const txs = await api.get(`/finance/transactions?from=${from}&to=${to}`);
      count = txs.length;
    } catch (err) {
      toastError(err.message);
      return;
    }
    if (!count) {
      toastError(`Nenhuma transação em ${monthShortLabel(month)}.`);
      return;
    }

    const ok = await confirmModal({
      title: "Apagar transações do mês",
      message: `Isso vai apagar ${count} transaç${count === 1 ? "ão" : "ões"} de ${monthShortLabel(month)} permanentemente. Não dá pra desfazer. Tem certeza?`,
      confirmLabel: `Apagar ${count} transaç${count === 1 ? "ão" : "ões"}`,
    });
    if (!ok) return;

    try {
      const res = await api.del(`/finance/transactions/bulk?month=${month}`);
      closeModal();
      toastSuccess(`${res.deleted} transaç${res.deleted === 1 ? "ão apagada" : "ões apagadas"}.`);
      onDeleted();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openAccountModal(account, onSaved) {
  const isEdit = !!account;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="account-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Nome</label>
        <input name="name" required class="input-glass w-full px-3 py-2 text-sm" value="${account?.name ?? ""}" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Tipo</label>
        <select name="type" class="input-glass w-full px-3 py-2 text-sm">
          <option value="bank" ${account?.type === "bank" ? "selected" : ""}>Banco</option>
          <option value="cash" ${account?.type === "cash" ? "selected" : ""}>Dinheiro</option>
          <option value="card" ${account?.type === "card" ? "selected" : ""}>Cartão</option>
          <option value="wallet" ${account?.type === "wallet" ? "selected" : ""}>Carteira digital</option>
        </select>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Saldo inicial</label>
        <input name="opening_balance" type="number" step="0.01" class="input-glass w-full px-3 py-2 text-sm" value="${account?.opening_balance ?? 0}" />
      </div>
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar conta"}</button>
      </div>
    </form>
  `;
  openModal({ title: isEdit ? "Editar conta" : "Nova conta", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Excluir conta", message: `Tem certeza que quer excluir "${account.name}"? As transações associadas também serão perdidas.`, confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/finance/accounts/${account.id}`);
        closeModal();
        onSaved();
        // as transações dessa conta já foram junto (é o que o aviso de
        // confirmação prometeu) — desfazer só recria a conta zerada.
        toastUndo(`"${account.name}" excluída`, async () => {
          try {
            await api.post("/finance/accounts", { name: account.name, type: account.type, opening_balance: account.opening_balance });
            toastSuccess("Restaurada");
            onSaved();
          } catch (err) {
            toastError(err.message);
          }
        });
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  body.querySelector("#account-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = { name: fd.get("name"), type: fd.get("type"), opening_balance: Number(fd.get("opening_balance")) };
    try {
      if (isEdit) {
        await api.put(`/finance/accounts/${account.id}`, payload);
        toastSuccess("Conta atualizada");
      } else {
        await api.post("/finance/accounts", payload);
        toastSuccess("Conta criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}
