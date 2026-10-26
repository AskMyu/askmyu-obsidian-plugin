/**
 * How things stand with someone (2026-10-03, the operator's decision) — the plugin's word-for-word copy of shared
 * `types/standing.ts` (the plugin imports shared types only; `tests/internal/standingParity.test.ts` holds the copy).
 * Never "health" in a note or a view — it reads as medical, and askMyu is not a health app — and never the server's
 * rating codes (NEEDS_ATTENTION…). The levels in plain words:
 *
 *   strong / thriving / good       → going well
 *   stable / fair                  → steady
 *   needs_attention                → worth a check-in
 *   at_risk / declining / deteriorating → needs some care
 *   dormant                        → quiet lately
 */

export const STANDING_LABEL = 'How things stand';

export type Standing = 'going_well' | 'steady' | 'check_in' | 'care' | 'quiet';

const BY_TIER: Record<string, Standing> = {
  strong: 'going_well',
  thriving: 'going_well',
  good: 'going_well',
  stable: 'steady',
  fair: 'steady',
  needs_attention: 'check_in',
  at_risk: 'care',
  declining: 'care',
  deteriorating: 'care',
  dormant: 'quiet',
};

export const STANDING_WORDS: Record<Standing, string> = {
  going_well: 'going well',
  steady: 'steady',
  check_in: 'worth a check-in',
  care: 'needs some care',
  quiet: 'quiet lately',
};

/** The server's tier (any case) as a level; null when unknown or absent (show nothing then). */
export function standingOf(tier: string | null | undefined): Standing | null {
  if (!tier) return null;
  return BY_TIER[tier.trim().toLowerCase()] ?? null;
}

/** "steady", "worth a check-in"… — lower case, for a sentence or a quiet line. */
export function standingWords(tier: string | null | undefined): string | null {
  const s = standingOf(tier);
  return s ? STANDING_WORDS[s] : null;
}

/** "Steady", "Worth a check-in"… — for a pill or a group's name. */
export function standingLabel(tier: string | null | undefined): string | null {
  const w = standingWords(tier);
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : null;
}
