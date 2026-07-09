// Helpers de data. Tudo em YYYY-MM-DD, sem depender de timezone do Node —
// trabalhamos com componentes de data "soltos" (ano/mês/dia) o tempo todo.

function todayStr() {
  return toDateStr(new Date());
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// 0=domingo ... 6=sábado, igual à convenção usada em task_days/workout_schedule
function dayOfWeek(dateStr) {
  return parseDateStr(dateStr).getDay();
}

function daysBetween(startStr, endStr) {
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  return Math.round((end - start) / 86400000);
}

// Intervalo [from, to] (inclusive) do "mês" a que a data pertence
function monthRange(dateStr) {
  const d = parseDateStr(dateStr);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toDateStr(first), to: toDateStr(last) };
}

function previousMonthRange(dateStr) {
  const d = parseDateStr(dateStr);
  const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const last = new Date(d.getFullYear(), d.getMonth(), 0);
  return { from: toDateStr(first), to: toDateStr(last) };
}

module.exports = {
  todayStr,
  toDateStr,
  parseDateStr,
  addDays,
  dayOfWeek,
  daysBetween,
  monthRange,
  previousMonthRange,
};
