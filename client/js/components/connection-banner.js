// Banner fixo no topo quando o servidor/banco fica inacessível — substitui
// as mensagens de erro cruas espalhadas por cada card por um aviso único e
// central, com retry automático via polling em /api/health.
import { API_BASE } from "../api.js";

let bannerEl = null;
let down = false;
let pollTimer = null;
let fastRetryTimer = null;

function ensureBanner() {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement("div");
  bannerEl.id = "connection-banner";
  bannerEl.className =
    "fixed top-0 left-0 right-0 z-[300] h-10 flex items-center justify-center gap-3 px-4 text-sm font-medium text-white translate-y-[-100%] transition-transform duration-300 ease-out";
  bannerEl.style.background = "linear-gradient(90deg, #B91C1C, #991B1B)";
  bannerEl.innerHTML = `
    <span>Sem conexão com o banco de dados. Verifique se o MySQL está rodando.</span>
    <button type="button" id="connection-retry" class="connection-banner-btn px-3 py-1 text-xs rounded-full">Tentar de novo</button>
  `;
  document.body.appendChild(bannerEl);
  bannerEl.querySelector("#connection-retry").addEventListener("click", () => checkHealth(true));
  return bannerEl;
}

function showBanner() {
  if (down) return;
  down = true;
  const el = ensureBanner();
  requestAnimationFrame(() => el.classList.remove("translate-y-[-100%]"));
  document.getElementById("shell")?.classList.add("pt-10");
  clearInterval(pollTimer);
  // enquanto down, sonda a cada 5s (mais agressivo que o polling normal de 30s)
  pollTimer = setInterval(() => checkHealth(), 5000);
}

function hideBanner() {
  if (!down) return;
  down = false;
  bannerEl?.classList.add("translate-y-[-100%]");
  document.getElementById("shell")?.classList.remove("pt-10");
  clearInterval(pollTimer);
  pollTimer = setInterval(() => checkHealth(), 30000);
}

async function checkHealth(manual = false) {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("unhealthy");
    hideBanner();
  } catch {
    showBanner();
  }
}

// Chamado pelo api.js assim que qualquer request falha por incapacidade de
// conectar — não espera o próximo tick do polling pra reagir.
export function reportConnectionFailure() {
  showBanner();
  clearTimeout(fastRetryTimer);
  fastRetryTimer = setTimeout(() => checkHealth(), 3000);
}

export function initConnectionWatcher() {
  checkHealth();
  pollTimer = setInterval(() => checkHealth(), 30000);
}
