// Numa instalação nova do app desktop (banco embutido recém-criado pelo
// Electron em electron/main.js, sem nome definido ainda — ver
// bootstrapEmbeddedDatabase), pergunta o nome antes de mostrar o Dashboard.
// No modo web isso nunca dispara: o signup já pede o nome (ver auth-screen.js).
import { api } from "../api.js";
import { toastError } from "../components/toast.js";
import { invalidateUserName } from "../components/sidebar.js";

export async function maybeShowFirstRunName() {
  let settings;
  try {
    settings = await api.get("/settings");
  } catch {
    return; // sem conexão com a API — deixa o resto do app lidar com o erro normalmente
  }
  if (settings?.name) return false;

  const el = document.getElementById("first-run-screen");
  el.innerHTML = `
    <div class="w-full max-w-sm glass-card p-7 flex flex-col gap-5 anim-stagger-in">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="w-12 h-12 rounded-2xl glow-icon flex items-center justify-center font-bold text-lg"
             style="background:linear-gradient(160deg, #afdef5, #2d96cd); color:#ffffff;">M</div>
        <div>
          <h1 class="text-xl font-semibold text-text-hi">Bem-vindo(a) ao Marshal Organization</h1>
          <p class="text-text-mid text-xs mt-1">Como podemos te chamar?</p>
        </div>
      </div>
      <form id="first-run-form" class="flex flex-col gap-3">
        <input name="name" required maxlength="80" placeholder="Seu nome" class="input-glass px-3 py-2.5 text-sm" autofocus />
        <button type="submit" class="btn-accent px-4 py-2.5 text-sm mt-1">Começar</button>
      </form>
    </div>
  `;
  el.classList.remove("hidden");

  await new Promise((resolve) => {
    el.querySelector("#first-run-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get("name").trim();
      if (!name) return;
      const submitBtn = e.target.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        await api.put("/settings", { name });
        invalidateUserName();
        el.classList.add("hidden");
        el.innerHTML = "";
        resolve();
      } catch (err) {
        toastError(err.message);
        submitBtn.disabled = false;
      }
    });
  });
  return true;
}
