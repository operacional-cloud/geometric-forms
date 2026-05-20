type Option = { label: string; value: string; score?: number };
type Field = { id: string; type: string; options?: Option[] };

export function calculateScore(answers: Record<string, any>, fields: Field[]): number {
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
      if (opt && typeof opt.score === 'number') score += opt.score;
    }
  }
  return Math.trunc(score);
}
