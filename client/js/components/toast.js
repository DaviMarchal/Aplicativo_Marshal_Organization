// Toast notifications — usado por todo CRUD ("Salvo ✓", "Excluído", "Erro").
const root = document.getElementById("toast-root");

const ICONS = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

const COLORS = {
  success: "var(--green)",
  error: "var(--red)",
  info: "var(--blue-soft)",
};

export function toast(message, type = "success", duration = 3200) {
  const el = document.createElement("div");
  el.className =
    "toast-in glass-card px-4 py-3 rounded-2xl shadow-card flex items-center gap-3 w-full sm:min-w-[220px] sm:w-auto sm:max-w-[360px]";
  el.innerHTML = `
    <span class="flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold shrink-0"
          style="background:${COLORS[type]}22; color:${COLORS[type]}">${ICONS[type] || ICONS.info}</span>
    <span class="text-sm text-text-hi leading-snug">${message}</span>
  `;
  root.appendChild(el);

  const remove = () => {
    el.classList.remove("toast-in");
    el.classList.add("toast-out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  };

  const timer = setTimeout(remove, duration);
  el.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}

export const toastSuccess = (msg) => toast(msg, "success");
export const toastError = (msg) => toast(msg, "error");
export const toastInfo = (msg) => toast(msg, "info");

// Toast com botão "Desfazer" — usado depois de excluir algo. `onUndo` só é
// chamado se o usuário clicar dentro da janela de tempo; senão a exclusão
// já feita fica valendo (ver comentário nos call-sites: como a API DELETE já
// rodou, "desfazer" aqui recria o item via POST — perde histórico específico
// tipo streak/checkins, mas devolve o essencial).
export function toastUndo(message, onUndo, duration = 6000) {
  const el = document.createElement("div");
  el.className =
    "toast-in glass-card px-4 py-3 rounded-2xl shadow-card flex items-center gap-3 w-full sm:min-w-[240px] sm:w-auto sm:max-w-[380px]";
  el.innerHTML = `
    <span class="flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold shrink-0"
          style="background:var(--red)22; color:var(--red)">✕</span>
    <span class="text-sm text-text-hi leading-snug flex-1">${message}</span>
    <button type="button" data-undo class="btn-ghost px-3 py-1 text-xs rounded-full shrink-0">Desfazer</button>
  `;
  root.appendChild(el);

  const remove = () => {
    el.classList.remove("toast-in");
    el.classList.add("toast-out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  };

  const timer = setTimeout(remove, duration);
  el.querySelector("[data-undo]").addEventListener("click", (e) => {
    e.stopPropagation();
    clearTimeout(timer);
    remove();
    onUndo();
  });
}
