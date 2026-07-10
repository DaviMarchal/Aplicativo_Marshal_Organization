// Router hash-based (SPA sem framework) + shell (sidebar/header) + tema.
import { renderSidebar, initGlobalSearchShortcut, NAV_ITEMS } from "./components/sidebar.js";
import { attachRippleAll } from "./components/card.js";
import { initRoutineNotifications } from "./notifications.js";
import { initConnectionWatcher } from "./components/connection-banner.js";
import { checkAuth } from "./auth.js";
import { renderAuthScreen, hideAuthScreen } from "./pages/auth-screen.js";
import { maybeShowFirstRunName } from "./pages/first-run.js";

const appEl = document.getElementById("app");
const sidebarEl = document.getElementById("sidebar");
const headerEl = document.getElementById("page-header");
const sidebarBackdropEl = document.getElementById("sidebar-backdrop");

// Sidebar-drawer em telas pequenas (< md) — em telas maiores essas classes
// não fazem efeito nenhum (md:translate-x-0 do index.html sempre vence).
function openMobileSidebar() {
  sidebarEl.classList.remove("-translate-x-full");
  sidebarEl.classList.add("translate-x-0");
  sidebarBackdropEl.classList.remove("hidden");
}
function closeMobileSidebar() {
  sidebarEl.classList.add("-translate-x-full");
  sidebarEl.classList.remove("translate-x-0");
  sidebarBackdropEl.classList.add("hidden");
}
document.getElementById("menu-toggle").addEventListener("click", openMobileSidebar);
sidebarBackdropEl.addEventListener("click", closeMobileSidebar);

const routeTitles = {
  ...Object.fromEntries(NAV_ITEMS.map((i) => [i.route, i.label])),
  settings: "Configurações",
};

const pageLoaders = {
  dashboard: () => import("./pages/dashboard.js"),
  rotina: () => import("./pages/rotina.js"),
  tasks: () => import("./pages/tasks.js"),
  financas: () => import("./pages/financas.js"),
  notes: () => import("./pages/notes.js"),
  metas: () => import("./pages/metas.js"),
  academia: () => import("./pages/academia.js"),
  settings: () => import("./pages/settings.js"),
};

// Hash suporta parâmetros: #/tasks?open=42 — usado pelo deep-link da busca
// (⌘K) pra abrir direto o modal de edição de um item encontrado.
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [route, queryString] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(queryString || ""));
  return { route: pageLoaders[route] ? route : "dashboard", params };
}

export function setHeader(html) {
  headerEl.innerHTML = html;
  attachRippleAll(headerEl);
}

function defaultHeader(route) {
  return `
    <div class="flex items-center justify-between anim-stagger-in">
      <div>
        <div class="font-label text-[11px] text-text-mid mb-1">${routeTitles[route] || ""}</div>
        <h1 class="text-2xl font-semibold text-text-hi">${routeTitles[route] || ""}</h1>
      </div>
      ${themeToggleHtml()}
    </div>
  `;
}

export function themeToggleHtml() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  return `
    <button type="button" id="theme-toggle" class="btn-ghost w-10 h-10 rounded-full flex items-center justify-center text-lg" title="Alternar tema">
      ${isLight ? "☀" : "☾"}
    </button>
  `;
}

function bindThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    localStorage.setItem("momentum-theme", next);
    const label = document.getElementById("theme-toggle");
    if (label) label.textContent = next === "light" ? "☀" : "☾";
  });
}

async function navigate(route, params = {}) {
  closeMobileSidebar();
  if (!pageLoaders[route]) route = "dashboard";
  const qs = new URLSearchParams(params).toString();
  const targetHash = `#/${route}${qs ? `?${qs}` : ""}`;
  if (location.hash !== targetHash) {
    location.hash = targetHash;
    return; // o hashchange vai disparar renderRoute de novo
  }
  await renderRoute(route, params);
}

// Navegar rápido (ou o ⌘K/sidebar disparando duas vezes) inicia um
// renderRoute() novo antes do anterior terminar de resolver suas chamadas
// assíncronas. Sem essa "trava", a página antiga — ao finalmente terminar —
// sobrescrevia o conteúdo da página nova (inclusive substituindo tudo por
// "Não foi possível carregar esta página" se ela tivesse dado erro), e cada
// função de carregamento dela tentava atualizar elementos que já não existem
// mais no DOM, disparando uma enxurrada de toasts de erro. renderToken
// garante que só a navegação mais recente tem permissão de mexer no shell.
let renderToken = 0;

async function renderRoute(route, params = {}) {
  const myToken = ++renderToken;
  const isCurrent = () => myToken === renderToken;

  renderSidebar(sidebarEl, route, navigate);

  if (appEl.dataset.rendered) {
    appEl.classList.add("route-fade-out");
    await new Promise((r) => setTimeout(r, 140));
  }
  if (!isCurrent()) return;

  headerEl.innerHTML = defaultHeader(route);
  bindThemeToggle();

  appEl.innerHTML = `<div class="anim-stagger-in grid grid-cols-1 gap-4"><div class="skeleton h-32 w-full"></div></div>`;
  appEl.dataset.rendered = "1";
  appEl.classList.remove("route-fade-out");

  try {
    const mod = await pageLoaders[route]();
    if (!isCurrent()) return;
    await mod.render(appEl, {
      setHeader: (html) => {
        if (!isCurrent()) return;
        setHeader(html);
        bindThemeToggle();
      },
      params,
      isCurrent,
    });
  } catch (err) {
    if (!isCurrent()) return; // renderização antiga que falhou depois que já navegamos pra outro lugar — ignora
    console.error(err);
    appEl.innerHTML = `<div class="glass-card p-8 text-center text-text-mid">Não foi possível carregar esta página. ${err.message || ""}</div>`;
  }
}

async function boot() {
  window.addEventListener("hashchange", () => {
    const { route, params } = parseHash();
    renderRoute(route, params);
  });
  initGlobalSearchShortcut(navigate);
  initRoutineNotifications();
  initConnectionWatcher();
  const { route, params } = parseHash();
  await renderRoute(route, params);
  const named = await maybeShowFirstRunName();
  if (named) await renderRoute(route, params);
}

function init() {
  const savedTheme = localStorage.getItem("momentum-theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

  checkAuth().then((user) => {
    if (user) {
      boot().finally(hideBootSplash);
    } else {
      // sem sessão válida — só acontece no modo web (MULTI_USER=true); no
      // modo desktop /api/auth/me sempre resolve pro usuário 1 sem login.
      hideBootSplash();
      renderAuthScreen(() => {
        hideAuthScreen();
        boot();
      });
    }
  });
}

function hideBootSplash() {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  splash.classList.add("splash-hidden");
  splash.addEventListener("transitionend", () => splash.remove(), { once: true });
}

init();
