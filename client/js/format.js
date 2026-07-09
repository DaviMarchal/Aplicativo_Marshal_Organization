// Helpers de formatação de data/moeda compartilhados pelas páginas.
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayOfWeek(dateStr) {
  return parseDateStr(dateStr).getDay();
}

export function weekdayLabel(dateStr, short = false) {
  const arr = short ? WEEKDAYS_SHORT : WEEKDAYS;
  return arr[dayOfWeek(dateStr)];
}

export function formatDateLong(dateStr) {
  const d = parseDateStr(dateStr);
  return `${weekdayLabel(dateStr)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatDateShort(dateStr) {
  const d = parseDateStr(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const DAY_LABELS_SHORT = WEEKDAYS_SHORT; // índice 0=dom..6=sáb, igual ao backend
