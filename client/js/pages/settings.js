import { api } from "../api.js";
import { toastSuccess, toastError } from "../components/toast.js";
import { confirmModal } from "../components/modal.js";
import { attachRipple } from "../components/card.js";
import { ICONS } from "../components/icons.js";
import { themeToggleHtml } from "../app.js";
import { invalidateUserName } from "../components/sidebar.js";
import { getCurrentUser, logout } from "../auth.js";
import {
  NOTIF_ROUTINE_KEY,
  NOTIF_TASKS_KEY,
  isNotifEnabled,
} from "../notifications.js";

function sectionCard(title, subtitle, innerHtml) {
  return `
    <div class="glass-card p-5 flex flex-col gap-4 anim-stagger-in">
      <div>
        <h3 class="font-semibold text-text-hi">${title}</h3>
        ${subtitle ? `<p class="text-text-mid text-xs mt-0.5">${subtitle}</p>` : ""}
      </div>
      ${innerHtml}
    </div>
  `;
}

function toggleRow(id, label, checked) {
  return `
    <label class="flex items-center justify-between gap-4 cursor-pointer">
      <span class="text-sm text-text-hi">${label}</span>
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""} class="peer sr-only" />
      <span class="toggle-track"></span>
    </label>
  `;
}

export async function render(container, { setHeader, isCurrent = () => true }) {
  container.innerHTML = `<div class="skeleton h-96 w-full"></div>`;

  setHeader(`
    <div class="flex items-center justify-between anim-stagger-in">
      <div>
        <h1 class="text-2xl font-semibold text-text-hi">Configurações</h1>
        <p class="text-text-mid text-sm mt-1 font-label">Perfil, notificações e backup</p>
      </div>
      ${themeToggleHtml()}
    </div>
  `);

  let settings;
  try {
    settings = await api.get("/settings");
  } catch (err) {
    if (!isCurrent()) return;
    container.innerHTML = `<div class="glass-card p-8 text-center text-text-mid">${err.message}</div>`;
    return;
  }
  if (!isCurrent()) return;

  const user = getCurrentUser();
  const multiUser = !!user?.multiUser;

  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-6 max-w-xl";

  wrap.innerHTML =
    sectionCard(
      "Perfil",
      "O nome usado na saudação do Dashboard.",
      `
      <form id="profile-form" class="flex items-center gap-2">
        <input name="name" required maxlength="80" class="input-glass flex-1 px-3 py-2 text-sm" value="${settings.name}" />
        <button type="submit" class="btn-accent px-4 py-2 text-sm">Salvar</button>
      </form>
    `
    ) +
    (multiUser
      ? sectionCard(
          "Conta",
          user.email,
          `<button id="logout-btn" type="button" class="btn-ghost px-4 py-2.5 text-sm">Sair da conta</button>`
        )
      : "") +
    sectionCard(
      "Notificações",
      "Alertas nativos do sistema — pedem permissão do navegador/app na primeira vez.",
      `
      <div class="flex flex-col gap-3">
        ${toggleRow("notif-routine", "Lembrete de rotina no horário marcado", isNotifEnabled(NOTIF_ROUTINE_KEY))}
        ${toggleRow("notif-tasks", "Aviso de tasks vencendo hoje", isNotifEnabled(NOTIF_TASKS_KEY))}
      </div>
    `
    ) +
    (multiUser
      ? ""
      : sectionCard(
          "Dados",
          "Baixa um arquivo .json com tudo que está no banco — tasks, rotinas, finanças, notas, metas e treinos.",
          `<div class="flex flex-wrap items-center gap-2">
             <button id="export-btn" type="button" class="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2">
               <span class="w-4 h-4 [&>svg]:w-full [&>svg]:h-full">${ICONS.download}</span> Exportar backup (.json)
             </button>
             <button id="import-btn" type="button" class="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2 text-negative">
               <span class="w-4 h-4 [&>svg]:w-full [&>svg]:h-full" style="transform:rotate(180deg)">${ICONS.download}</span> Restaurar backup...
             </button>
             <input id="import-file" type="file" accept="application/json" class="hidden" />
           </div>
           <p class="text-[11px] text-text-lo">Restaurar <strong>substitui tudo</strong> que está no banco agora pelo conteúdo do arquivo. Não dá pra desfazer.</p>`
        ));

  container.innerHTML = "";
  container.appendChild(wrap);

  document.getElementById("logout-btn")?.addEventListener("click", () => logout());

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get("name").trim();
    if (!name) return;
    try {
      await api.put("/settings", { name });
      invalidateUserName();
      toastSuccess("Nome salvo.");
    } catch (err) {
      toastError(err.message);
    }
  });

  document.getElementById("notif-routine").addEventListener("change", (e) => {
    localStorage.setItem(NOTIF_ROUTINE_KEY, e.target.checked ? "1" : "0");
  });
  document.getElementById("notif-tasks").addEventListener("change", (e) => {
    localStorage.setItem(NOTIF_TASKS_KEY, e.target.checked ? "1" : "0");
  });

  if (!multiUser) {
    const exportBtn = document.getElementById("export-btn");
    attachRipple(exportBtn);
    exportBtn.addEventListener("click", async () => {
      try {
        const dump = await api.get("/settings/export");
        const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `marshal-organization-backup-${dump.exported_at.slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toastSuccess("Backup baixado.");
      } catch (err) {
        toastError(err.message);
      }
    });

    const importBtn = document.getElementById("import-btn");
    const importFile = document.getElementById("import-file");
    attachRipple(importBtn);
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
      const file = importFile.files[0];
      importFile.value = ""; // permite escolher o mesmo arquivo de novo depois
      if (!file) return;

      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        toastError("Esse arquivo não é um JSON válido.");
        return;
      }
      if (!parsed?.data || typeof parsed.data !== "object") {
        toastError("Esse arquivo não parece um backup válido.");
        return;
      }

      const ok = await confirmModal({
        title: "Restaurar backup",
        message: `Isso vai apagar TUDO que está no banco agora (tasks, rotinas, finanças, notas, metas, treinos) e substituir pelo conteúdo de "${file.name}"${parsed.exported_at ? ` (backup de ${new Date(parsed.exported_at).toLocaleDateString("pt-BR")})` : ""}. Não dá pra desfazer. Tem certeza?`,
        confirmLabel: "Restaurar e apagar dados atuais",
      });
      if (!ok) return;

      try {
        await api.post("/settings/import", parsed);
        toastSuccess("Backup restaurado. Recarregando o app...");
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        toastError(err.message);
      }
    });
  }
}
