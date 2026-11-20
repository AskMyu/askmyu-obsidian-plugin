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
  // Build 19's list (2026-11-19, the backend's `lines/ChoiceRoles`).
  'neither',
  'not_sure',
  'not_done',
  // 19b (the server's settings, every choice list): Decline, That wasn't a promise, Not me, and the rest of its way-out ids.
  'decline',
  'not_a_promise',
  'not_me',
  'not_interview',
  'not_this',
  'not_this_meeting',
  'nothing',
  'nothing_new',
  'noneed',
  'private',
  'not_finished',
];

/**
 * A line's own "not now, ask again". "Give it another week" (`renegotiate`) is not one (19b, the planning side's word): it moves the
 * promise's check date, so it does the thing, and "Not now" (rest until tomorrow) shows beside it.
 */
export const LATER_IDS: readonly string[] = ['not_now', 'later', 'hold_time', 'not_yet', 'notnow', 'decide_later', 'wait'];

/**
 * An id whose role is the line's kind's (build 19): "Keep it" closes a promise check or a full day without doing anything, and sets a
 * space's waiting aside; anywhere else it does the thing. `keep_open` and `keep_waiting` do the thing (a tell's one choice is never a way
 * out, so nothing is hidden beside it).
 */
export const ROLE_BY_KIND: Readonly<Record<string, Readonly<Record<string, ChoiceRole>>>> = {
  // "Keep it for next time" on a retro's fourth task (19b) closes the ask too.
  keep: { check_promise: 'way_out', full_day: 'way_out', space_still_waiting: 'later', todo_ask: 'way_out', prep_suggestion: 'way_out', prep_question_form: 'act' },
  // "Not yet" on a push that is ready (19b): sets it aside.
  hold: { push_ready: 'later' },
  // A goal's date passed: "Not yet" closes the ask (19b), where elsewhere it sets it aside.
  not_yet: { goal_date: 'way_out' },
  // The room's "Not done" answers the claim (19b): it does the thing.
  not_done: { room_done: 'act' },
};

/** Lines whose own two choices are every answer: a send. */
export const OWN_ANSWERS_KINDS: readonly string[] = ['send', 'send_many', 'send_batch'];

/** A choice's role: the server's `role` when it sends one, else by the line's kind and its id, else by its id; anything else does the thing. */
export function choiceRole(choice: { id?: string | null; role?: string | null } | null | undefined, kind?: string | null): ChoiceRole {
  const role = choice?.role;
  if (role === 'act' || role === 'way_out' || role === 'later') return role;
  const id = choice?.id ?? '';
  const byKind = kind ? ROLE_BY_KIND[id]?.[kind] : undefined;
  if (byKind) return byKind;
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
  const roles = (line.choices ?? []).map((c) => choiceRole(c, line.kind));
  return { later: !roles.includes('later'), never: !roles.includes('way_out') };
}
