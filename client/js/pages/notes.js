import { api } from "../api.js";
import { toastSuccess, toastError, toastUndo } from "../components/toast.js";
import { openModal, closeModal, confirmModal } from "../components/modal.js";
import { emptyStateHtml } from "../components/empty-state.js";
import { ICONS } from "../components/icons.js";
import { attachRipple } from "../components/card.js";
import { themeToggleHtml } from "../app.js";
import { formatDateShort, todayStr } from "../format.js";
import { renderMarkdown } from "../components/markdown.js";

const COLORS = ["#16161A", "#1B2A4A", "#2A1B3D", "#1B3D2A", "#3D2A1B", "#3D1B24"];
let search = "";
let searchDebounce = null;

export async function render(container, { setHeader, params: routeParams }) {
  container.innerHTML = `<div class="skeleton h-96 w-full"></div>`;

  setHeader(`
    <div class="flex items-center justify-between anim-stagger-in">
      <div>
        <h1 class="text-2xl font-semibold text-text-hi">Notes</h1>
        <p class="text-text-mid text-sm mt-1 font-label">Seu diário e bloco de ideias</p>
      </div>
      <div class="flex items-center gap-2">
        <input id="notes-search" type="text" placeholder="Buscar notas..." class="input-glass px-3 py-2 text-sm w-56" value="${search}" />
        <button id="new-note" type="button" class="btn-accent px-4 py-2.5 text-sm">+ Nova nota</button>
        ${themeToggleHtml()}
      </div>
    </div>
  `);

  document.getElementById("new-note").addEventListener("click", () => openNoteModal(null, load));
  attachRipple(document.getElementById("new-note"));

  // ação rápida do ⌘K: #/notes?new=1 abre direto o modal de criação
  if (routeParams?.new === "1") document.getElementById("new-note").click();

  document.getElementById("notes-search").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      search = value;
      load();
    }, 300);
  });

  await load();

  // deep-link da busca (⌘K): #/notes?open=7 abre direto o modal dessa nota
  if (routeParams?.open) {
    try {
      const note = await api.get(`/notes/${routeParams.open}`);
      openNoteModal(note, load);
    } catch {
      // nota pode ter sido excluída entre a busca e o clique — ignora
    }
  }

  async function load() {
    let notes;
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      notes = await api.get(`/notes?${params.toString()}`);
    } catch (err) {
      container.innerHTML = `<div class="glass-card p-8 text-center text-text-mid">${err.message}</div>`;
      return;
    }
    container.innerHTML = "";
    if (!notes.length) {
      container.appendChild(
        Object.assign(document.createElement("div"), {
          innerHTML: emptyStateHtml({ icon: ICONS.notes, title: "Nenhuma nota ainda", subtitle: "Escreva sua primeira nota do dia." }),
        }).firstElementChild
      );
      return;
    }
    const grid = document.createElement("div");
    grid.className = "columns-1 sm:columns-2 lg:columns-3 gap-4 anim-stagger-in [&>*]:mb-4 [&>*]:break-inside-avoid";
    notes.forEach((n) => grid.appendChild(noteCard(n, load)));
    container.appendChild(grid);
  }
}

function noteCard(note, onChange) {
  const card = document.createElement("div");
  card.className = "rounded-2xl p-4 card-hover cursor-pointer border border-stroke flex flex-col gap-2";
  card.style.background = note.color || "#16161A";
  card.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-label text-[10px] text-text-lo">${formatDateShort(note.note_date)}</span>
      <button type="button" data-pin class="text-sm ${note.pinned ? "opacity-100" : "opacity-40"}">📌</button>
    </div>
    ${note.title ? `<h3 class="text-text-hi font-semibold text-sm">${note.title}</h3>` : ""}
    <div class="note-markdown text-text-mid text-sm line-clamp-6">${renderMarkdown(note.content)}</div>
    ${
      (note.tags || []).length
        ? `<div class="flex gap-1 flex-wrap mt-1">${note.tags.map((t) => `<span class="pill" style="background:rgba(255,255,255,0.08); color:var(--text-mid)">#${t}</span>`).join("")}</div>`
        : ""
    }
  `;
  card.querySelector("[data-pin]").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await api.put(`/notes/${note.id}`, { ...note, pinned: !note.pinned });
      toastSuccess(note.pinned ? "Nota desafixada" : "Nota fixada");
      onChange();
    } catch (err) {
      toastError(err.message);
    }
  });
  card.addEventListener("click", () => openNoteModal(note, onChange));
  return card;
}

function openNoteModal(note, onSaved) {
  const isEdit = !!note;
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="note-form" class="flex flex-col gap-4">
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Título</label>
        <input name="title" class="input-glass w-full px-3 py-2 text-sm" value="${note?.title ?? ""}" />
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-1">Conteúdo</label>
        <textarea name="content" rows="6" class="input-glass w-full px-3 py-2 text-sm">${note?.content ?? ""}</textarea>
        <p class="text-[11px] text-text-lo mt-1">Suporta **negrito**, *itálico* e listas com "- item"</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Data</label>
          <input name="note_date" type="date" class="input-glass w-full px-3 py-2 text-sm" value="${note?.note_date ?? todayStr()}" />
        </div>
        <div>
          <label class="font-label text-[11px] text-text-mid block mb-1">Tags (vírgula)</label>
          <input name="tags" class="input-glass w-full px-3 py-2 text-sm" value="${(note?.tags || []).join(", ")}" />
        </div>
      </div>
      <div>
        <label class="font-label text-[11px] text-text-mid block mb-2">Cor</label>
        <div id="color-picker" class="flex gap-2">
          ${COLORS.map(
            (c) => `<button type="button" data-color="${c}" class="color-btn w-7 h-7 rounded-full border-2" style="background:${c}; border-color:${(note?.color ?? COLORS[0]) === c ? "var(--accent)" : "transparent"}"></button>`
          ).join("")}
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm text-text-mid cursor-pointer">
        <input type="checkbox" name="pinned" ${note?.pinned ? "checked" : ""} /> Fixar nota
      </label>
      <div class="flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="delete-btn" class="btn-ghost px-4 py-2.5 text-sm text-negative">Excluir</button>` : ""}
        <button type="submit" class="btn-accent px-5 py-2.5 text-sm">${isEdit ? "Salvar" : "Criar nota"}</button>
      </div>
    </form>
  `;
  let selectedColor = note?.color ?? COLORS[0];
  body.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedColor = btn.dataset.color;
      body.querySelectorAll(".color-btn").forEach((b) => (b.style.borderColor = "transparent"));
      btn.style.borderColor = "var(--accent)";
    });
  });

  openModal({ title: isEdit ? "Editar nota" : "Nova nota", bodyEl: body });

  if (isEdit) {
    body.querySelector("#delete-btn").addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Excluir nota", message: "Tem certeza que quer excluir esta nota?", confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.del(`/notes/${note.id}`);
        closeModal();
        onSaved();
        toastUndo(`"${note.title || "Nota"}" excluída`, async () => {
          try {
            await api.post("/notes", {
              title: note.title,
              content: note.content,
              color: note.color,
              pinned: note.pinned,
              note_date: note.note_date,
              tags: note.tags || [],
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

  body.querySelector("#note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      title: fd.get("title") || null,
      content: fd.get("content") || null,
      note_date: fd.get("note_date"),
      color: selectedColor,
      pinned: fd.get("pinned") === "on",
      tags: fd.get("tags").split(",").map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (isEdit) {
        await api.put(`/notes/${note.id}`, payload);
        toastSuccess("Nota atualizada");
      } else {
        await api.post("/notes", payload);
        toastSuccess("Nota criada");
      }
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}
