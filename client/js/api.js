// Helpers de acesso à API. Todo o front consome dados reais daqui — nada de mock.
import { reportConnectionFailure } from "./components/connection-banner.js";

// No desktop/dev, front e API são o mesmo servidor — "/api" relativo já
// funciona. No deploy web (front na Netlify, API noutro host), a Netlify não
// tem servidor nenhum pra responder "/api" — precisa apontar pra URL
// completa do backend. Configurável via <meta name="api-base"> no
// index.html, sem precisar mexer em JS pra cada deploy.
export const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || "/api").replace(/\/$/, "");
const BASE = API_BASE;
// origem do backend sem o "/api" final — usado pelas poucas rotas que não
// são JSON (ex.: /print/finance-report, aberta numa aba nova). Vazio no
// desktop/dev (mesma origem, path relativo já funciona).
export const API_ORIGIN = BASE.replace(/\/api$/, "");
// pistas de que um erro 500 veio do driver mysql2 tentando conectar (servidor
// de pé, banco fora do ar) — trata igual a uma falha de rede pro banner.
const DB_DOWN_PATTERN = /ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ER_ACCESS_DENIED/;
// Sessão morreu no meio do uso (cookie bloqueado pelo navegador, expirou,
// etc.) — sem isso, o usuário fica preso numa tela "autenticada" que na
// prática não consegue fazer nada, só acumulando toasts de "Não
// autenticado.". Um reload único força o boot a checar de novo e cair na
// tela de login. Exclui /auth/* pra não recarregar por causa de um login
// com senha errada, que é um 401 esperado, não sessão perdida.
let reloadingForAuth = false;

async function request(method, path, body) {
  // credentials: 'include' — no deploy web o front (Netlify) e a API (host
  // separado) ficam em domínios diferentes; sem isso o cookie de sessão
  // nunca seria enviado de volta. Inócuo no modo desktop (mesma origem).
  const opts = { method, headers: {}, credentials: "include" };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch (err) {
    reportConnectionFailure();
    throw new Error("Não foi possível conectar ao servidor. Verifique se ele está rodando.");
  }

  if (res.status === 204) return null;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = data?.error || `Erro ${res.status}`;
    if (DB_DOWN_PATTERN.test(message)) reportConnectionFailure();
    if (res.status === 401 && !path.startsWith("/auth/") && !reloadingForAuth) {
      reloadingForAuth = true;
      location.reload();
    }
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body ?? {}),
  put: (path, body) => request("PUT", path, body ?? {}),
  patch: (path, body) => request("PATCH", path, body ?? {}),
  del: (path) => request("DELETE", path),
};
