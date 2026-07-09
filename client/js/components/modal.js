// Modal genérico com backdrop-blur + scale/fade in (ver .modal-backdrop/.modal-panel
// em animations.css). Uso: openModal({ title, bodyEl, footerEl, onClose }).
const root = document.getElementById("modal-root");

// Foco preso (focus trap): sem isso, Tab dentro de um modal aberto escapa
// pros elementos da página por trás dele — real problema de acessibilidade
// pra quem navega só de teclado.
function getFocusable(panel) {
  return Array.from(
    panel.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((el) => el.offsetParent !== null);
}
function trapTab(e, panel) {
  if (e.key !== "Tab") return;
  const focusable = getFocusable(panel);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

let activeCloseHandler = null;
// Enquanto um confirmModal() estiver aberto por cima de um modal pai, o
// Escape do modal pai fica suspenso — senão os dois listeners de "keydown"
// (ambos em document) disparam juntos e fecham os dois de uma vez.
let confirmDialogOpen = false;

export function openModal({ title, bodyEl, widthClass = "max-w-lg", onClose }) {
  closeModal();

  const backdrop = document.createElement("div");
  backdrop.className =
    "modal-backdrop fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4";

  const panel = document.createElement("div");
  panel.className = `modal-panel glass-panel ${widthClass} w-full max-h-[86vh] overflow-y-auto rounded-card p-6 shadow-card`;

  const header = document.createElement("div");
  header.className = "flex items-center justify-between mb-5";
  header.innerHTML = `
    <h3 class="text-lg font-semibold text-text-hi">${title}</h3>
    <button type="button" data-close class="btn-ghost w-8 h-8 rounded-full flex items-center justify-center text-text-mid hover:text-text-hi">✕</button>
  `;

  panel.appendChild(header);
  panel.appendChild(bodyEl);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
    onClose?.();
  };
  activeCloseHandler = close;

  function onKeydown(e) {
    if (confirmDialogOpen) return; // deixa o confirmModal() por cima cuidar do próprio Tab/Escape
    if (e.key === "Escape") return close();
    trapTab(e, panel);
  }
  document.addEventListener("keydown", onKeydown);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop && !confirmDialogOpen) close();
  });
  header.querySelector("[data-close]").addEventListener("click", close);

  // foco no primeiro campo, se existir
  requestAnimationFrame(() => {
    bodyEl.querySelector("input,textarea,select,button")?.focus();
  });

  return { close, panel };
}

export function closeModal() {
  activeCloseHandler?.();
  activeCloseHandler = null;
}

// Confirmação temática (substitui window.confirm nativo). Resolve `true` se o
// usuário confirmar, `false` se cancelar/fechar de qualquer outra forma.
//
// Importante: NÃO usa openModal()/closeModal() por baixo — aquele par
// mantém só "um modal ativo" por vez e fecha o anterior ao abrir um novo
// (activeCloseHandler). Como confirmModal() é chamada com frequência de
// dentro de um modal de edição já aberto (ex.: botão "Excluir" dentro do
// modal de editar task), reaproveitar openModal() derrubaria esse modal pai
// antes mesmo do usuário decidir — cancelar a confirmação perderia a edição
// em andamento. Por isso ela desenha seu próprio overlay, com z-index maior,
// empilhando por cima do modal pai sem fechá-lo.
export function confirmModal({ title = "Tem certeza?", message = "", confirmLabel = "Confirmar", danger = true } = {}) {
  return new Promise((resolve) => {
    let settled = false;

    const backdrop = document.createElement("div");
    backdrop.className =
      "modal-backdrop fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4";

    const panel = document.createElement("div");
    panel.className = "modal-panel glass-panel max-w-sm w-full rounded-card p-6 shadow-card";
    panel.innerHTML = `
      <h3 class="text-lg font-semibold text-text-hi mb-4">${title}</h3>
      <p class="text-sm text-text-mid leading-relaxed mb-5">${message}</p>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancel class="btn-ghost px-4 py-2.5 text-sm">Cancelar</button>
        <button type="button" data-confirm class="px-5 py-2.5 text-sm rounded-full font-medium ${
          danger ? "bg-negative text-white" : "btn-accent"
        }">${confirmLabel}</button>
      </div>
    `;
    backdrop.appendChild(panel);
    root.appendChild(backdrop);
    confirmDialogOpen = true;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      confirmDialogOpen = false;
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      resolve(value);
    };

    function onKeydown(e) {
      if (e.key === "Escape") return finish(false);
      trapTab(e, panel);
    }
    document.addEventListener("keydown", onKeydown);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(false);
    });
    panel.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
    panel.querySelector("[data-confirm]").addEventListener("click", () => finish(true));

    // foco no botão "Cancelar" por padrão — mais seguro pra ações destrutivas
    // (evita confirmar sem querer com Enter/Espaço logo após abrir)
    requestAnimationFrame(() => panel.querySelector("[data-cancel]")?.focus());
  });
}
