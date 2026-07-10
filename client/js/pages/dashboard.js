import { api } from "../api.js";
import { kpiCard, attachRipple } from "../components/card.js";
import { barChartWeek } from "../components/chart-helpers.js";
import { progressRing } from "../components/progress-ring.js";
import { toastSuccess, toastError } from "../components/toast.js";
import { emptyStateHtml } from "../components/empty-state.js";
import { ICONS } from "../components/icons.js";
import { skeletonGrid } from "../components/skeleton.js";
import { greeting, formatDateLong, weekdayLabel, todayStr } from "../format.js";
import { themeToggleHtml } from "../app.js";

export async function render(container, { setHeader, isCurrent = () => true }) {
  container.innerHTML = skeletonGrid(4) + `<div class="mt-6">${skeletonGrid(2)}</div>`;

  let data;
  try {
    data = await api.get("/dashboard");
  } catch (err) {
    if (!isCurrent()) return;
    container.innerHTML = `<div class="glass-card p-8 text-center text-text-mid">${err.message}</div>`;
    return;
  }
  if (!isCurrent()) return;

  setHeader(`
    <div class="flex items-center justify-between anim-stagger-in">
      <div>
        <h1 class="text-3xl font-semibold text-text-hi">${greeting()}, ${data.user_name}</h1>
        <p class="text-text-mid text-sm mt-1 font-label">${formatDateLong(data.date)}</p>
      </div>
      ${themeToggleHtml()}
    </div>
  `);

  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-6";

  // ---- KPIs ----
  const kpiRow = document.createElement("div");
  kpiRow.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 anim-stagger-in";
  kpiRow.appendChild(
    kpiCard({ label: "Saldo do mês", value: data.kpis.saldo_mes, prefix: "R$ ", decimals: 2, icon: ICONS.wallet })
  );
  kpiRow.appendChild(
    kpiCard({ label: "Tasks pendentes hoje", value: data.kpis.tasks_pendentes_hoje, icon: ICONS.tasks })
  );
  kpiRow.appendChild(
    kpiCard({ label: "Rotina concluída hoje", value: data.kpis.rotina_percent_hoje, suffix: "%", icon: ICONS.rotina })
  );
  kpiRow.appendChild(
    kpiCard({
      label: "Dias restantes da meta",
      value: data.kpis.meta_dias_restantes ?? 0,
      suffix: data.kpis.meta_dias_restantes === null ? "" : " dias",
      icon: ICONS.metas,
    })
  );
  wrap.appendChild(kpiRow);

  // ---- Grid principal: rotina + treino | gráfico + meta ----
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 lg:grid-cols-3 gap-6 anim-stagger-in";

  // Rotina de hoje
  const routineCard = document.createElement("div");
  routineCard.className = "glass-card p-5 lg:col-span-1 flex flex-col gap-3";
  routineCard.innerHTML = `<h3 class="font-semibold text-text-hi mb-1">Rotina de hoje</h3>`;
  if (!data.routine_today.length) {
    routineCard.insertAdjacentHTML(
      "beforeend",
      emptyStateHtml({ icon: ICONS.rotina, title: "Nada agendado", subtitle: "Nenhuma rotina pra hoje." })
    );
  } else {
    const list = document.createElement("div");
    list.className = "flex flex-col gap-2";
    data.routine_today.forEach((t) => list.appendChild(routineRow(t)));
    routineCard.appendChild(list);
  }
  grid.appendChild(routineCard);

  // Treino de hoje
  const workoutCard = document.createElement("div");
  workoutCard.className = "glass-card p-5 lg:col-span-1 flex flex-col gap-3";
  if (data.workout_today) {
    workoutCard.innerHTML = `
      <h3 class="font-semibold text-text-hi mb-1">Treino de hoje</h3>
      <div class="glow-icon rounded-2xl p-4 flex flex-col gap-3" style="background:linear-gradient(160deg, rgba(35,101,255,.18), rgba(35,101,255,.04));">
        <span class="font-label text-[11px] text-blue-soft">Plano agendado</span>
        <span class="text-xl font-semibold text-text-hi">${data.workout_today.name}</span>
        <span class="text-sm ${data.workout_today.done ? "text-positive" : "text-text-mid"}">${
      data.workout_today.done ? "✓ Concluído hoje" : "Ainda não concluído"
    }</span>
      </div>
      <a href="#/academia" class="btn-ghost text-center text-sm py-2.5 rounded-xl">Ver treino</a>
    `;
  } else {
    workoutCard.innerHTML = `<h3 class="font-semibold text-text-hi mb-1">Treino de hoje</h3>` +
      emptyStateHtml({ icon: ICONS.academia, title: "Dia de descanso", subtitle: "Nenhum treino agendado pra hoje." });
  }
  grid.appendChild(workoutCard);

  // Meta ativa
  const goalCard = document.createElement("div");
  goalCard.className = "glass-card p-5 lg:col-span-1 flex flex-col items-center gap-3 text-center";
  if (data.active_goal) {
    goalCard.innerHTML = `<h3 class="font-semibold text-text-hi self-start mb-1">Meta ativa</h3>`;
    goalCard.appendChild(
      progressRing({ percent: data.active_goal.percent, size: 140, label: `${data.active_goal.remaining_days}d restantes` })
    );
    const title = document.createElement("p");
    title.className = "text-sm text-text-hi font-medium";
    title.textContent = data.active_goal.title;
    goalCard.appendChild(title);
    const link = document.createElement("a");
    link.href = "#/metas";
    link.className = "btn-ghost text-center text-sm py-2 px-4 rounded-xl w-full";
    link.textContent = "Ver meta";
    goalCard.appendChild(link);
  } else {
    goalCard.innerHTML =
      `<h3 class="font-semibold text-text-hi self-start mb-1">Meta ativa</h3>` +
      emptyStateHtml({ icon: ICONS.metas, title: "Nenhuma meta ativa", subtitle: "Crie uma meta de 6 meses pra começar." });
  }
  grid.appendChild(goalCard);

  wrap.appendChild(grid);

  // ---- Mini gráfico de gastos da semana ----
  const chartCard = document.createElement("div");
  chartCard.className = "glass-card p-5 anim-stagger-in";
  chartCard.innerHTML = `
    <h3 class="font-semibold text-text-hi mb-4">Gastos da semana</h3>
    <div class="h-56"><canvas id="week-expenses-chart"></canvas></div>
  `;
  wrap.appendChild(chartCard);

  container.innerHTML = "";
  container.appendChild(wrap);

  const todayIndex = data.week_expenses.findIndex((d) => d.isToday);
  barChartWeek(document.getElementById("week-expenses-chart"), {
    labels: data.week_expenses.map((d) => weekdayLabel(d.date, true)),
    data: data.week_expenses.map((d) => d.total),
    activeIndex: todayIndex,
  });

  container.querySelectorAll(".btn-ghost, .btn-accent").forEach(attachRipple);
}

function routineRow(task) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 px-3 py-2.5 rounded-xl card-hover";
  row.style.background = "var(--glass)";
  row.innerHTML = `
    <button type="button" data-toggle class="shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors"
            style="border-color:${task.done ? "var(--green)" : "var(--stroke)"}; background:${task.done ? "var(--green)" : "transparent"}">
      ${task.done ? checkSvg() : ""}
    </button>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text-hi truncate">${task.title}</p>
      <p data-meta class="text-[11px] text-text-lo font-label">${task.category || ""}${task.streak ? ` · 🔥 ${task.streak}d` : ""}</p>
    </div>
  `;
  row.querySelector("[data-toggle]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      const res = await api.post(`/tasks/${task.id}/toggle`, { date: todayStr() });
      task.done = res.completed;
      task.streak = res.streak;
      btn.style.borderColor = task.done ? "var(--green)" : "var(--stroke)";
      btn.style.background = task.done ? "var(--green)" : "transparent";
      btn.innerHTML = task.done ? checkSvg() : "";
      row.querySelector("[data-meta]").textContent = `${task.category || ""}${task.streak ? ` · 🔥 ${task.streak}d` : ""}`;
      toastSuccess(task.done ? "Rotina concluída ✓" : "Marcação removida");
    } catch (err) {
      toastError(err.message);
    }
  });
  return row;
}

function checkSvg() {
  return `<svg class="check-draw" width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5L9.5 18L20 6" stroke="#0a0a0b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
