/**
 * Picking several, and a typed name, on a line (2026-10-03; BRIEF_WEB_MAIL_FIRST_SYNC_20261002 §1 and the backend's
 * first-sync tuning). The "About you" question: the first half ("who do you report to?") has a few people, "Someone
 * else" (`typed: "someone_else"` on the line — the answer carries `text`) and "No one"; the second half ("who reports
 * to you? Pick everyone who does.") carries `select: "many"` and `send: "done"`: the people are toggles, "That's
 * everyone" sends the picks together (`{choice_id: "done", choice_ids: [...]}`), and a typed "Someone else" rides
 * with them (`text`). "No one reports to me" answers as a single choice. The CEO's first half uses the same pieces.
 *
 * The web, the phone and the terminal take these rules from `@askmyu/shared` (`types/pickMany.ts`). The plugin may
 * not: only TYPES cross its boundary, because the public mirror has no workspace to resolve shared code against. So
 * the helpers the pane uses are copied here word for word, typed against the vendored wire shapes under shared's
 * names, and `tests/internal/pickManyParity.test.ts` (monorepo-only) holds them to shared's, source and behaviour.
 */

import type { SpaceAnswer as LineAnswer, SpaceAsk as MyuLine, SpaceChoice as LineChoice } from './wire';

// ── the copies (shared `types/pickMany.ts`, word for word) ───────────────────

/** A line's choices and how each answers (the ids the quiet ways out add are not among a line's own choices). */
export interface PickManyParts {
  /** The toggles: a person each (id = relationship id). */
  picks: LineChoice[];
  /** The send choice ("That's everyone"); null on a line that is not pick-many. */
  send: LineChoice | null;
  /** "Someone else": the typed name goes with the answer. */
  typed: LineChoice | null;
  /** Answered alone, as any choice ("No one reports to me"). */
  singles: LineChoice[];
}

/**
 * A choice answered alone on a pick-many line. The server says so by a readback of its own (choices on the wire carry
 * none today); "no_one" always is, and "not_sure" (2026-10-04, the structure picks: "Who else reports to Hannah?") too.
 */
export const SINGLE_CHOICE_IDS = ['no_one', 'not_sure'] as const;

export const PICK_MANY_WORDS = {
  typedPlaceholder: 'Type their name',
  typedHint: 'Type their name, then send.',
  pickFirst: 'Pick someone first, or type a name.',
} as const;

export function isPickMany(line: { select?: string | null } | null | undefined): boolean {
  return line?.select === 'many';
}

/** The choice that takes a typed name, when the line has one ("Someone else"). */
export function typedChoiceOf(line: Pick<MyuLine, 'typed' | 'choices'> | null | undefined): LineChoice | null {
  if (!line?.typed) return null;
  return (line.choices ?? []).find((c) => c.id === line.typed) ?? null;
}

/**
 * The box's words while it takes the typed answer: the line's own when it sends them (2026-10-04, the placing pick:
 * "Type who they are to Hannah." — the answer is who they are, not a name), else "Type their name".
 */
export function typedHint(line: { typed_hint?: string | null } | null | undefined): string {
  return line?.typed_hint?.trim() || PICK_MANY_WORDS.typedPlaceholder;
}

/** A pick-many line's parts. On any other line: every choice a single, no send, the typed one apart. */
export function pickManyParts(line: Pick<MyuLine, 'select' | 'send' | 'typed' | 'choices'> | null | undefined): PickManyParts {
  const choices = line?.choices ?? [];
  const typed = typedChoiceOf(line);
  const rest = choices.filter((c) => c.id !== typed?.id);
  if (!isPickMany(line)) return { picks: [], send: null, typed, singles: rest };
  const sendId = line?.send ?? 'done';
  const send = rest.find((c) => c.id === sendId) ?? null;
  const singles = rest.filter((c) => c.id !== sendId && ((SINGLE_CHOICE_IDS as readonly string[]).includes(c.id) || !!c.readback?.trim()));
  const picks = rest.filter((c) => c.id !== sendId && !singles.includes(c));
  return { picks, send, typed, singles };
}

/** The send is ready: something picked, or a name typed. */
export function canSendPicks(picked: readonly string[], typedText?: string | null): boolean {
  return picked.length > 0 || !!typedText?.trim();
}

/** The answer "That's everyone" sends: the picks together, and the typed name when there is one. */
export function pickManyAnswer(line: Pick<MyuLine, 'select' | 'send' | 'typed' | 'choices'>, picked: readonly string[], typedText?: string | null): LineAnswer {
  const parts = pickManyParts(line);
  const ids = parts.picks.map((c) => c.id).filter((id) => picked.includes(id));
  const text = typedText?.trim();
  return { choice_id: parts.send?.id ?? line.send ?? 'done', choice_ids: ids, ...(text ? { text } : {}) };
}

/** The answer a typed "Someone else" sends on a single-choice line: the choice and the name. */
export function typedAnswer(line: Pick<MyuLine, 'typed' | 'choices'>, text: string): LineAnswer | null {
  const typed = typedChoiceOf(line);
  const t = text.trim();
  return typed && t ? { choice_id: typed.id, text: t } : null;
}

/** Toggle one pick. */
export function togglePick(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
}
