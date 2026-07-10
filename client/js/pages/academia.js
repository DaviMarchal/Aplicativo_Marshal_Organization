import { api } from "../api.js";
import { toastSuccess, toastError, toastUndo } from "../components/toast.js";
import { openModal, closeModal, confirmModal } from "../components/modal.js";
import { emptyStateHtml, emptyState } from "../components/empty-state.js";
import { ICONS } from "../components/icons.js";
import { attachRipple } from "../components/card.js";
import { celebrate } from "../components/confetti.js";
import { revealOnScroll } from "../components/scroll-reveal.js";
import { themeToggleHtml } from "../app.js";
import { todayStr, DAY_LABELS_SHORT, dayOfWeek } from "../format.js";

export async function render(container, { setHeader, params: routeParams, isCurrent = () => true }) {
  container.innerHTML = `<div class="skeleton h-96 w-full"></div>`;

  setHeader(`
    <div class="flex items-center justify-between anim-stagger-in">
      <div>
        <h1 class="text-2xl font-semibold text-text-hi">Academia</h1>
        <p class="text-text-mid text-sm mt-1 font-label">Treinos e agenda semanal</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="new-exercise" type="button" class="btn-ghost px-4 py-2.5 text-sm">+ Exercício</button>
        <button id="new-plan" type="button" class="btn-accent px-4 py-2.5 text-sm">+ Novo plano</button>
        ${themeToggleHtml()}
      </div>
    </div>
  `);

  const [today, tomorrow, plans, exercises] = await Promise.all([
    api.get("/workouts/today").catch(() => []),
    api.get("/workouts/tomorrow").catch(() => []),
    api.get("/workouts/plans").catch(() => []),
    api.get("/workouts/exercises").catch(() => []),
  ]);
  if (!isCurrent()) return;

  document.getElementById("new-exercise").addEventListener("click", () => openExerciseModal(refresh));
  document.getElementById("new-plan").addEventListener("click", () => openPlanModal(null, exercises, refresh));
  attachRipple(document.getElementById("new-plan"));

  // deep-link da busca (⌘K): #/academia?open=3 abre direto o modal desse plano
  if (routeParams?.open) {
    const plan = plans.find((p) => String(p.id) === String(routeParams.open));
    if (plan) openPlanModal(plan, exercises, refresh);
  }

  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-6";

  // ---- Hoje / Amanhã ----
  const todayTomorrow = document.createElement("div");
  todayTomorrow.className = "grid grid-cols-1 md:grid-cols-2 gap-6 anim-stagger-in";
  todayTomorrow.appendChild(planTodayCard("Hoje", today, true, refresh));
  todayTomorrow.appendChild(planTodayCard("Amanhã", tomorrow, false, refresh));
  wrap.appendChild(todayTomorrow);

  // ---- Planos ----
  let plansGrid = null;
  const plansSection = document.createElement("div");
  plansSection.className = "anim-stagger-in";
  plansSection.innerHTML = `<h3 class="font-semibold text-text-hi mb-3">Planos de treino</h3>`;
  if (!plans.length) {
    plansSection.appendChild(
      emptyState({ icon: ICONS.academia, title: "Nenhum plano cadastrado", subtitle: "Monte seu primeiro plano de treino.", ctaLabel: "Criar plano", onCta: () => openPlanModal(null, exercises, refresh) })
    );
  } else {
    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4";
    plans.forEach((p) => grid.appendChild(planCard(p, exercises, refresh)));
    plansSection.appendChild(grid);
    plansGrid = grid;
  }
  wrap.appendChild(plansSection);

  // ---- Frequência (heatmap mensal + streak, por plano) ----
  let freqSection = null;
  if (plans.length) {
    freqSection = document.createElement("div");
    freqSection.className = "glass-card p-5 anim-stagger-in";
    freqSection.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <h3 class="font-semibold text-text-hi">Frequência</h3>
        ${
          plans.length > 1
            ? `<select id="freq-plan-select" class="input-glass px-3 py-1.5 text-xs">
                 ${plans.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}
               </select>`
            : ""
        }
      </div>
      <p id="freq-streak" class="text-sm text-text-mid mb-3"></p>
      <div id="freq-heatmap"></div>
    `;
    wrap.appendChild(freqSection);
  }

  // ---- Biblioteca de exercícios ----
  const exSection = document.createElement("div");
  exSection.className = "glass-card p-5 anim-stagger-in";
  exSection.innerHTML = `<h3 class="font-semibold text-text-hi mb-3">Biblioteca de exercícios</h3>`;
  if (!exercises.length) {
    exSection.insertAdjacentHTML("beforeend", emptyStateHtml({ icon: ICONS.academia, title: "Nenhum exercício cadastrado" }));
  } else {
    const byGroup = {};
    exercises.forEach((e) => (byGroup[e.muscle_group || "outros"] ||= []).push(e));
    const list = document.createElement("div");
    list.className = "flex flex-col gap-3";
    Object.entries(byGroup).forEach(([group, items]) => {
      const row = document.createElement("div");
      row.innerHTML = `
        <p class="font-label text-[10px] text-text-lo mb-1.5">${group}</p>
        <div class="flex flex-wrap gap-1.5">
          ${items.map((e) => `<span class="pill" style="background:var(--glass); color:var(--text-mid)">${e.name}</span>`).join("")}
        </div>
      `;
      list.appendChild(row);
    });
    exSection.appendChild(list);
  }
  wrap.appendChild(exSection);

  container.innerHTML = "";
  container.appendChild(wrap);
  if (plansGrid) revealOnScroll(plansGrid.children);

  if (freqSection) {
    loadFrequency(plans[0].id);
    freqSection.querySelector("#freq-plan-select")?.addEventListener("change", (e) => loadFrequency(e.target.value));
  }

  async function loadFrequency(planId) {
    const month = todayStr().slice(0, 7);
    try {
      const [history, streakRes] = await Promise.all([
        api.get(`/workouts/${planId}/history?month=${month}`),
        api.get(`/workouts/${planId}/streak`),
      ]);
      if (!isCurrent()) return;
      document.getElementById("freq-streak").textContent =
        streakRes.streak > 0 ? `🔥 ${streakRes.streak} dia${streakRes.streak === 1 ? " seguido" : "s seguidos"}` : "Sem streak ativo ainda";
      renderWorkoutHeatmap(document.getElementById("freq-heatmap"), history);
    } catch (err) {
      toastError(err.message);
    }
  }

  function refresh() {
    if (!isCurrent()) return;
    render(container, { setHeader, isCurrent });
  }
}

function renderWorkoutHeatmap(host, days) {
  if (!days.length) {
    host.innerHTML = emptyStateHtml({ icon: ICONS.calendar, title: "Sem dados ainda" });
    return;
  }
  const firstDow = dayOfWeek(days[0].date);
  const today = todayStr();
  host.innerHTML = `
    <div class="grid grid-cols-7 gap-1.5 mb-2">
      ${DAY_LABELS_SHORT.map((d) => `<div class="text-center text-[10px] text-text-lo font-label">${d}</div>`).join("")}
    </div>
    <div class="grid grid-cols-7 gap-1.5">
      ${Array.from({ length: firstDow }).map(() => `<div></div>`).join("")}
      ${days
        .map((d) => {
          const isFuture = d.date > today;
          let bg = "var(--glass)";
          let label = d.date;
          if (!isFuture && d.scheduled) {
            bg = d.completed ? "rgba(52,211,153,0.75)" : "rgba(244,63,94,0.18)";
            label += d.completed ? ": concluído" : ": não concluído";
          } else if (d.scheduled) {
            label += ": agendado";
          }
          return `<div title="${label}" class="aspect-square rounded-md" style="background:${bg}"></div>`;
        })
        .join("")}
    </div>
  `;
}

function planTodayCard(label, plans, allowLog, onChange) {
  const card = document.createElement("div");
  card.className = "glass-card p-5 flex flex-col gap-3";
  card.innerHTML = `<h3 class="font-semibold text-text-hi mb-1">${label}</h3>`;
  if (!plans.length) {
    card.insertAdjacentHTML("beforeend", emptyStateHtml({ icon: ICONS.moon, title: "Dia de descanso", subtitle: "Nenhum treino agendado." }));
    return card;
  }
  plans.forEach((p) => {
    const block = document.createElement("div");
    block.className = "glow-icon rounded-2xl p-4 flex flex-col gap-2";
    block.style.background = "linear-gradient(160deg, rgba(35,101,255,.18), rgba(35,101,255,.04))";
    block.innerHTML = `
      <span class="font-label text-[11px] text-blue-soft">Plano</span>
      <span class="text-lg font-semibold text-text-hi">${p.name}</span>
      <div class="flex flex-wrap gap-1.5">${p.exercises.map((e) => `<span class="pill" style="background:rgba(255,255,255,0.08); color:var(--text-mid)">${e.exercise_name}</span>`).join("")}</div>
      ${
        allowLog
          ? `<button data-log type="button" class="btn-accent mt-2 py-2 text-sm ${p.done ? "opacity-60 pointer-events-none" : ""}">${p.done ? "✓ Concluído hoje" : "Marcar como feito"}</button>`
          : `<span class="text-xs text-text-mid mt-2">${p.done ? "✓ Já concluído" : "Agendado"}</span>`
      }
    `;
    if (allowLog && !p.done) {
      block.querySelector("[data-log]").addEventListener("click", () => openLogModal(p, onChange));
    }
    card.appendChild(block);
  });
  return card;
}

function planCard(plan, exercises, onChange) {
  const card = document.createElement("div");
  card.className = "glass-card card-hover p-4 flex flex-col gap-2 cursor-pointer";
  const daysLabel = (plan.days || []).map((d) => DAY_LABELS_SHORT[d]).join(" · ") || "Sem dias definidos";
  card.innerHTML = `
    <p class="text-text-hi font-medium">${plan.name}</p>
    <p class="text-[11px] text-text-lo font-label">${daysLabel}</p>
    <div class="flex flex-wrap gap-1.5 mt-1">${plan.exercises.slice(0, 4).map((e) => `<span class="pill" style="background:var(--glass); color:var(--text-mid)">${e.exercise_name}</span>`).join("")}${plan.exercises.length > 4 ? `<span class="pill" style="background:var(--glass); color:var(--text-mid)">+${plan.exercises.length - 4}</span>` : ""}</div>
    <div class="flex gap-2 mt-2">
      <button data-edit type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg flex-1">Editar</button>
      <button data-delete type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg text-negative">Excluir</button>
    </div>
  `;
  card.querySelector("[data-edit]").addEventListener("click", () => openPlanModal(plan, exercises, onChange));
  card.querySelector("[data-delete]").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await confirmModal({ title: "Excluir plano", message: `Tem certeza que quer excluir "${plan.name}"? O histórico de treinos também será perdido.`, confirmLabel: "Excluir" });
    if (!ok) return;
    try {
      await api.del(`/workouts/plans/${plan.id}`);
      onChange();
      toastUndo(`"${plan.name}" excluído`, () => restorePlan(plan, onChange));
    } catch (err) {
      toastError(err.message);
    }
  });
  return card;
}

// perde o histórico de logs (workout_logs não é reconstruível pela API
// pública) mas devolve o plano com os exercícios e a agenda.
async function restorePlan(plan, onDone) {
  try {
    await api.post("/workouts/plans", {
      name: plan.name,
      notes: plan.notes,
      days: plan.days || [],
      exercises: (plan.exercises || []).map((e) => ({ exercise_id: e.exercise_id, sets: e.sets, reps: e.reps, weight: e.weight })),
    });
    toastSuccess("Restaurado");
    onDone();
  } catch (err) {
    toastError(err.message);
  }
}

function openLogModal(plan, onSaved) {
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="log-form" class="flex flex-col gap-4">
      <p class="text-sm text-text-mid">Registrar conclusão de <strong class="text-text-hi">${plan.name}</strong> hoje.</p>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Observações (opcional)</label>
        <textarea name="notes" rows="2" class="input-glass w-full px-3 py-2 text-sm"></textarea>
      </div>
      <div class="flex justify-end gap-2 mt-2">
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">Concluir treino</button>
      </div>
    </form>
  `;
  openModal({ title: "Concluir treino", bodyEl: body });
  body.querySelector("#log-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await api.post(`/workouts/${plan.id}/log`, { date: todayStr(), completed: true, notes: fd.get("notes") || null });
      toastSuccess("Treino registrado ✓");
      if (res.streak && res.streak % 7 === 0) celebrate();
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openExerciseModal(onSaved) {
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="exercise-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Nome</label>
        <input name="name" required class="input-glass w-full px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Grupo muscular</label>
        <input name="muscle_group" class="input-glass w-full px-3 py-2 text-sm" placeholder="peito, costas, perna..." />
      </div>
      <div class="flex justify-end gap-2 mt-2">
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">Adicionar</button>
      </div>
    </form>
  `;
  openModal({ title: "Novo exercício", bodyEl: body });
  body.querySelector("#exercise-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post("/workouts/exercises", { name: fd.get("name"), muscle_group: fd.get("muscle_group") || null });
      toastSuccess("Exercício adicionado");
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openPlanModal(plan, exercises, onSaved) {
  const isEdit = !!plan;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="plan-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Nome do plano</label>
        <input name="name" required class="input-glass w-full px-3 py-2 text-sm" value="${plan?.name ?? ""}" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Notas</label>
        <textarea name="notes" rows="2" class="input-glass w-full px-3 py-2 text-sm">${plan?.notes ?? ""}</textarea>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-2">Dias da semana</label>
        <div id="day-picker" class="flex gap-1.5">
          ${DAY_LABELS_SHORT.map(
            (label, i) => `
            <button type="button" data-day="${i}" class="day-btn w-9 h-9 rounded-full text-xs font-medium border transition-colors"
                    style="border-color:var(--stroke); ${plan?.days?.includes(i) ? "background:var(--accent); color:#150900; border-color:var(--accent);" : "color:var(--text-mid)"}">
              ${label[0]}
            </button>`
          ).join("")}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="font-label text-[11px] text-text-mid">Exercícios</label>
          <button type="button" id="add-exercise-row" class="btn-ghost px-3 py-1 text-xs rounded-lg">+ Adicionar</button>
        </div>
        <div id="exercise-rows" class="flex flex-col gap-2"></div>
      </div>
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar plano"}</button>
      </div>
    </form>
  `;

  const selectedDays = new Set(plan?.days ?? []);
  body.querySelectorAll(".day-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const day = Number(btn.dataset.day);
      if (selectedDays.has(day)) {
        selectedDays.delete(day);
        btn.style.background = "";
        btn.style.color = "var(--text-mid)";
        btn.style.borderColor = "var(--stroke)";
      } else {
        selectedDays.add(day);
        btn.style.background = "var(--accent)";
        btn.style.color = "#150900";
        btn.style.borderColor = "var(--accent)";
      }
    });
  });

  const rowsHost = body.querySelector("#exercise-rows");
  function addExerciseRow(data = {}) {
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    row.innerHTML = `
      <select data-ex class="input-glass px-2 py-2 text-xs flex-[2]">
        ${exercises.map((e) => `<option value="${e.id}" ${data.exercise_id === e.id ? "selected" : ""}>${e.name}</option>`).join("")}
      </select>
      <input data-sets type="number" min="1" placeholder="séries" class="input-glass px-2 py-2 text-xs w-16" value="${data.sets ?? 3}" />
      <input data-reps placeholder="reps" class="input-glass px-2 py-2 text-xs w-16" value="${data.reps ?? "10"}" />
      <input data-weight placeholder="carga" class="input-glass px-2 py-2 text-xs w-16" value="${data.weight ?? ""}" />
      <button type="button" data-remove class="btn-ghost w-8 h-8 rounded-lg text-xs text-negative shrink-0">✕</button>
    `;
    row.querySelector("[data-remove]").addEventListener("click", () => row.remove());
    rowsHost.appendChild(row);
  }
  (plan?.exercises || []).forEach((e) => addExerciseRow(e));
  if (!plan?.exercises?.length && exercises.length) addExerciseRow();

  body.querySelector("#add-exercise-row").addEventListener("click", () => {
    if (!exercises.length) {
      toastError("Cadastre um exercício na biblioteca primeiro.");
      return;
    }
    addExerciseRow();
  });

  openModal({ title: isEdit ? "Editar plano" : "Novo plano de treino", bodyEl: body, widthClass: "max-w-2xl" });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Excluir plano", message: `Tem certeza que quer excluir "${plan.name}"? O histórico de treinos também será perdido.`, confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/workouts/plans/${plan.id}`);
        closeModal();
        onSaved();
        toastUndo(`"${plan.name}" excluído`, () => restorePlan(plan, onSaved));
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  body.querySelector("#plan-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const exerciseRows = Array.from(rowsHost.children).map((row) => ({
      exercise_id: Number(row.querySelector("[data-ex]").value),
      sets: Number(row.querySelector("[data-sets]").value) || 3,
      reps: row.querySelector("[data-reps]").value || "10",
      weight: row.querySelector("[data-weight]").value || null,
    }));
    const payload = {
      name: fd.get("name"),
      notes: fd.get("notes") || null,
      days: Array.from(selectedDays),
      exercises: exerciseRows,
    };
    try {
      if (isEdit) {
        await api.put(`/workouts/plans/${plan.id}`, payload);
        toastSuccess("Plano atualizado");
      } else {
        await api.post("/workouts/plans", payload);
        toastSuccess("Plano criado");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}
