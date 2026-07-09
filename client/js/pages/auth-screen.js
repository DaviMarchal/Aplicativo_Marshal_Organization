// Tela de login/cadastro do modo web (MULTI_USER=true). Renderizada direto
// em #auth-screen por app.js — não passa pelo router de páginas porque
// precisa existir ANTES de sabermos se há sessão válida.
import { api } from "../api.js";
import { toastError } from "../components/toast.js";
import { checkAuth } from "../auth.js";

function formHtml(mode) {
  const isSignup = mode === "signup";
  return `
    <div class="w-full max-w-sm glass-card p-7 flex flex-col gap-5 anim-stagger-in">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="w-12 h-12 rounded-2xl glow-icon flex items-center justify-center font-bold text-lg"
             style="background:linear-gradient(160deg, #afdef5, #2d96cd); color:#ffffff;">M</div>
        <div>
          <h1 class="text-xl font-semibold text-text-hi">Marshal Organization</h1>
          <p class="text-text-mid text-xs mt-1">${isSignup ? "Crie sua conta para começar." : "Entre na sua conta."}</p>
        </div>
      </div>

      <form id="auth-form" class="flex flex-col gap-3">
        ${isSignup ? `<input name="name" required maxlength="80" placeholder="Seu nome" class="input-glass px-3 py-2.5 text-sm" />` : ""}
        <input name="email" type="email" required maxlength="255" placeholder="E-mail" class="input-glass px-3 py-2.5 text-sm" />
        <input name="password" type="password" required minlength="8" placeholder="Senha (mín. 8 caracteres)" class="input-glass px-3 py-2.5 text-sm" />
        <button type="submit" class="btn-accent px-4 py-2.5 text-sm mt-1">${isSignup ? "Criar conta" : "Entrar"}</button>
      </form>

      <p class="text-center text-xs text-text-mid">
        ${isSignup ? "Já tem uma conta?" : "Ainda não tem conta?"}
        <button type="button" id="auth-switch" class="text-accent hover:underline">${isSignup ? "Entrar" : "Criar conta"}</button>
      </p>
    </div>
  `;
}

export function renderAuthScreen(onAuthenticated) {
  const el = document.getElementById("auth-screen");
  let mode = "login";

  function paint() {
    el.innerHTML = formHtml(mode);
    el.querySelector("#auth-switch").addEventListener("click", () => {
      mode = mode === "login" ? "signup" : "login";
      paint();
    });
    el.querySelector("#auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      const submitBtn = e.target.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        await api.post(mode === "signup" ? "/auth/signup" : "/auth/login", payload);
        await checkAuth();
        onAuthenticated();
      } catch (err) {
        toastError(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  paint();
  el.classList.remove("hidden");
}

export function hideAuthScreen() {
  document.getElementById("auth-screen").classList.add("hidden");
}
