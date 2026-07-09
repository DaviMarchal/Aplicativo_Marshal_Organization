// Estado de autenticação — usado tanto no boot (app.js decide shell vs tela
// de login) quanto pelas Configurações (mostrar/esconder "Sair" e o backup
// completo, que só existe no modo desktop). No modo desktop, /api/auth/me
// sempre responde 200 com multiUser:false (sem sessão de verdade nenhuma) —
// ver requireAuth em server/middleware/auth.js.
import { api } from "./api.js";

let currentUser = null;

export async function checkAuth() {
  try {
    currentUser = await api.get("/auth/me");
  } catch {
    currentUser = null;
  }
  return currentUser;
}

export function getCurrentUser() {
  return currentUser;
}

export function isMultiUser() {
  return !!currentUser?.multiUser;
}

export async function logout() {
  await api.post("/auth/logout");
  currentUser = null;
  location.reload();
}
