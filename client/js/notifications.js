// Notificações nativas (Notification API do Chromium/Electron) pras rotinas
// que têm horário definido. Roda um polling simples a cada minuto — não
// precisa de precisão de segundo, e sobrevive à troca de dia sem recarregar
// a página.
import { api } from "./api.js";
import { todayStr } from "./format.js";

export const NOTIF_ROUTINE_KEY = "momentum-notif-routine";
export const NOTIF_TASKS_KEY = "momentum-notif-tasks";

// Ambas ligadas por padrão — só desligam se o usuário explicitamente
// desmarcar em Configurações (localStorage guarda "0" nesse caso).
export function isNotifEnabled(key) {
  return localStorage.getItem(key) !== "0";
}

let notifiedIds = new Set();
let trackedDate = todayStr();
let taskDigestDate = null; // última data em que já avisamos sobre tasks vencendo

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function fireNotification(routine) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const n = new Notification("Hora da rotina 🔔", {
    body: `${routine.title}${routine.category ? " · " + routine.category : ""}`,
  });
  n.onclick = () => {
    window.focus();
    location.hash = "#/rotina";
  };
}

async function checkRoutines() {
  if (!isNotifEnabled(NOTIF_ROUTINE_KEY)) return;

  const today = todayStr();
  if (today !== trackedDate) {
    trackedDate = today;
    notifiedIds.clear();
  }

  let routines;
  try {
    routines = await api.get(`/routines/today?date=${today}`);
  } catch {
    return; // servidor fora do ar por um instante — tenta de novo no próximo tick
  }

  const nowM = nowMinutes();
  routines.forEach((r) => {
    if (!r.time_of_day || r.done || notifiedIds.has(r.id)) return;
    const routineM = timeToMinutes(r.time_of_day);
    // janela de 10min: pega o horário certo mesmo com o polling de 60s
    if (nowM >= routineM && nowM <= routineM + 10) {
      notifiedIds.add(r.id);
      fireNotification(r);
    }
  });
}

function fireTaskDigest(tasks) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const body =
    tasks.length === 1
      ? tasks[0].title
      : `${tasks
          .slice(0, 3)
          .map((t) => t.title)
          .join(", ")}${tasks.length > 3 ? ` e mais ${tasks.length - 3}` : ""}`;
  const n = new Notification(`${tasks.length} task${tasks.length === 1 ? "" : "s"} vencendo hoje 📋`, { body });
  n.onclick = () => {
    window.focus();
    location.hash = "#/tasks";
  };
}

// Aviso único por dia (não tem horário fixo — tasks só têm due_date, sem
// hora) listando o que vence hoje ou já venceu e ainda não foi concluído.
async function checkDueTasks() {
  if (!isNotifEnabled(NOTIF_TASKS_KEY)) return;

  const today = todayStr();
  if (taskDigestDate === today) return;

  let tasks;
  try {
    tasks = await api.get("/tasks?is_routine=0");
  } catch {
    return;
  }

  const due = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date <= today);
  if (!due.length) return;

  taskDigestDate = today;
  fireTaskDigest(due);
}

export function initRoutineNotifications() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
  checkRoutines();
  checkDueTasks();
  setInterval(() => {
    checkRoutines();
    checkDueTasks();
  }, 60_000);
}
