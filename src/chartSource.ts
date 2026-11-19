/**
 * Where a chart's numbers came from (2026-10-28) — the plugin's word-for-word copy of shared `types/chartSource.ts`
 * (the plugin imports shared types only; `tests/internal/chartSourceParity.test.ts` holds the copy). The chart's
 * `data_source`, the server's sentence, shown under the chart ending with a full stop. Pure.
 */
export function chartSourceCaption(source: unknown): string | null {
  const s = typeof source === 'string' ? source.replace(/\s+/g, ' ').trim() : '';
  if (!s) return null;
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}
