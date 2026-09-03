/**
 * "Needs you on the canvas: …" — the one line that makes the quiet canvas row
 * honest. A tab is invisible furniture; if the canvas carries something that
 * needs an ANSWER, the row must say so (operator, 2026-08-31: "unless we make
 * it clear … they won't know what to do").
 */
import type { CompositionSpecLite } from '../wire';

export function canvasAsksLine(spec: CompositionSpecLite | null | undefined): string | null {
  const parts: string[] = [];
  let questions = 0;
  let decisions = 0;
  for (const c of spec?.components ?? []) {
    if (c.type === 'offer_block') {
      const options = (c.data as { options?: Array<{ id?: string }> } | undefined)?.options ?? [];
      parts.push(options.some((o) => (o.id ?? '').startsWith('calendar')) ? 'connect a calendar' : 'an offer to answer');
    } else if (c.type === 'decision_frame') decisions++;
    else if (c.type === 'reflection_prompt' || c.type === 'inline_chat') questions++;
  }
  if (decisions) parts.push(decisions === 1 ? 'a decision to weigh' : `${decisions} decisions to weigh`);
  if (questions) parts.push(questions === 1 ? 'a question to answer' : `${questions} questions to answer`);
  if (parts.length === 0) return null;
  return `Needs you on the canvas: ${parts.join(' \u00b7 ')}`;
}
