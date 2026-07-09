// Sidebar fixa: logo, busca (⌘K), navegação com indicador ativo deslizante
// (magic line), recolhível pra só ícones.
import { api } from "../api.js";
import { ICONS } from "./icons.js";

// Reexportado pra quem já importava ICONS a partir da sidebar (pages antigas).
export { ICONS };

export const NAV_ITEMS = [
  { route: "dashboard", label: "Dashboard", icon: ICONS.dashboard },
  { route: "rotina", label: "Rotina", icon: ICONS.rotina },
  { route: "tasks", label: "Tasks", icon: ICONS.tasks },
  { route: "financas", label: "Finanças", icon: ICONS.financas },
  { route: "notes", label: "Notes", icon: ICONS.notes },
  { route: "metas", label: "Metas", icon: ICONS.metas },
  { route: "academia", label: "Academia", icon: ICONS.academia },
];

const COLLAPSE_KEY = "momentum-sidebar-collapsed";
let collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";

// Nome de exibição vem de /api/settings (editável em Configurações). Cacheado
// em memória — busca uma vez e só refaz a chamada quando invalidado.
let cachedUserName = null;
let lastRenderArgs = null;

function ensureUserName() {
  if (cachedUserName !== null) return;
  api
    .get("/settings")
    .then((s) => {
      cachedUserName = s.name || "Davi";
      if (lastRenderArgs) renderSidebar(...lastRenderArgs);
    })
    .catch(() => {
      cachedUserName = "Davi";
    });
}

// Chamado pela página de Configurações depois de salvar um novo nome, pra
// sidebar refletir sem precisar recarregar o app inteiro.
export function invalidateUserName() {
  cachedUserName = null;
  ensureUserName();
}

export function renderSidebar(container, activeRoute, onNavigate) {
  lastRenderArgs = [container, activeRoute, onNavigate];
  ensureUserName();
  const displayName = cachedUserName || "Davi";
  const initial = displayName.trim().charAt(0).toUpperCase() || "D";

  container.classList.toggle("w-[280px]", !collapsed);
  container.classList.toggle("w-[76px]", collapsed);

  container.innerHTML = `
    <div class="h-full flex flex-col px-3 py-6">
      <div class="flex items-center gap-2 px-1 mb-6 ${collapsed ? "justify-center" : "justify-between"}">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-8 h-8 shrink-0 rounded-xl glow-icon flex items-center justify-center font-bold text-sm"
               style="background:linear-gradient(160deg, #afdef5, #2d96cd); color:#ffffff;">M</div>
          ${collapsed ? "" : `<span class="font-semibold text-text-hi text-[15px] truncate">Marshal Organization</span>`}
        </div>
        ${
          collapsed
            ? ""
            : `<button type="button" id="collapse-toggle" title="Recolher menu"
                       class="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center text-xs text-text-mid shrink-0">«</button>`
        }
      </div>

      <button type="button" id="search-trigger" title="Buscar (⌘K)"
              class="input-glass flex items-center ${collapsed ? "justify-center" : "justify-between"} px-3 py-2 mb-6 text-sm text-text-mid">
        ${
          collapsed
            ? `<span class="w-[16px] h-[16px] [&>svg]:w-full [&>svg]:h-full">${ICONS.search}</span>`
            : `<span class="flex items-center gap-2"><span class="w-[16px] h-[16px] shrink-0 [&>svg]:w-full [&>svg]:h-full">${ICONS.search}</span> Buscar</span>
               <kbd class="font-label text-[10px] px-1.5 py-0.5 rounded border border-stroke">⌘K</kbd>`
        }
      </button>

      ${collapsed ? "" : `<div class="font-label text-[10px] text-text-lo px-2 mb-2">Navegação</div>`}
      <nav id="nav-list" class="relative flex flex-col gap-1">
        <div id="nav-indicator" class="sidebar-indicator absolute left-0 w-full rounded-xl -z-10"
             style="background:var(--glass); border:1px solid var(--stroke); box-shadow: inset 2px 0 0 var(--accent), 0 4px 16px rgba(255,122,0,.12);"></div>
        ${NAV_ITEMS.map(
          (item) => `
          <a href="#/${item.route}" data-route="${item.route}" ${collapsed ? `title="${item.label}"` : ""}
             class="nav-item relative z-10 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200
                    ${collapsed ? "justify-center" : ""}
                    ${item.route === activeRoute ? "text-text-hi" : "text-text-mid hover:text-text-hi hover:bg-white/[0.04]"}">
            <span class="w-[18px] h-[18px] shrink-0 [&>svg]:w-full [&>svg]:h-full">${item.icon}</span>
            ${collapsed ? "" : `<span class="truncate">${item.label}</span>`}
          </a>`
        ).join("")}
      </nav>

      <div class="mt-auto ${collapsed ? "flex flex-col items-center gap-3" : "flex items-center gap-2.5 px-2"} pt-4 border-t border-stroke">
        <div class="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
             style="background:linear-gradient(160deg, var(--blue-soft), var(--blue-glow)); color:#0a0a0b;" title="${displayName}">${initial}</div>
        ${
          collapsed
            ? `<button type="button" id="settings-trigger" title="Configurações" class="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center text-text-mid">
                 <span class="w-[15px] h-[15px] [&>svg]:w-full [&>svg]:h-full">${ICONS.gear}</span>
               </button>
               <button type="button" id="collapse-toggle" title="Expandir menu" class="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center text-xs text-text-mid">»</button>`
            : `<div class="min-w-0 flex-1">
                 <p class="text-xs text-text-hi font-medium truncate">${displayName}</p>
                 <p class="text-[10px] text-text-lo font-label truncate">SINGLE-USER</p>
               </div>
               <button type="button" id="settings-trigger" title="Configurações" class="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center text-text-mid shrink-0">
                 <span class="w-[15px] h-[15px] [&>svg]:w-full [&>svg]:h-full">${ICONS.gear}</span>
               </button>`
        }
      </div>
    </div>
  `;

  positionIndicator(container, activeRoute);

  container.querySelectorAll("[data-route]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      onNavigate(el.dataset.route);
    });
  });

  container.querySelector("#search-trigger").addEventListener("click", () => openCommandPalette(onNavigate));
  container.querySelector("#settings-trigger")?.addEventListener("click", () => onNavigate("settings"));
  container.querySelector("#collapse-toggle")?.addEventListener("click", () => {
    collapsed = !collapsed;
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    renderSidebar(container, activeRoute, onNavigate);
  });
}

function positionIndicator(container, activeRoute) {
  const nav = container.querySelector("#nav-list");
  const indicator = container.querySelector("#nav-indicator");
  const active = nav.querySelector(`[data-route="${activeRoute}"]`);
  if (!active || !indicator) return;
  indicator.style.height = `${active.offsetHeight}px`;
  indicator.style.transform = `translateY(${active.offsetTop}px)`;
}

// ============================================================================
// Command palette (⌘K) — navega entre páginas E busca tasks/rotinas/notas,
// abrindo direto no modal de edição do item (deep-link via #/rota?open=id).
// ============================================================================
let paletteOpen = false;
let searchDebounce = null;

// Páginas buscáveis no ⌘K além das 7 do menu principal (settings fica de
// fora da sidebar pra não competir visualmente com os módulos).
const PALETTE_PAGES = [...NAV_ITEMS, { route: "settings", label: "Configurações", icon: ICONS.gear }];

// Criação rápida direto da paleta — cada ação navega pra página com um
// parâmetro que ela já sabe interpretar pra abrir o modal de "novo item"
// sozinha (mesmo mecanismo do deep-link ?open=id, ver routeParams.new nas páginas).
const QUICK_ACTIONS = [
  { label: "Nova task", route: "tasks", params: { new: "1" }, icon: ICONS.tasks },
  { label: "Nova rotina", route: "rotina", params: { new: "1" }, icon: ICONS.rotina },
  { label: "Nova nota", route: "notes", params: { new: "1" }, icon: ICONS.notes },
  { label: "Nova entrada", route: "financas", params: { new: "income" }, icon: ICONS.arrowUp },
  { label: "Nova saída", route: "financas", params: { new: "expense" }, icon: ICONS.arrowDown },
];

function openCommandPalette(onNavigate) {
  if (paletteOpen) return;
  paletteOpen = true;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] p-4";
  backdrop.innerHTML = `
    <div class="modal-panel glass-panel w-full max-w-md rounded-card p-3 shadow-card">
      <input id="palette-input" type="text" placeholder="Ir para uma página, buscar tasks, rotinas, notas..."
             class="input-glass w-full px-3 py-2 text-sm mb-2" />
      <div id="palette-results" class="flex flex-col gap-1 max-h-80 overflow-y-auto"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const input = backdrop.querySelector("#palette-input");
  const results = backdrop.querySelector("#palette-results");

  function go(route, params) {
    onNavigate(route, params);
    close();
  }

  function renderGroup(title, items) {
    if (!items.length) return "";
    return `
      <div class="font-label text-[10px] text-text-lo px-3 pt-2 pb-1">${title}</div>
      ${items.join("")}
    `;
  }

  function pageResultHtml(item) {
    return `
      <button type="button" data-page="${item.route}"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-hi hover:bg-white/5 text-left w-full">
        <span class="w-[18px] h-[18px] shrink-0 [&>svg]:w-full [&>svg]:h-full">${item.icon}</span> ${item.label}
      </button>`;
  }

  function quickActionHtml(action, index) {
    return `
      <button type="button" data-quick="${index}"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-hi hover:bg-white/5 text-left w-full">
        <span class="w-[18px] h-[18px] shrink-0 [&>svg]:w-full [&>svg]:h-full">${action.icon}</span> ${action.label}
      </button>`;
  }

  function entityResultHtml({ route, id, icon, title, subtitle }) {
    return `
      <button type="button" data-entity-route="${route}" data-entity-id="${id}"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-hi hover:bg-white/5 text-left w-full">
        <span class="w-[18px] h-[18px] shrink-0 [&>svg]:w-full [&>svg]:h-full">${icon}</span>
        <span class="flex-1 min-w-0">
          <span class="block truncate">${title}</span>
          ${subtitle ? `<span class="block text-[11px] text-text-lo truncate">${subtitle}</span>` : ""}
        </span>
      </button>`;
  }

  function bindResultHandlers() {
    results.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => go(btn.dataset.page));
    });
    results.querySelectorAll("[data-entity-route]").forEach((btn) => {
      btn.addEventListener("click", () => go(btn.dataset.entityRoute, { open: btn.dataset.entityId }));
    });
    results.querySelectorAll("[data-quick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = QUICK_ACTIONS[Number(btn.dataset.quick)];
        go(action.route, action.params);
      });
    });
  }

  function renderPagesOnly(query) {
    const q = query.toLowerCase();
    const quick = QUICK_ACTIONS.map((a, i) => ({ a, i })).filter(({ a }) => a.label.toLowerCase().includes(q));
    const pages = PALETTE_PAGES.filter((i) => i.label.toLowerCase().includes(q)).map(pageResultHtml);
    const html = renderGroup("Ações rápidas", quick.map(({ a, i }) => quickActionHtml(a, i))) + renderGroup("Páginas", pages);
    results.innerHTML = html.trim() || `<div class="text-text-mid text-sm px-3 py-4">Nada encontrado.</div>`;
    bindResultHandlers();
  }

  async function renderSearch(query) {
    const q = query.toLowerCase();
    const quick = QUICK_ACTIONS.map((a, i) => ({ a, i })).filter(({ a }) => a.label.toLowerCase().includes(q));
    const pages = PALETTE_PAGES.filter((i) => i.label.toLowerCase().includes(q)).map(pageResultHtml);

    let taskItems = [];
    let routineItems = [];
    let noteItems = [];
    let goalItems = [];
    let planItems = [];
    try {
      const [tasks, notes, goals, plans] = await Promise.all([
        api.get(`/tasks?search=${encodeURIComponent(query)}`),
        api.get(`/notes?search=${encodeURIComponent(query)}`),
        // metas e planos de treino não têm busca no servidor (poucos
        // registros pra um usuário só) — filtra por título aqui mesmo.
        api.get(`/goals`),
        api.get(`/workouts/plans`),
      ]);
      taskItems = tasks
        .filter((t) => !t.is_routine)
        .slice(0, 5)
        .map((t) => entityResultHtml({ route: "tasks", id: t.id, icon: ICONS.tasks, title: t.title, subtitle: t.category }));
      routineItems = tasks
        .filter((t) => t.is_routine)
        .slice(0, 5)
        .map((t) => entityResultHtml({ route: "rotina", id: t.id, icon: ICONS.rotina, title: t.title, subtitle: t.category }));
      noteItems = notes
        .slice(0, 5)
        .map((n) => entityResultHtml({ route: "notes", id: n.id, icon: ICONS.notes, title: n.title || "(sem título)", subtitle: n.content?.slice(0, 60) }));
      goalItems = goals
        .filter((g) => g.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
        .map((g) => entityResultHtml({ route: "metas", id: g.id, icon: ICONS.metas, title: g.title, subtitle: g.status === "active" ? "Ativa" : g.status === "completed" ? "Concluída" : "Abandonada" }));
      planItems = plans
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
        .map((p) => entityResultHtml({ route: "academia", id: p.id, icon: ICONS.academia, title: p.name, subtitle: `${p.exercises?.length || 0} exercícios` }));
    } catch {
      // busca no servidor falhou — ainda mostra o resultado de páginas
    }

    const html =
      renderGroup("Ações rápidas", quick.map(({ a, i }) => quickActionHtml(a, i))) +
      renderGroup("Páginas", pages) +
      renderGroup("Tasks", taskItems) +
      renderGroup("Rotinas", routineItems) +
      renderGroup("Notas", noteItems) +
      renderGroup("Metas", goalItems) +
      renderGroup("Treinos", planItems);

    results.innerHTML = html.trim() || `<div class="text-text-mid text-sm px-3 py-4">Nada encontrado.</div>`;
    bindResultHandlers();
  }

  renderPagesOnly("");
  input.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const query = input.value.trim();
    if (!query) {
      renderPagesOnly("");
      return;
    }
    searchDebounce = setTimeout(() => renderSearch(query), 250);
  });
  input.focus();

  function close() {
    paletteOpen = false;
    clearTimeout(searchDebounce);
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKeydown);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
}

export function initGlobalSearchShortcut(onNavigate) {
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette(onNavigate);
    }
  });
}
