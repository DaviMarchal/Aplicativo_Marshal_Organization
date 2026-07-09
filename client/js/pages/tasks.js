import { api } from "../api.js";
import { toastSuccess, toastError, toastUndo } from "../components/toast.js";
import { openModal, closeModal, confirmModal } from "../components/modal.js";
import { emptyStateHtml } from "../components/empty-state.js";
import { ICONS } from "../components/icons.js";
import { attachRipple } from "../components/card.js";
import { themeToggleHtml } from "../app.js";
import { DAY_LABELS_SHORT } from "../format.js";

const COLUMNS = [
  { status: "todo", label: "A Fazer" },
  { status: "in_progress", label: "Em Progresso" },
  { status: "in_review", label: "Em Revisão" },
  { status: "done", label: "Concluído" },
];

const PRIORITY_LABEL = { high: "Alta", medium: "Média", low: "Baixa" };

let state = { search: "", priority: "", tag: "", view: "board" };
let searchDebounce = null;

export async function render(container, { setHeader, params: routeParams }) {
  container.innerHTML = `<div class="skeleton h-96 w-full"></div>`;

  // busca todas as tasks (sem filtro) só pra montar a lista de tags disponíveis
  const allTasksForTags = await api.get("/tasks").catch(() => []);
  const allTags = [...new Set(allTasksForTags.flatMap((t) => t.tags || []))].sort();
  if (state.tag && !allTags.includes(state.tag)) state.tag = "";

  setHeader(`
    <div class="flex flex-col gap-4 anim-stagger-in">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-text-hi">Tasks</h1>
          <p id="tasks-count" class="text-text-mid text-sm mt-1 font-label"></p>
        </div>
        <div class="flex items-center gap-2">
          <button id="new-task" type="button" class="btn-accent px-4 py-2.5 text-sm">+ Nova task</button>
          ${themeToggleHtml()}
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <input id="search-input" type="text" placeholder="Buscar tasks..." class="input-glass px-3 py-2 text-sm w-56" value="${state.search}" />
        <select id="priority-filter" class="input-glass px-3 py-2 text-sm">
          <option value="">Toda prioridade</option>
          <option value="high" ${state.priority === "high" ? "selected" : ""}>Alta</option>
          <option value="medium" ${state.priority === "medium" ? "selected" : ""}>Média</option>
          <option value="low" ${state.priority === "low" ? "selected" : ""}>Baixa</option>
        </select>
        ${
          allTags.length
            ? `<select id="tag-filter" class="input-glass px-3 py-2 text-sm">
                 <option value="">Toda tag</option>
                 ${allTags.map((t) => `<option value="${t}" ${state.tag === t ? "selected" : ""}>#${t}</option>`).join("")}
               </select>`
            : ""
        }
        <div class="ml-auto flex items-center gap-1 glass-card p-1 rounded-full">
          <button data-view="board" type="button" class="view-btn px-3 py-1.5 text-xs rounded-full">Board</button>
          <button data-view="list" type="button" class="view-btn px-3 py-1.5 text-xs rounded-full">Lista</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById("new-task").addEventListener("click", () => openTaskModal(null, load));
  attachRipple(document.getElementById("new-task"));

  // ação rápida do ⌘K: #/tasks?new=1 abre direto o modal de criação
  if (routeParams?.new === "1") document.getElementById("new-task").click();

  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      state.search = value;
      load();
    }, 300);
  });
  document.getElementById("priority-filter").addEventListener("change", (e) => {
    state.priority = e.target.value;
    load();
  });
  document.getElementById("tag-filter")?.addEventListener("change", (e) => {
    state.tag = e.target.value;
    load();
  });
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      load();
    });
  });

  await load();

  // deep-link da busca (⌘K): #/tasks?open=42 abre direto o modal dessa task
  if (routeParams?.open) {
    try {
      const task = await api.get(`/tasks/${routeParams.open}`);
      openTaskModal(task, load);
    } catch {
      // task pode ter sido excluída entre a busca e o clique — ignora
    }
  }

  async function load() {
    updateViewButtons();
    let tasks, routinesToday, workoutsToday;
    try {
      const params = new URLSearchParams({ is_routine: "0" });
      if (state.search) params.set("search", state.search);
      if (state.priority) params.set("priority", state.priority);
      if (state.tag) params.set("tag", state.tag);
      [tasks, routinesToday, workoutsToday] = await Promise.all([
        api.get(`/tasks?${params.toString()}`),
        // rotina/treino de hoje entram como cards no Kanban (board) pra dar
        // pra marcar feito/não-feito arrastando, junto com as tasks de verdade
        state.view === "board" ? api.get("/routines/today") : [],
        state.view === "board" ? api.get("/workouts/today") : [],
      ]);
    } catch (err) {
      container.innerHTML = `<div class="glass-card p-8 text-center text-text-mid">${err.message}</div>`;
      return;
    }
    const recurringCount = routinesToday.length + workoutsToday.length;
    document.getElementById("tasks-count").textContent =
      `${tasks.length} task${tasks.length === 1 ? "" : "s"}` + (recurringCount ? ` · ${recurringCount} de hoje` : "");
    container.innerHTML = "";
    container.appendChild(
      state.view === "board" ? renderBoard(tasks, routinesToday, workoutsToday, load) : renderList(tasks, load)
    );
  }
}

function updateViewButtons() {
  document.querySelectorAll(".view-btn").forEach((btn) => {
    const active = btn.dataset.view === state.view;
    btn.style.background = active ? "var(--accent)" : "transparent";
    btn.style.color = active ? "#150900" : "var(--text-mid)";
  });
}

// Rotina e treino de hoje entram como cards arrastáveis também, livres pra
// circular pelas 4 colunas como qualquer task. Só existe estado persistido
// pra elas em duas colunas (A Fazer = não feito hoje, Concluído = feito
// hoje) — soltar em Em Progresso/Em Revisão é só um "estacionamento" visual
// da sessão atual; ao recarregar, elas voltam a cair em A Fazer ou
// Concluído de acordo com o que realmente foi marcado (ver onEnd abaixo).
function renderBoard(tasks, routinesToday, workoutsToday, onChange) {
  const board = document.createElement("div");
  board.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 anim-stagger-in";

  COLUMNS.forEach((col) => {
    const colTasks = tasks.filter((t) => t.status === col.status);
    const isDoneCol = col.status === "done";
    const isTodoCol = col.status === "todo";
    const colRoutines = isTodoCol ? routinesToday.filter((r) => !r.done) : isDoneCol ? routinesToday.filter((r) => r.done) : [];
    const colWorkouts = isTodoCol ? workoutsToday.filter((w) => !w.done) : isDoneCol ? workoutsToday.filter((w) => w.done) : [];
    const totalCount = colTasks.length + colRoutines.length + colWorkouts.length;

    const colEl = document.createElement("div");
    colEl.className = "glass-card p-3 flex flex-col gap-3 min-h-[200px]";
    colEl.innerHTML = `
      <div class="flex items-center justify-between px-1">
        <h3 class="font-label text-[11px] text-text-mid">${col.label}</h3>
        <span data-count class="font-label text-[11px] text-text-lo">${totalCount}</span>
      </div>
      <div class="task-column flex flex-col gap-2 min-h-[80px]" data-status="${col.status}"></div>
    `;
    const listEl = colEl.querySelector(".task-column");
    if (!totalCount) {
      listEl.innerHTML = `<div class="task-column-empty text-center text-text-lo text-xs py-6">Nenhuma task aqui</div>`;
    } else {
      colRoutines.forEach((r) =>
        listEl.appendChild(recurringCard({ id: r.id, type: "routine", title: r.title, subtitle: r.category, icon: ICONS.rotina }))
      );
      colWorkouts.forEach((w) =>
        listEl.appendChild(recurringCard({ id: w.id, type: "workout", title: w.name, subtitle: "Treino de hoje", icon: ICONS.academia }))
      );
      colTasks.forEach((t) => listEl.appendChild(taskCard(t, onChange)));
    }
    board.appendChild(colEl);
  });

  requestAnimationFrame(() => {
    board.querySelectorAll(".task-column").forEach((el) => {
      // eslint-disable-next-line no-undef
      Sortable.create(el, {
        group: "kanban",
        animation: 180,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        onEnd: async (evt) => {
          const type = evt.item.dataset.type;
          const id = evt.item.dataset.id;
          const movedColumn = evt.from !== evt.to;
          // pra rotina/treino, o que importa é cruzar a fronteira "Concluído" —
          // não a coluna exata (não existe "em progresso" persistido pra elas).
          const wasDone = evt.from.dataset.status === "done";
          const nowDone = evt.to.dataset.status === "done";
          const doneStateChanged = wasDone !== nowDone;

          try {
            if (type === "routine") {
              if (doneStateChanged) {
                await api.post(`/tasks/${id}/toggle`, {});
                toastSuccess(nowDone ? "Rotina concluída ✓" : "Marcação removida");
              }
            } else if (type === "workout") {
              if (doneStateChanged) {
                await api.post(`/workouts/${id}/log`, { completed: nowDone });
                toastSuccess(nowDone ? "Treino concluído ✓" : "Marcação removida");
              }
            } else {
              await api.patch(`/tasks/${id}/status`, { status: evt.to.dataset.status, sort_order: evt.newIndex });
              if (movedColumn) toastSuccess("Task atualizada");
            }
            updateColumnChrome(evt.from);
            if (movedColumn) updateColumnChrome(evt.to);
          } catch (err) {
            toastError(err.message);
            onChange();
          }
        },
      });
    });
  });

  return board;
}

function recurringCard({ id, type, title, subtitle, icon }) {
  const card = document.createElement("div");
  card.className = "glass-panel card-hover p-3.5 rounded-2xl cursor-grab flex flex-col gap-2";
  card.style.borderLeft = "3px solid var(--blue-soft)";
  card.dataset.id = id;
  card.dataset.type = type;
  card.innerHTML = `
    <span class="flex items-center gap-1.5 font-label text-[10px]" style="color:var(--blue-soft)">
      <span class="w-3 h-3 [&>svg]:w-full [&>svg]:h-full">${icon}</span>${type === "routine" ? "Rotina" : "Treino"}
    </span>
    <p class="text-sm text-text-hi font-medium leading-snug">${title}</p>
    ${subtitle ? `<p class="text-xs text-text-mid">${subtitle}</p>` : ""}
  `;
  card.addEventListener("click", () => {
    location.hash = type === "routine" ? "#/rotina" : "#/academia";
  });
  return card;
}

// Depois de um drag-and-drop bem-sucedido, o card já foi movido no DOM pelo
// SortableJS — mas o contador "N" do cabeçalho e o placeholder de coluna
// vazia ficam desatualizados até um refresh completo. Atualiza os dois.
function updateColumnChrome(columnEl) {
  const cards = columnEl.querySelectorAll("[data-id]");
  const count = cards.length;
  const countBadge = columnEl.parentElement.querySelector("[data-count]");
  if (countBadge) countBadge.textContent = String(count);

  const placeholder = columnEl.querySelector(".task-column-empty");
  if (count === 0 && !placeholder) {
    columnEl.innerHTML = `<div class="task-column-empty text-center text-text-lo text-xs py-6">Nenhuma task aqui</div>`;
  } else if (count > 0 && placeholder) {
    placeholder.remove();
  }
}

function taskCard(task, onChange) {
  const card = document.createElement("div");
  card.className = "glass-panel card-hover p-3.5 rounded-2xl cursor-grab flex flex-col gap-2";
  card.dataset.id = task.id;
  card.dataset.type = "task";
  card.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="pill pill-${task.priority}">${PRIORITY_LABEL[task.priority]}</span>
    </div>
    <p class="text-sm text-text-hi font-medium leading-snug">${task.title}</p>
    ${task.description ? `<p class="text-xs text-text-mid line-clamp-2">${task.description}</p>` : ""}
    <div class="flex items-center justify-between mt-1">
      <div class="flex gap-1 flex-wrap">
        ${(task.tags || []).slice(0, 3).map((t) => `<span class="pill" style="background:var(--glass); color:var(--text-mid)">#${t}</span>`).join("")}
      </div>
      ${task.due_date ? `<span class="font-label text-[10px] text-text-lo">${task.due_date.slice(5)}</span>` : ""}
    </div>
  `;
  card.addEventListener("click", () => openTaskModal(task, onChange));
  return card;
}

function renderList(tasks, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "glass-card p-2 anim-stagger-in";
  if (!tasks.length) {
    wrap.innerHTML = emptyStateHtml({ icon: ICONS.tasks, title: "Nenhuma task encontrada", subtitle: "Ajuste os filtros ou crie uma nova task." });
    return wrap;
  }
  const statusLabel = Object.fromEntries(COLUMNS.map((c) => [c.status, c.label]));
  tasks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3 px-3 py-3 rounded-xl card-hover cursor-pointer";
    row.innerHTML = `
      <span class="pill pill-${t.priority}">${PRIORITY_LABEL[t.priority]}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-text-hi truncate">${t.title}</p>
        <p class="text-[11px] text-text-lo font-label">${statusLabel[t.status]}${t.due_date ? ` · ${t.due_date.slice(5)}` : ""}</p>
      </div>
      <div class="flex gap-1">${(t.tags || []).slice(0, 3).map((tag) => `<span class="pill" style="background:var(--glass); color:var(--text-mid)">#${tag}</span>`).join("")}</div>
    `;
    row.addEventListener("click", () => openTaskModal(t, onChange));
    wrap.appendChild(row);
  });
  return wrap;
}

function openTaskModal(task, onSaved) {
  const isEdit = !!task;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="task-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Título</label>
        <input name="title" required class="input-glass w-full px-3 py-2 text-sm" value="${task?.title ?? ""}" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Descrição</label>
        <textarea name="description" rows="2" class="input-glass w-full px-3 py-2 text-sm">${task?.description ?? ""}</textarea>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Prioridade</label>
          <select name="priority" class="input-glass w-full px-3 py-2 text-sm">
            <option value="high" ${task?.priority === "high" ? "selected" : ""}>Alta</option>
            <option value="medium" ${!task || task?.priority === "medium" ? "selected" : ""}>Média</option>
            <option value="low" ${task?.priority === "low" ? "selected" : ""}>Baixa</option>
          </select>
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Status</label>
          <select name="status" class="input-glass w-full px-3 py-2 text-sm">
            ${COLUMNS.map((c) => `<option value="${c.status}" ${task?.status === c.status ? "selected" : ""}>${c.label}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Vencimento</label>
          <input name="due_date" type="date" class="input-glass w-full px-3 py-2 text-sm" value="${task?.due_date ?? ""}" />
        </div>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Tags (separadas por vírgula)</label>
        <input name="tags" class="input-glass w-full px-3 py-2 text-sm" value="${(task?.tags || []).join(", ")}" />
      </div>
      <label class="flex items-center gap-2 text-sm text-text-mid cursor-pointer">
        <input type="checkbox" name="is_routine" id="is-routine-check" ${task?.is_routine ? "checked" : ""} class="accent-[var(--accent)]" />
        É uma rotina? (aparece todo dia nos dias selecionados)
      </label>
      <div id="routine-fields" class="flex flex-col gap-3 ${task?.is_routine ? "" : "hidden"}">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Horário (opcional)</label>
          <input name="time_of_day" type="time" class="input-glass w-full px-3 py-2 text-sm" value="${task?.time_of_day?.slice(0, 5) ?? ""}" />
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
      </div>
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar alterações" : "Criar task"}</button>
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

  body.querySelector("#is-routine-check").addEventListener("change", (e) => {
    body.querySelector("#routine-fields").classList.toggle("hidden", !e.target.checked);
  });

  openModal({ title: isEdit ? "Editar task" : "Nova task", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Excluir task", message: `Tem certeza que quer excluir "${task.title}"?`, confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/tasks/${task.id}`);
        closeModal();
        onSaved();
        toastUndo(`"${task.title}" excluída`, async () => {
          try {
            await api.post("/tasks", {
              title: task.title,
              description: task.description,
              priority: task.priority,
              status: task.status,
              due_date: task.due_date,
              is_routine: !!task.is_routine,
              time_of_day: task.time_of_day,
              days: task.days || [],
              tags: task.tags || [],
              color: task.color,
              category: task.category,
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

  body.querySelector("#task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const isRoutine = fd.get("is_routine") === "on";
    if (isRoutine && selectedDays.size === 0) {
      toastError("Selecione ao menos um dia da semana para a rotina.");
      return;
    }
    const payload = {
      title: fd.get("title"),
      description: fd.get("description") || null,
      priority: fd.get("priority"),
      status: fd.get("status"),
      due_date: fd.get("due_date") || null,
      is_routine: isRoutine,
      time_of_day: isRoutine ? fd.get("time_of_day") || null : null,
      days: isRoutine ? Array.from(selectedDays) : [],
      tags: fd
        .get("tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      color: task?.color ?? "#FF7A00",
      category: task?.category ?? null,
    };
    try {
      if (isEdit) {
        await api.put(`/tasks/${task.id}`, payload);
        toastSuccess("Task atualizada");
      } else {
        await api.post("/tasks", payload);
        toastSuccess("Task criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}
