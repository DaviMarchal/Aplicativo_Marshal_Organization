// Lógica compartilhada de recorrência (rotina / task recorrente / treino):
// "aparece todo dia segundo os dias agendados" + cálculo de streak (dias
// consecutivos concluídos, olhando só os dias em que o item estava agendado).
const { addDays, dayOfWeek } = require("./dates");

const MAX_STREAK_LOOKBACK_DAYS = 730; // trava de segurança (~2 anos)

/**
 * Calcula o streak de um item recorrente.
 * @param {Set<string>} completedDates - datas (YYYY-MM-DD) em que o item foi concluído
 * @param {Set<number>} scheduledDays - dias da semana (0=dom..6=sáb) em que o item ocorre
 * @param {string} fromDate - data de referência (normalmente hoje), YYYY-MM-DD
 */
function computeStreak(completedDates, scheduledDays, fromDate) {
  if (!scheduledDays || scheduledDays.size === 0) return 0;

  let streak = 0;
  let cursor = fromDate;

  for (let i = 0; i < MAX_STREAK_LOOKBACK_DAYS; i++) {
    const isScheduled = scheduledDays.has(dayOfWeek(cursor));
    if (isScheduled) {
      if (completedDates.has(cursor)) {
        streak++;
      } else {
        // Se for hoje e ainda não foi marcado, não quebra o streak — só não conta ainda.
        if (cursor === fromDate) {
          cursor = addDays(cursor, -1);
          continue;
        }
        break;
      }
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

module.exports = { computeStreak };
