/**
 * What each of a line's own choices does (2026-11-19, the operator's screen: "Drop it" beside "Don't ask again"; "Send it · Don't send"
 * beside "Not now · Don't ask again"). `act` does the thing; `way_out` closes the line without doing it; `later` sets it aside to come
 * back. From build 19 the server serves `role` on each choice; until then, this list by choice id: the backend's first cut from the ids
 * its line producers use (build 18). By id, never by wording.
 *
 * The one rule for the two quiet ways out a surface adds after a line's own choices: no "Don't ask again" when one of its choices is a
 * `way_out`; no "Not now" when one is `later`; neither on a send, whose own two choices are every answer.
 *
 * Byte copies in the terminal (`packages/cli/src/choiceRoles.ts`) and the Obsidian plugin (`packages/obsidian/src/choiceRoles.ts`), held
 * equal by a test: change all three.
 */

export type ChoiceRole = 'act' | 'way_out' | 'later';

/** A line's own "no, let it go". */
export const WAY_OUT_IDS: readonly string[] = [
  'no',
  'skip',
  'stop',
  'let_go',
  'drop',
  'dropped',
  'leave',
  'leave_out',
  'not_mine',
  'not_a_goal',
  'not_promise',
  'not_that',
  'not_on_linkedin',
  'reject',
  'none',
  'dismiss',
];

/** A line's own "not now, ask again" ("Give it another week" on a late promise, by the planning side's word, 2026-11-19). */
export const LATER_IDS: readonly string[] = ['not_now', 'later', 'hold_time', 'renegotiate'];

/** Lines whose own two choices are every answer: a send. */
export const OWN_ANSWERS_KINDS: readonly string[] = ['send', 'send_many', 'send_batch'];

/** A choice's role: the server's `role` when it sends one, else by its id; anything else does the thing. */
export function choiceRole(choice: { id?: string | null; role?: string | null } | null | undefined): ChoiceRole {
  const role = choice?.role;
  if (role === 'act' || role === 'way_out' || role === 'later') return role;
  const id = choice?.id ?? '';
  if (WAY_OUT_IDS.includes(id)) return 'way_out';
  if (LATER_IDS.includes(id)) return 'later';
  return 'act';
}

/** Which of the two quiet ways out a line gets after its own choices: `later` = "Not now", `never` = "Don't ask again". */
export function waysOutOf(line: {
  kind?: string | null;
  choices?: ReadonlyArray<{ id?: string | null; role?: string | null } | null> | null;
}): { later: boolean; never: boolean } {
  if (line.kind && OWN_ANSWERS_KINDS.includes(line.kind)) return { later: false, never: false };
  const roles = (line.choices ?? []).map((c) => choiceRole(c));
  return { later: !roles.includes('later'), never: !roles.includes('way_out') };
}
