import { api } from "../api.js";
import { toastSuccess, toastError, toastUndo } from "../components/toast.js";
import { openModal, closeModal, confirmModal } from "../components/modal.js";
import { emptyStateHtml, emptyState } from "../components/empty-state.js";
import { ICONS } from "../components/icons.js";
import { attachRipple } from "../components/card.js";
import { progressRing } from "../components/progress-ring.js";
import { celebrate } from "../components/confetti.js";
import { themeToggleHtml } from "../app.js";
import { todayStr, formatDateShort } from "../format.js";

let selectedGoalId = null;

export async function render(container, { setHeader, params: routeParams }) {
  container.innerHTML = `<div class="skeleton h-96 w-full"></div>`;

  setHeader(`
    <div class="flex items-center justify-between anim-stagger-in">
      <div>
        <h1 class="text-2xl font-semibold text-text-hi">Metas</h1>
        <p class="text-text-mid text-sm mt-1 font-label">Jornadas de 6 meses</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="new-goal" type="button" class="btn-accent px-4 py-2.5 text-sm">+ Nova meta</button>
        ${themeToggleHtml()}
      </div>
    </div>
  `);
  document.getElementById("new-goal").addEventListener("click", () => openGoalModal(null, refresh));
  attachRipple(document.getElementById("new-goal"));

  const goals = await api.get("/goals").catch(() => []);

  if (!goals.length) {
    container.innerHTML = "";
    container.appendChild(
      emptyState({
        icon: ICONS.metas,
        title: "Nenhuma meta ainda",
        subtitle: "Crie sua primeira meta de 6 meses e comece a acompanhar sua consistência.",
        ctaLabel: "Criar meta",
        onCta: () => openGoalModal(null, refresh),
      })
    );
    return;
  }

  // deep-link da busca (⌘K): #/metas?open=5 seleciona direto essa meta
  if (routeParams?.open && goals.some((g) => String(g.id) === String(routeParams.open))) {
    selectedGoalId = Number(routeParams.open);
  } else if (!selectedGoalId || !goals.some((g) => g.id === selectedGoalId)) {
    selectedGoalId = (goals.find((g) => g.status === "active") || goals[0]).id;
  }

  const layout = document.createElement("div");
  layout.className = "grid grid-cols-1 lg:grid-cols-3 gap-6";

  const listCol = document.createElement("div");
  listCol.className = "flex flex-col gap-2 anim-stagger-in";
  goals.forEach((g) => listCol.appendChild(goalListItem(g)));
  layout.appendChild(listCol);

  const detailCol = document.createElement("div");
  detailCol.className = "lg:col-span-2";
  detailCol.id = "goal-detail";
  layout.appendChild(detailCol);

  container.innerHTML = "";
  container.appendChild(layout);

  await loadDetail();

  function goalListItem(g) {
    const el = document.createElement("div");
    const active = g.id === selectedGoalId;
    el.className = "glass-card p-4 cursor-pointer card-hover";
    el.style.borderColor = active ? "var(--accent)" : "var(--stroke)";
    el.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-label text-[10px] ${
          g.status === "active" ? "text-positive" : g.status === "completed" ? "text-blue-soft" : "text-text-lo"
        }">${g.status === "active" ? "Ativa" : g.status === "completed" ? "Concluída" : "Abandonada"}</span>
      </div>
      <p class="text-sm text-text-hi font-medium">${g.title}</p>
      <p class="text-[11px] text-text-lo font-label mt-1">${formatDateShort(g.start_date)} → ${formatDateShort(g.end_date)}</p>
    `;
    el.addEventListener("click", () => {
      selectedGoalId = g.id;
      render(container, { setHeader });
    });
    return el;
  }

  async function loadDetail() {
    const goal = goals.find((g) => g.id === selectedGoalId);
    const host = document.getElementById("goal-detail");
    host.innerHTML = `<div class="skeleton h-80 w-full"></div>`;

    const [progress, checkins, links] = await Promise.all([
      api.get(`/goals/${goal.id}/progress`),
      api.get(`/goals/${goal.id}/checkins`),
      api.get(`/goals/${goal.id}/links`),
    ]);

    const celebratedKey = `momentum-celebrated-goal-${goal.id}`;
    if (progress.percent >= 100 && goal.status === "active" && !sessionStorage.getItem(celebratedKey)) {
      celebrate();
      sessionStorage.setItem(celebratedKey, "1");
    }

    host.innerHTML = "";
    const card = document.createElement("div");
    card.className = "glass-card p-6 flex flex-col gap-6 anim-stagger-in";

    const top = document.createElement("div");
    top.className = "flex flex-col sm:flex-row items-center gap-6";
    top.appendChild(progressRing({ percent: progress.percent, size: 150, label: `${progress.remaining_days}d restantes` }));

    const info = document.createElement("div");
    info.className = "flex-1 flex flex-col gap-2 text-center sm:text-left";
    info.innerHTML = `
      <h2 class="text-xl font-semibold text-text-hi">${goal.title}</h2>
      <p class="text-text-mid text-sm">${goal.description || ""}</p>
      <div class="flex flex-wrap gap-1.5 justify-center sm:justify-start mt-1">
        ${(goal.focus_areas || "")
          .split(",")
          .filter(Boolean)
          .map((f) => `<span class="pill" style="background:var(--glass); color:var(--text-mid)">#${f.trim()}</span>`)
          .join("")}
      </div>
      <div class="flex gap-4 mt-2 justify-center sm:justify-start font-label text-[11px] text-text-mid">
        <span>${progress.days_completed}/${progress.total_days} dias concluídos</span>
        ${progress.consistency !== null ? `<span>${progress.consistency}% consistência</span>` : ""}
      </div>
      ${progress.alert ? `<p class="text-xs text-accent-soft mt-1">⏰ ${progress.alert}</p>` : ""}
      <div class="flex gap-2 mt-3 justify-center sm:justify-start">
        <button id="edit-goal" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg">Editar</button>
        ${
          goal.status === "active"
            ? `<button id="complete-goal" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg text-positive">Marcar concluída</button>
               <button id="abandon-goal" type="button" class="btn-ghost px-3 py-1.5 text-xs rounded-lg text-negative">Abandonar</button>`
            : ""
        }
      </div>
    `;
    top.appendChild(info);
    card.appendChild(top);

    // ---- Diário (nota do dia) ----
    // Sem barra de progresso aqui de propósito: marcar "feito" é lá na
    // rotina vinculada (ver seção abaixo / Rotina / Tasks) — isso aqui é só
    // um espaço pra anotar como foi o dia, não decide se a meta terminou.
    const checkinBox = document.createElement("div");
    checkinBox.className = "border-t border-stroke pt-5";
    checkinBox.innerHTML = `
      <h3 class="font-semibold text-text-hi mb-1">Diário</h3>
      <p class="text-[11px] text-text-lo mb-3">Uma nota opcional sobre o dia — marcar "feito" é na rotina vinculada, não aqui.</p>
      <form id="checkin-form" class="flex flex-col sm:flex-row gap-3">
        <input name="note" required placeholder="Como foi hoje?" class="input-glass px-3 py-2 text-sm flex-1" />
        <button type="submit" class="btn-accent px-4 py-2 text-sm">Registrar nota</button>
      </form>
    `;
    checkinBox.querySelector("#checkin-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.post(`/goals/${goal.id}/checkins`, {
          checkin_date: todayStr(),
          note: fd.get("note") || null,
        });
        toastSuccess("Nota registrada");
        render(container, { setHeader });
      } catch (err) {
        toastError(err.message);
      }
    });
    card.appendChild(checkinBox);

    // ---- Timeline ----
    const timeline = document.createElement("div");
    timeline.className = "border-t border-stroke pt-5";
    timeline.innerHTML = `<h3 class="font-semibold text-text-hi mb-3">Linha do tempo</h3>`;
    if (!checkins.length) {
      timeline.insertAdjacentHTML("beforeend", emptyStateHtml({ icon: ICONS.trending, title: "Nenhuma nota ainda" }));
    } else {
      const list = document.createElement("div");
      list.className = "flex flex-col gap-2 max-h-72 overflow-y-auto";
      checkins.forEach((c) => {
        const row = document.createElement("div");
        row.className = "flex items-start gap-3 px-3 py-2.5 rounded-xl";
        row.style.background = "var(--glass)";
        row.innerHTML = `
          <span class="font-label text-[10px] text-text-lo w-14 shrink-0 pt-0.5">${formatDateShort(c.checkin_date)}</span>
          <p class="text-xs text-text-mid flex-1">${c.note || ""}</p>
        `;
        list.appendChild(row);
      });
      timeline.appendChild(list);
    }
    card.appendChild(timeline);

    // ---- Rotinas vinculadas ----
    const linksBox = document.createElement("div");
    linksBox.className = "border-t border-stroke pt-5";
    linksBox.innerHTML = `<h3 class="font-semibold text-text-hi mb-3">Rotinas que alimentam essa meta</h3>`;
    if (!links.length) {
      linksBox.insertAdjacentHTML("beforeend", emptyStateHtml({ icon: ICONS.rotina, title: "Nenhuma rotina vinculada" }));
    } else {
      const list = document.createElement("div");
      list.className = "flex flex-wrap gap-2";
      links.forEach((l) => {
        const chip = document.createElement("span");
        chip.className = "pill flex items-center gap-1.5";
        chip.style.background = "var(--glass)";
        chip.style.color = "var(--text-hi)";
        chip.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:${l.color}"></span>${l.title}`;
        list.appendChild(chip);
      });
      linksBox.appendChild(list);
    }
    card.appendChild(linksBox);

    host.appendChild(card);

    card.querySelector("#edit-goal").addEventListener("click", () => openGoalModal(goal, () => render(container, { setHeader })));
    card.querySelector("#complete-goal")?.addEventListener("click", async () => {
      try {
        await api.put(`/goals/${goal.id}`, { ...goal, status: "completed" });
        celebrate();
        toastSuccess("Meta concluída! 🎉");
        render(container, { setHeader });
      } catch (err) {
        toastError(err.message);
      }
    });
    card.querySelector("#abandon-goal")?.addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Abandonar meta", message: "Marcar esta meta como abandonada? Você pode reativá-la depois editando o status.", confirmLabel: "Abandonar" });
      if (!ok) return;
      try {
        await api.put(`/goals/${goal.id}`, { ...goal, status: "abandoned" });
        toastSuccess("Meta marcada como abandonada");
        render(container, { setHeader });
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  function refresh() {
    render(container, { setHeader });
  }
}

function openGoalModal(goal, onSaved) {
  const isEdit = !!goal;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="goal-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Título</label>
        <input name="title" required class="input-glass w-full px-3 py-2 text-sm" value="${goal?.title ?? ""}" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Descrição</label>
        <textarea name="description" rows="2" class="input-glass w-full px-3 py-2 text-sm">${goal?.description ?? ""}</textarea>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Áreas de foco (vírgula)</label>
        <input name="focus_areas" class="input-glass w-full px-3 py-2 text-sm" value="${goal?.focus_areas ?? ""}" placeholder="academia, estudos" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Início</label>
          <input name="start_date" type="date" class="input-glass w-full px-3 py-2 text-sm" value="${goal?.start_date ?? todayStr()}" />
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Fim (padrão: +180 dias)</label>
          <input name="end_date" type="date" class="input-glass w-full px-3 py-2 text-sm" value="${goal?.end_date ?? ""}" />
        </div>
      </div>
      ${
        isEdit
          ? ""
          : `<p class="text-[11px] text-text-lo">Cria também uma rotina diária (todos os dias) com esse título — é nela que você marca "feito" a cada dia até o fim da meta.</p>`
      }
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar meta"}</button>
      </div>
    </form>
  `;
  openModal({ title: isEdit ? "Editar meta" : "Nova meta de 6 meses", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Excluir meta", message: `Tem certeza que quer excluir "${goal.title}"? Todos os check-ins também serão perdidos.`, confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/goals/${goal.id}`);
        selectedGoalId = null;
        closeModal();
        onSaved();
        // perde check-ins e vínculos com rotinas (não reconstruíveis pela API
        // pública) e recalcula end_date como start_date+180 — pode diferir se
        // a meta original tinha o prazo editado manualmente.
        toastUndo(`"${goal.title}" excluída`, async () => {
          try {
            await api.post("/goals", {
              title: goal.title,
              description: goal.description,
              focus_areas: goal.focus_areas,
              start_date: goal.start_date,
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

  body.querySelector("#goal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      if (isEdit) {
        const end = fd.get("end_date") || goal.end_date;
        await api.put(`/goals/${goal.id}`, {
          title: fd.get("title"),
          description: fd.get("description") || null,
          focus_areas: fd.get("focus_areas") || "",
          start_date: fd.get("start_date"),
          end_date: end,
          status: goal.status,
        });
        toastSuccess("Meta atualizada");
      } else {
        const res = await api.post("/goals", {
          title: fd.get("title"),
          description: fd.get("description") || null,
          focus_areas: fd.get("focus_areas") || "",
          start_date: fd.get("start_date") || todayStr(),
        });
        selectedGoalId = res.id;
        toastSuccess("Meta criada — adicionei uma rotina diária pra você marcar feito todo dia.");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}
