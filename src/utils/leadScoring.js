/**
 * Calcula o lead_score somando os scores das opções escolhidas em campos do
 * tipo radio/checkbox/select.
 *
 * Regras:
 *   - Apenas campos com array `options` contribuem.
 *   - Em radio/select: answer é uma string com o `value` selecionado.
 *   - Em checkbox: answer é um array de `value`s.
 *   - Cada option pode ter `score` (number). Falta de score = 0.
 *
 * @param {Record<string, any>} answers - { [field.id]: value | value[] }
 * @param {Array<object>} fields - schema de campos do form
 * @returns {number} score total (inteiro)
 */
export function calculateScore(answers, fields) {
  if (!answers || typeof answers !== 'object') return 0;
  if (!Array.isArray(fields)) return 0;

  let score = 0;

  for (const field of fields) {
    const answer = answers[field.id];
    if (answer === undefined || answer === null || answer === '') continue;
    if (!Array.isArray(field.options) || field.options.length === 0) continue;

    const selected = Array.isArray(answer) ? answer : [answer];
    for (const value of selected) {
      const opt = field.options.find((o) => String(o.value) === String(value));
      if (opt && typeof opt.score === 'number') {
        score += opt.score;
      }
    }
  }

  return Math.trunc(score);
  // TODO futuro: pesos por campo, multiplicadores, regras compostas (E/OU entre campos)
}
