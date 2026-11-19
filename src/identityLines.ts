/**
 * One colleague is one person, where the vault draws Myu's lines (2026-11-15, BRIEF_FRONTEND_ONE_COLLEAGUE_ONE_PERSON, against the
 * backend's IMPL_BACKEND_PHASE1_20261115 §1.4). Two lines, known by shared's `identityLineOf` (the plugin's copy,
 * `personIdentities.ts`):
 *   the question ("Is tessc-gh on GitHub Tess Colleague? 3 things are waiting under that name.") → its choices as the server sends
 *     them: Yes (only with a guess) · No, someone else ("Choose who" with no guess) · Not a person · Not now. Each answers
 *     `{choice_id}`, but "No, someone else": pressed, it opens "Who is it?" and nothing is answered until a person is picked from
 *     the person's people (`{choice_id: "someone_else", relationship_id}`) or a name is typed (`{choice_id: "someone_else", text}`).
 *   the assumed tie ("Myu took tessc-gh on GitHub to be Tess Colleague, from her address on a commit. Not her?") → the claim, and
 *     "Not her?" as its change ({change: true}): it unties and puts back what came under it.
 * What the server said back is its `said` effect ("Done. 1 thing moved to Tess Colleague.") over the readback's "Okay."
 * (`saidBack`, read for every line in `lineAnswers.ts`).
 *
 * The people under "Who is it?" are the plugin's own people list (`GET /feed/entities?tab=people`, read once and kept a few minutes)
 * matched by the typed words, then whoever the server's search finds that the list leaves out (`/feed/entities/search`, as the
 * look-up does). Pure, but for the finder's reads: lines in, choices and words out.
 */

import type { AskMyuApi, EntityHeadline, MyuLineLite } from './transport/api';
import { IDENTITY_WORDS, SOMEONE_ELSE, assumedParts, identityLineOf, type IdentityLine } from './personIdentities';

/** One of the person's people, as "Who is it?" lists them. */
export interface PersonPick {
  /** The person's id, sent as `relationship_id`. */
  id: string;
  name: string;
  /** Where they work, as the look-up shows it; null when the list has nothing. */
  sub: string | null;
}

/** At most this many people under the box. */
export const PICK_SHOWN = 6;
/** How long after the last keystroke the people are looked for. */
export const PICK_WAIT_MS = 250;
/** How long the people list read for the picker is kept before it is read again. */
export const PEOPLE_FRESH_MS = 5 * 60_000;

/** The line, when it is one of the two: the question about who someone is, or the assumed tie. */
export function identityLine(line: MyuLineLite): IdentityLine | null {
  const choices = (line.choices ?? []).filter((c): c is { id: string; label?: string; readback?: string } => typeof c?.id === 'string');
  return identityLineOf({ kind: line.kind, ask_kind: line.ask_kind, choices, why: line.why ?? null, identity: line.identity ?? null });
}

export const isIdentityAsk = (line: MyuLineLite): boolean => identityLine(line)?.which === 'ask' && line.ask_kind !== 'tell' && line.ask_kind !== 'wait';
export const isIdentityAssumed = (line: MyuLineLite): boolean => identityLine(line)?.which === 'assumed' && line.ask_kind === 'assume';

/** One of the question's choices: its words, and whether it opens "Who is it?" or sits quiet ("Not now"). */
export interface IdentityChoiceShown {
  id: string;
  label: string;
  opens?: 'who';
  quiet: boolean;
}

/**
 * The question's choices: the server's own, in its order, with its words (shared's words for one of the four sent without any);
 * all four from shared's words when the server sends none. "No, someone else" opens the picker; "Not now" is the quiet way out,
 * and no other is added (the line carries its own).
 */
export function identityChoices(line: MyuLineLite): IdentityChoiceShown[] {
  const own = (line.choices ?? []).filter((c): c is { id: string; label?: string } => typeof c?.id === 'string' && c.id.length > 0);
  const hasGuess = own.some((c) => c.id === 'yes') || !!line.identity?.guess_relationship_id;
  const words = new Map<string, string>(IDENTITY_WORDS.choices(hasGuess).map((c) => [c.id, c.label]));
  const base = own.length ? own : IDENTITY_WORDS.choices(hasGuess);
  return base.map((c) => ({
    id: c.id,
    label: c.label?.trim() || words.get(c.id) || c.id,
    quiet: c.id === 'not_now',
    ...(c.id === SOMEONE_ELSE ? { opens: 'who' as const } : {}),
  }));
}

/** The assumed tie's words on the row: the claim, with "Not her?" on its button instead. Every other line: its words. */
export function lineWords(line: MyuLineLite): string {
  const text = (line.text ?? '').trim();
  return isIdentityAssumed(line) ? assumedParts(text).claim : text;
}

/** The assumed tie's change button: "Not her?", "Not him?", "Not them?" from its own words. */
export function notThemLabel(line: MyuLineLite): string {
  return assumedParts(line.text ?? '').notThem;
}

/**
 * The person's people whose name has every typed word at the start of one of its words ("tess", "tess coll"), the list's order,
 * then whoever the server found that the list leaves out; people only, each once, at most `max`.
 */
export function peopleMatching(listed: EntityHeadline[], found: EntityHeadline[], query: string, max: number = PICK_SHOWN): PersonPick[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const has = (name: string) => {
    const parts = name.toLowerCase().split(/[\s.,'’()-]+/).filter(Boolean);
    return words.every((w) => parts.some((p) => p.startsWith(w)));
  };
  const out: PersonPick[] = [];
  const seen = new Set<string>();
  for (const e of [...listed.filter((p) => has(p.display_name ?? '')), ...found]) {
    const name = e.display_name?.trim();
    if (e.entity_type !== 'person' || !e.entity_id || !name || seen.has(e.entity_id)) continue;
    seen.add(e.entity_id);
    out.push({ id: e.entity_id, name, sub: e.organization?.trim() || e.subtitle?.trim() || null });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The finder "Who is it?" asks as the person types: a moment after the last keystroke, the people list (read once, kept
 * `PEOPLE_FRESH_MS`) matched by the words, and from two letters the server's search too. A query overtaken by a newer one answers
 * nothing (the picker draws only the newest).
 */
export function peopleFinder(
  backend: () => Pick<AskMyuApi, 'listEntities' | 'searchEntities'>,
  opts: { wait?: (ms: number) => Promise<void>; now?: () => number } = {},
): (query: string) => Promise<PersonPick[]> {
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)));
  const now = opts.now ?? (() => Date.now());
  let listed: { at: number; people: EntityHeadline[] } | null = null;
  let latest = '';
  return async (query: string) => {
    const q = query.trim();
    latest = q;
    if (!q) return [];
    await wait(PICK_WAIT_MS);
    if (q !== latest) return [];
    if (!listed || now() - listed.at > PEOPLE_FRESH_MS) {
      const res = await backend().listEntities('person').catch(() => null);
      if (res?.ok && res.data) listed = { at: now(), people: res.data.entities ?? [] };
    }
    const search = q.length >= 2 ? await backend().searchEntities(q).catch(() => null) : null;
    return peopleMatching(listed?.people ?? [], search?.ok ? (search.data?.results ?? []) : [], q);
  };
}
