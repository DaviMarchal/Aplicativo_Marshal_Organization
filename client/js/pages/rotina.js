import { api } from "../api.js";
import { toastSuccess, toastError, toastUndo } from "../components/toast.js";
import { openModal, closeModal, confirmModal } from "../components/modal.js";
import { emptyStateHtml } from "../components/empty-state.js";
import { ICONS } from "../components/icons.js";
import { attachRipple } from "../components/card.js";
import { revealOnScroll } from "../components/scroll-reveal.js";
import { themeToggleHtml } from "../app.js";
import { todayStr, formatDateLong, DAY_LABELS_SHORT, dayOfWeek } from "../format.js";

// perde o histórico de conclusões (task_completions não é reconstruível pela
// API pública) mas devolve a rotina em si — melhor que nada.
async function restoreRoutine(task, onDone) {
  try {
    await api.post("/tasks", {
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      is_routine: true,
      time_of_day: task.time_of_day,
      days: task.days || [],
      color: task.color,
      category: task.category,
    });
    toastSuccess("Restaurada");
    onDone();
  } catch (err) {
    toastError(err.message);
  }
}

export async function render(container, { setHeader, params: routeParams, isCurrent = () => true }) {
  container.innerHTML = `<div class="skeleton h-64 w-full"></div>`;

  const [today, all] = await Promise.all([
    api.get("/routines/today").catch(() => []),
    api.get("/tasks?is_routine=1").catch(() => []),
  ]);
  if (!isCurrent()) return;

  // deep-link da busca (⌘K): #/rotina?open=3 abre direto o modal dessa rotina
  if (routeParams?.open) {
    const routine = all.find((t) => String(t.id) === String(routeParams.open));
    if (routine) openRoutineModal(routine, () => render(container, { setHeader, isCurrent }));
  }

  const doneCount = today.filter((t) => t.done).length;
  setHeader(`
    <div class="flex items-center justify-between anim-stagger-in">
      <div>
        <h1 class="text-2xl font-semibold text-text-hi">Rotina</h1>
        <p class="text-text-mid text-sm mt-1 font-label">${formatDateLong(todayStr())} · ${doneCount}/${today.length} concluídas hoje</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="new-routine" type="button" class="btn-accent px-4 py-2.5 text-sm">+ Nova rotina</button>
        ${themeToggleHtml()}
      </div>
    </div>
  `);
  document.getElementById("new-routine").addEventListener("click", () => openRoutineModal(null, refresh));
  attachRipple(document.getElementById("new-routine"));

  // ação rápida do ⌘K: #/rotina?new=1 abre direto o modal de criação
  if (routeParams?.new === "1") document.getElementById("new-routine").click();

  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-6";

  // ---- Hoje ----
  const todaySection = document.createElement("div");
  todaySection.className = "glass-card p-5 anim-stagger-in";
  todaySection.innerHTML = `<h3 class="font-semibold text-text-hi mb-3">Hoje</h3>`;
  if (!today.length) {
    todaySection.insertAdjacentHTML(
      "beforeend",
      emptyStateHtml({ icon: ICONS.rotina, title: "Nenhuma rotina hoje", subtitle: "Crie uma rotina pra começar a construir consistência." })
    );
  } else {
    const list = document.createElement("div");
    list.className = "flex flex-col gap-2";
    today.forEach((t) => list.appendChild(routineRow(t)));
    todaySection.appendChild(list);
  }
  wrap.appendChild(todaySection);

  // ---- Heatmap do mês ----
  const heatmapSection = document.createElement("div");
  heatmapSection.className = "glass-card p-5 anim-stagger-in";
  heatmapSection.innerHTML = `<h3 class="font-semibold text-text-hi mb-3">Consistência do mês</h3><div id="heatmap-grid"></div>`;
  wrap.appendChild(heatmapSection);

  // ---- Todas as rotinas ----
  const listSection = document.createElement("div");
  listSection.className = "glass-card p-5 anim-stagger-in";
  listSection.innerHTML = `<h3 class="font-semibold text-text-hi mb-3">Todas as rotinas</h3>`;
  let manageList = null;
  if (!all.length) {
    listSection.insertAdjacentHTML(
      "beforeend",
      emptyStateHtml({ icon: ICONS.sparkle, title: "Nenhuma rotina cadastrada", subtitle: "Comece criando sua primeira rotina recorrente." })
    );
  } else {
    manageList = document.createElement("div");
    manageList.className = "flex flex-col gap-2";
    all.forEach((t) => manageList.appendChild(routineManageRow(t, refresh)));
    listSection.appendChild(manageList);
  }
  wrap.appendChild(listSection);

  container.innerHTML = "";
  container.appendChild(wrap);
  if (manageList) revealOnScroll(manageList.children);

  loadHeatmap();

  async function loadHeatmap() {
    const month = todayStr().slice(0, 7);
    try {
      const days = await api.get(`/routines/heatmap?month=${month}`);
      if (!isCurrent()) return;
      renderHeatmap(document.getElementById("heatmap-grid"), days);
    } catch (err) {
      if (!isCurrent()) return;
      document.getElementById("heatmap-grid").innerHTML = `<p class="text-text-mid text-sm">Não foi possível carregar o heatmap.</p>`;
    }
  }

  function refresh() {
    if (!isCurrent()) return;
    render(container, { setHeader, isCurrent });
  }
}

function renderHeatmap(host, days) {
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
          // dias futuros ainda não têm como ter sido concluídos — não é "falha", é neutro
          const isFuture = d.date > today;
          const ratio = !isFuture && d.scheduled > 0 ? d.completed / d.scheduled : null;
          const bg =
            isFuture || ratio === null
              ? "var(--glass)"
              : ratio === 0
              ? "rgba(244,63,94,0.18)"
              : ratio < 1
              ? "rgba(255,122,0,0.35)"
              : "rgba(52,211,153,0.75)";
          return `<div title="${d.date}: ${isFuture ? "ainda não chegou" : `${d.completed}/${d.scheduled}`}" class="aspect-square rounded-md" style="background:${bg}"></div>`;
        })
        .join("")}
    </div>
  `;
}

function routineRow(task) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 px-3 py-2.5 rounded-xl card-hover";
  row.style.background = "var(--glass)";
  row.innerHTML = `
    <button type="button" data-toggle class="shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center"
            style="border-color:${task.done ? "var(--green)" : "var(--stroke)"}; background:${task.done ? "var(--green)" : "transparent"}">
      ${task.done ? checkSvg() : ""}
    </button>
    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${task.color}"></span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text-hi truncate">${task.title}</p>
      <p data-meta class="text-[11px] text-text-lo font-label">${task.category || ""}${task.time_of_day ? ` · ${task.time_of_day.slice(0, 5)}` : ""}${task.streak ? ` · 🔥 ${task.streak}d` : ""}</p>
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
      row.querySelector("[data-meta]").textContent = `${task.category || ""}${task.time_of_day ? ` · ${task.time_of_day.slice(0, 5)}` : ""}${task.streak ? ` · 🔥 ${task.streak}d` : ""}`;
      toastSuccess(task.done ? "Rotina concluída ✓" : "Marcação removida");
    } catch (err) {
      toastError(err.message);
    }
  });
  return row;
}

function routineManageRow(task, onChange) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 px-3 py-2.5 rounded-xl card-hover";
  row.style.background = "var(--glass)";
  const daysLabel = (task.days || []).map((d) => DAY_LABELS_SHORT[d]).join(" · ") || "Sem dias definidos";
  row.innerHTML = `
    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${task.color}"></span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text-hi truncate">${task.title}</p>
      <p class="text-[11px] text-text-lo font-label">${daysLabel}</p>
    </div>
    <button type="button" data-edit class="btn-ghost px-3 py-1.5 text-xs rounded-lg">Editar</button>
    <button type="button" data-delete class="btn-ghost px-3 py-1.5 text-xs rounded-lg text-negative">Excluir</button>
  `;
  row.querySelector("[data-edit]").addEventListener("click", () => openRoutineModal(task, onChange));
  row.querySelector("[data-delete]").addEventListener("click", async () => {
    const ok = await confirmModal({ title: "Excluir rotina", message: `Tem certeza que quer excluir "${task.title}"? O histórico de conclusões também será perdido.`, confirmLabel: "Excluir" });
    if (!ok) return;
    try {
      await api.del(`/tasks/${task.id}`);
      onChange();
      toastUndo(`"${task.title}" excluída`, () => restoreRoutine(task, onChange));
    } catch (err) {
      toastError(err.message);
    }
  });
  return row;
}

function openRoutineModal(task, onSaved) {
  const isEdit = !!task;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="routine-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Título</label>
        <input name="title" required class="input-glass w-full px-3 py-2 text-sm" value="${task?.title ?? ""}" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Descrição</label>
        <textarea name="description" rows="2" class="input-glass w-full px-3 py-2 text-sm">${task?.description ?? ""}</textarea>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Horário (opcional)</label>
          <input name="time_of_day" type="time" class="input-glass w-full px-3 py-2 text-sm" value="${task?.time_of_day?.slice(0, 5) ?? ""}" />
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Categoria</label>
          <input name="category" class="input-glass w-full px-3 py-2 text-sm" value="${task?.category ?? ""}" placeholder="saúde, estudo..." />
        </div>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Cor</label>
        <input name="color" type="color" class="h-9 w-16 bg-transparent" value="${task?.color ?? "#FF7A00"}" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-2">Dias da semana</label>
        <div id="day-picker" class="flex gap-1.5">
          ${DAY_LABELS_SHORT.map(
            (label, i) => `
            <button type="button" data-day="${i}" class="day-btn w-9 h-9 rounded-full text-xs font-medium border transition-colors"
                    style="border-color:var(--stroke); ${task?.days?.includes(i) ? "background:var(--accent); color:#150900; border-color:var(--accent);" : "color:var(--text-mid)"}">
              ${label[0]}
            </button>`
          ).join("")}
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar alterações" : "Criar rotina"}</button>
      </div>
    </form>
  `;

  const selectedDays = new Set(task?.days ?? []);
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

  openModal({ title: isEdit ? "Editar rotina" : "Nova rotina", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Excluir rotina", message: `Tem certeza que quer excluir "${task.title}"? O histórico de conclusões também será perdido.`, confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/tasks/${task.id}`);
        closeModal();
        onSaved();
        toastUndo(`"${task.title}" excluída`, () => restoreRoutine(task, onSaved));
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  body.querySelector("#routine-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (selectedDays.size === 0) {
      toastError("Selecione ao menos um dia da semana.");
      return;
    }
    const payload = {
      title: fd.get("title"),
      description: fd.get("description") || null,
      time_of_day: fd.get("time_of_day") || null,
      category: fd.get("category") || null,
      color: fd.get("color"),
      is_routine: true,
      days: Array.from(selectedDays),
      priority: task?.priority ?? "medium",
      status: task?.status ?? "todo",
    };
    try {
      if (isEdit) {
        await api.put(`/tasks/${task.id}`, payload);
        toastSuccess("Rotina atualizada");
      } else {
        await api.post("/tasks", payload);
        toastSuccess("Rotina criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function checkSvg() {
  return `<svg class="check-draw" width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5L9.5 18L20 6" stroke="#0a0a0b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
