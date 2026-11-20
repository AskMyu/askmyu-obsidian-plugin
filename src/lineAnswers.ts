/**
 * Myu's questions outside a space, answered with a tap (2026-09-25).
 *
 * The Today pane and a person's chat drew a question as text you answer by typing, so its
 * "One tap to answer." promised something the vault could not do. Now the line's choices are
 * buttons, as the web's line row draws them (`web/src/components/lines/MyuLineRow.tsx`), one rule
 * per kind of ask:
 *   tell   → the words, nothing to press
 *   wait   → the words, quiet, nothing to press
 *   assume → the claim, and "Change" when it can be changed ({change: true})
 *   yes_no → its choices, or Yes / No ({yes}), then the two quiet ways out
 *   (R19c: "Not now" {later: true} rests until tomorrow, "Don't ask again" {dismiss: true} closes it;
 *    a line with its own way out, "Leave it" or its own "Not now", keeps only its own)
 *   choice → its choices ({choice_id}; a fourth "Leave it" sits quiet), then the two quiet ways out,
 *            by the one rule in `choiceRoles.ts` (mirror of shared `quietWaysOut`)
 *   what else falls on that day (2026-11-13, kind `full_day`) → Keep · Move it · Not a promise, nothing else; "Move it" asks
 *            "Which day?" first and answers {choice_id: "move", day} (`opens: 'day'`; the pane draws the days)
 *   "Add it?" (2026-11-13, kinds `answer_bears_on`, `report_bears_on`) → Add it · No, nothing else
 *   (both the server's own choices, else the contract's words; `lastMomentsVault.ts`)
 *   a promise someone else's decision affects (2026-11-13, kind `check_promise`) → Tell <name> · Let it go · Keep it, nothing else
 *            (the server's own, else shared's words; `checkPromise.ts`); Tell's message comes back as an effect, shown with Copy
 *   the question about who someone is (2026-11-15, `identity_ask`, or its evidence until the kind is served) → its choices as the
 *            server sends them (Yes · No, someone else · Not a person · Not now), nothing else; "No, someone else" opens "Who is
 *            it?" first and answers {choice_id: "someone_else", relationship_id} or {…, text} (`opens: 'who'`; the pane draws it)
 *   the assumed tie (2026-11-15, `identity_assumed`) → the claim, and "Not her?" as its change ({change: true}) (`identityLines.ts`)
 * What the server said back: its `said` effect when the answer carries one (2026-11-15), else the readback. When that effect carries
 * a `move_id` (the follow-up: "Yes", "Choose who", "Not her?"), the press says so (`undo`), and the pane offers Undo beside the
 * sentence. A question about who someone is that was closed elsewhere (409 `line_closed`) keeps its words with "Already answered."
 * in place of its buttons.
 * The answer goes to the same door as everywhere (`POST /myu/lines/answer`). A space's lines are
 * not drawn this way: they are answered in the space's own conversation, one at a time.
 *
 * Everything here is pure: lines and answers in, buttons, words and links out. The panes draw it.
 */

import type { ApiResponse } from './transport';
import type { MyuLineLite } from './transport/api';
import type { SpaceAnswer, SpaceAnswerReply, SpaceChoice, SpaceEffect } from './wire';
import { isPickMany, typedChoiceOf } from './pickMany';
import { isAsk, layoutChoices, readbackText } from './spaceModeLogic';
import { isBearsOnLine, isFullDayLine } from './lastMoments';
import { answerDraftOf, bearsOnChoices, fullDayChoices } from './lastMomentsVault';
import { CHECK_PROMISE_CHOICES, isCheckPromiseLine } from './checkPromise';
import { OWN_ANSWERS_KINDS, waysOutOf } from './choiceRoles';
import { identityChoices, identityLine, isIdentityAsk, isIdentityAssumed, notThemLabel } from './identityLines';
import { IDENTITY_WORDS, saidBack, saidMoveId } from './personIdentities';

/** The words the vault owns here; the web's own words for the same buttons and notes. */
export const LINE_ANSWER_WORDS = {
  /** Someone signing in (2026-11-11): the key goes from a device that holds it, never from a line's button here. */
  newDevice: 'Answer this in Myu in your browser: it shows the number to compare.',
  yes: 'Yes',
  no: 'No',
  /** The two quiet ways out (mirror of shared `WAY_OUT_WORDS`). */
  later: 'Not now',
  never: "Don't ask again",
  change: 'Change',
  /** A calendar provider's consent opened in the browser (the hold). */
  consentOpened: 'Allow calendar access once, then choose Hold again.',
  /** invite_ready with a file beside the provider's compose. */
  inviteReady: 'The calendar invite is ready. Using Apple Calendar or another app?',
  inviteFile: 'Download the invite file',
  /** invite_ready with no file: the compose opened in the browser. */
  inviteReadyNoFile: 'The invite is ready in your calendar. Send it from there and Myu will record the commitment.',
  /** invite_sent: Myu sent it; the event's own page. */
  openEvent: 'Open it in your calendar',
  failed: 'Could not send this to Myu. Try again in a moment.',
  offline: "You're offline. Try again when you're back online.",
  /** R19: a message Myu wrote for the person to send themselves (mirror of shared `DRAFT_WORDS`). */
  copy: 'Copy it',
  copied: 'Copied',
  copyFailed: 'It did not copy. Select the message and copy it yourself.',
  draftLink: 'Open the link',
  /** "Myu has no connection with Ana" answered Invite (2026-11-13): the invitation carries the question only with its id. */
  inviteWithQuestion: (who: string, questionId: string | null) =>
    `To send the invitation${questionId ? ' with your question' : ''}, in the terminal: myu invite ${/\s/.test(who) ? `"${who}"` : who}${questionId ? ` --question ${questionId}` : ''}`,
} as const;

/** R19 `draft_ready`: the message, and the link it is about ("Open the pull request"). Nothing is sent. */
export interface LineDraft {
  text: string;
  url?: string;
  /** The link's label; `LINE_ANSWER_WORDS.draftLink` when the effect names none. */
  label: string;
  to_name?: string;
  /** The line over the message (2026-11-13): "Myu's message to Priya:" after Move it, "To prd-review in Slack" after Add it. */
  lead?: string;
  /** What must be seen with it, under the box (2026-11-19): "I can't send mail for you yet.", "To Carla Diaz at carla@…". */
  must_see?: string[];
  /** A send line's own "Copy it" (2026-11-19): the words go to the clipboard as the box opens, and its button reads "Copied". */
  copyAtOpen?: boolean;
}

export interface LineButton {
  /** The choice id, `later` for Not now, `dismiss` for Don't ask again, `change` for Change. */
  id: string;
  label: string;
  answer: SpaceAnswer;
  /** The quiet way out (Skip, Not now, Leave it): drawn as quiet text, not a button. */
  quiet: boolean;
  /**
   * "Move it" on a full-day line (2026-11-13): pressed, it opens "Which day?" and nothing is answered; the day picked there answers it
   * (`moveAnswer`, with the day in `answer.day`). "No, someone else" on the question about who someone is (2026-11-15, `who`): it
   * opens "Who is it?"; the person picked or the name typed there answers it (`someoneElseAnswer`).
   */
  opens?: 'day' | 'who';
}

const known = (choices: MyuLineLite['choices']): SpaceChoice[] =>
  (choices ?? [])
    .filter((c): c is SpaceChoice => typeof c?.id === 'string' && c.id.length > 0)
    .map((c) => ({ id: c.id, label: c.label?.trim() || c.id, ...(c.readback?.trim() ? { readback: c.readback } : {}) }));

/**
 * The "About you" question (2026-10-03): a line that takes several picks (`select: "many"`), or a typed name
 * ("Someone else", `typed`), is answered in its conversation, in the pane — a row's single-press buttons would be
 * wrong for it (several picks need toggles and a send; a name needs the box). Its row shows the words; its door
 * opens the pane.
 */
export function answersInConversation(line: Pick<MyuLineLite, 'ask_kind' | 'select' | 'typed' | 'choices'>): boolean {
  if (!isAsk(line)) return false;
  return isPickMany(line) || typedChoiceOf({ typed: line.typed, choices: known(line.choices) }) !== null;
}

/** The quiet ways out after a question's own buttons (mirror of shared `quietWaysOut`), by the one rule in `choiceRoles.ts`. */
export function quietWaysOut(line: Pick<MyuLineLite, 'choices'> & { kind?: string | null }): LineButton[] {
  const w = waysOutOf(line);
  const out: LineButton[] = [];
  if (w.later) out.push({ id: 'later', label: LINE_ANSWER_WORDS.later, answer: { later: true }, quiet: true });
  if (w.never) out.push({ id: 'dismiss', label: LINE_ANSWER_WORDS.never, answer: { dismiss: true }, quiet: true });
  return out;
}

/**
 * The invitation to connect, as a line (2026-11-12): "{inviter} invites you to connect on askMyu." with Accept and Not now. The kinds
 * mirror shared `invites.ts` CONNECT_LINE_KINDS (held equal by a test); a line with no kind is known by its words.
 */
export const CONNECT_LINE_KINDS = ['connect_invite', 'invite_connect', 'connect_invitation', 'invitation_connect'] as const;
export function isConnectLine(line: Pick<MyuLineLite, 'kind' | 'text'>): boolean {
  if (line.kind) return (CONNECT_LINE_KINDS as readonly string[]).includes(line.kind);
  return /invites you to connect on askMyu\b/.test((line.text ?? '').trim());
}

/** The sentences a line carries beside its words (the Friday line's, one per count), none its words already hold. */
export function lineSentences(line: MyuLineLite): string[] {
  const raw = (line as { sentences?: unknown }).sentences;
  const text = line.text ?? '';
  return (Array.isArray(raw) ? raw : []).filter((x): x is string => typeof x === 'string' && !!x.trim() && !text.includes(x.trim())).map((x) => x.trim());
}

/** The buttons a line gets in the vault, kind by kind, as the web draws them. */
export function lineButtons(line: MyuLineLite): LineButton[] {
  // Someone signing in: the line's Approve would only close it on the server, so it offers no button here (see `renderLineAsk`).
  if (line.kind === 'new_device') return [];
  // An invitation to connect: the server's own two, Accept and Not now, and no other way out.
  if (isConnectLine(line)) return known(line.choices).map((c) => ({ id: c.id, label: c.label, answer: { choice_id: c.id }, quiet: c.id === 'not_now' }));
  // Who someone is (2026-11-15): the question's own choices and no other way out; the assumed tie's change is "Not her?".
  if (isIdentityAsk(line)) return identityChoices(line).map((c) => ({ id: c.id, label: c.label, answer: { choice_id: c.id }, quiet: c.quiet, ...(c.opens ? { opens: c.opens } : {}) }));
  if (isIdentityAssumed(line)) return line.assumed?.changeable ? [{ id: 'change', label: notThemLabel(line), answer: { change: true }, quiet: false }] : [];
  // What else falls on that day, and "Add it?" (2026-11-13): the person's own to answer, with their own choices and no other way out,
  // as the web and the terminal draw them. A tell, a wait or an assume of these kinds is drawn as every one is.
  if (isAsk(line) && line.ask_kind !== 'assume' && (isFullDayLine(line) || isBearsOnLine(line) || isCheckPromiseLine(line))) {
    // A promise someone else's decision affects: its three choices drawn as every choice line's are, then the quiet ways out by the one
    // rule (2026-11-19: the same as a check line's, on every surface).
    if (isCheckPromiseLine(line)) {
      const own = known(line.choices);
      const chosen = own.length ? own : CHECK_PROMISE_CHOICES.map((c) => ({ id: c.id, label: c.label }));
      return [...chosen.map((c) => ({ id: c.id, label: c.label, answer: { choice_id: c.id }, quiet: false })), ...quietWaysOut({ ...line, choices: chosen })];
    }
    const answerFor = (id: string): SpaceAnswer => (line.ask_kind === 'yes_no' && (id === 'yes' || id === 'no') ? { yes: id === 'yes' } : { choice_id: id });
    if (isFullDayLine(line)) {
      return fullDayChoices(line).map((c) => ({ id: c.id, label: c.label, answer: answerFor(c.id), quiet: false, ...(c.role === 'move' ? { opens: 'day' as const } : {}) }));
    }
    return bearsOnChoices(line).map((c) => ({ id: c.id, label: c.label, answer: answerFor(c.id), quiet: c.role === 'no' }));
  }
  switch (line.ask_kind) {
    case 'tell':
      // A tell that carries choices of its own (2026-11-19: Myu's "closed it" line, "Not so, keep it open"; a team's "Open ‹team›"):
      // those, quiet, and nothing else. A tell without any has none.
      return known(line.choices).map((c) => ({ id: c.id, label: c.label, answer: { choice_id: c.id }, quiet: true }));
    case 'wait':
      return [];
    case 'assume':
      return line.assumed?.changeable ? [{ id: 'change', label: LINE_ANSWER_WORDS.change, answer: { change: true }, quiet: false }] : [];
    case 'yes_no': {
      const offered = known(line.choices);
      const base = offered.length ? offered : [{ id: 'yes', label: LINE_ANSWER_WORDS.yes }, { id: 'no', label: LINE_ANSWER_WORDS.no }];
      return [
        ...base.map((c) =>
          c.id === 'yes' || c.id === 'no'
            ? { id: c.id, label: c.label, answer: { yes: c.id === 'yes' }, quiet: false }
            : { id: c.id, label: c.label, answer: { choice_id: c.id }, quiet: false },
        ),
        ...quietWaysOut(line),
      ];
    }
    default: {
      if (!isAsk(line)) return [];
      // Several picks, or a typed name: no buttons on the row; the row's door opens the pane, where they are answered.
      if (answersInConversation(line)) return [];
      const laid = layoutChoices(known(line.choices));
      if (laid.choices.length === 0 && !laid.quiet) return [];
      const out: LineButton[] = laid.choices.map((c) => ({ id: c.id, label: c.label, answer: { choice_id: c.id }, quiet: false }));
      if (laid.quiet) out.push({ id: laid.quiet.id, label: laid.quiet.label, answer: { choice_id: laid.quiet.id }, quiet: true });
      out.push(...quietWaysOut(line));
      return out;
    }
  }
}

/** A tap answers it: one of its buttons settles it. */
export function tapAnswers(line: MyuLineLite): boolean {
  return lineButtons(line).some((b) => !b.quiet);
}

/**
 * Whether the line's estimate is shown. "One tap to answer." only where a tap answers it; an
 * estimate that promises no tap ("About two minutes.", a talk) stays, as it is still true here.
 */
export function showEstimate(line: MyuLineLite): boolean {
  if (!line.est?.trim() || !isAsk(line)) return false;
  return tapAnswers(line) || !/\btap\b/i.test(line.est);
}

/**
 * A meeting's line that is a question (the one before it, the arc, "Anything you didn't say in
 * there?", the Yes/No after it) is answered in the meeting's own conversation, where typed words
 * are the answer (2026-09-30). The occurrence to open it at: the line's own, else the row's. Null
 * when the line is not a question about a meeting (a tell, a wait, another subject).
 */
export function meetingQuestionAt(line: MyuLineLite | null | undefined, rowOccurrence?: string): { occurrenceKey?: string } | null {
  if (!line || !isAsk(line)) return null;
  const meeting = (line.subjects ?? []).find((s) => s.type === 'meeting');
  const onMeeting = line.conversation?.subject_type === 'meeting' || (!line.conversation?.subject_type && !!meeting);
  if (!onMeeting) return null;
  const occurrenceKey = line.conversation?.occurrence_key || meeting?.occurrence_key || rowOccurrence;
  return occurrenceKey ? { occurrenceKey } : {};
}

/** A link to show under a line after its answer. */
export interface LineLink {
  /** A sentence before the link, or none. */
  text?: string;
  label: string;
  url: string;
}

/** A conversation an answer asks to open (`open_conversation`: the meeting's, after the arc's Now). */
export interface LineConversation {
  subject_type: string;
  subject_id: string;
  occurrence_key?: string;
}

export type LineEffectAction =
  | { kind: 'open'; url: string }
  | { kind: 'note'; text: string }
  | { kind: 'link'; link: LineLink }
  | { kind: 'draft'; draft: LineDraft }
  | { kind: 'conversation'; conversation: LineConversation };

const trimBase = (apiBase: string) => apiBase.replace(/\/+$/, '');

/**
 * What an answer's effects ask the vault to do, as the web's `handleLineEffects` does:
 *   consent_needed (a calendar provider's) → open its consent page in the browser, and say the hold's words;
 *   invite_ready → open the provider's compose (`handoff_url`), and offer the file (`ics_url`, a path under the API);
 *   invite_sent → a link to the event (`event_link`);
 *   draft_ready (R19) → the message under the line, with Copy and its link;
 *   open_conversation (the meeting arc's Now, 2026-09-30) → that conversation, in the chat pane.
 * A space's `consent_needed` (a locked space) is not this pane's to handle. The canvas offer's
 * `open_canvas` never reaches the vault: the offer is made only in a person's own conversation
 * (the web's and the phone's), which the vault's chat is not.
 */
export function lineEffectActions(effects: SpaceEffect[] | undefined | null, apiBase: string): LineEffectAction[] {
  const base = trimBase(apiBase);
  const out: LineEffectAction[] = [];
  for (const e of effects ?? []) {
    if (e.type === 'consent_needed') {
      if ((e.provider !== 'google' && e.provider !== 'microsoft') || typeof e.init_path !== 'string' || !e.init_path.startsWith('/')) continue;
      const scope = typeof e.scope_set === 'string' ? e.scope_set : '';
      const back = typeof e.return_to === 'string' ? e.return_to : '';
      out.push({ kind: 'open', url: `${base}${e.init_path}?scope_set=${encodeURIComponent(scope)}&return_to=${encodeURIComponent(back)}` });
      out.push({ kind: 'note', text: LINE_ANSWER_WORDS.consentOpened });
    } else if (e.type === 'invite_ready') {
      if (typeof e.handoff_url === 'string' && /^https?:\/\//.test(e.handoff_url)) out.push({ kind: 'open', url: e.handoff_url });
      if (typeof e.ics_url === 'string' && e.ics_url.startsWith('/')) {
        out.push({ kind: 'link', link: { text: LINE_ANSWER_WORDS.inviteReady, label: LINE_ANSWER_WORDS.inviteFile, url: `${base}${e.ics_url}` } });
      } else {
        out.push({ kind: 'note', text: LINE_ANSWER_WORDS.inviteReadyNoFile });
      }
    } else if (e.type === 'invite_sent') {
      if (typeof e.event_link === 'string' && /^https?:\/\//.test(e.event_link)) out.push({ kind: 'link', link: { label: LINE_ANSWER_WORDS.openEvent, url: e.event_link } });
    } else if (e.type === 'draft_ready') {
      if (typeof e.text !== 'string' || !e.text.trim()) continue;
      const url = typeof e.url === 'string' && /^https?:\/\//.test(e.url) ? e.url : undefined;
      const label = typeof e.url_label === 'string' && e.url_label.trim() ? e.url_label.trim() : LINE_ANSWER_WORDS.draftLink;
      out.push({ kind: 'draft', draft: { text: e.text, url, label, to_name: typeof e.to_name === 'string' ? e.to_name : undefined } });
    } else if (e.type === 'send_yourself') {
      // "Send it yourself" (2026-11-13): the question's own words, with Copy; nothing is sent.
      const text = (e as { text?: unknown }).text;
      if (typeof text !== 'string' || !text.trim()) continue;
      out.push({ kind: 'draft', draft: { text, label: LINE_ANSWER_WORDS.draftLink } });
    } else if (e.type === 'open_invite') {
      // Invite (2026-11-13): the vault has no invite step; the terminal's carries the question by its id.
      const o = e as { email?: unknown; name?: unknown; question_id?: unknown };
      const who = typeof o.email === 'string' && o.email.trim() ? o.email.trim() : typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null;
      if (!who) continue;
      out.push({ kind: 'note', text: LINE_ANSWER_WORDS.inviteWithQuestion(who, typeof o.question_id === 'string' && o.question_id.trim() ? o.question_id.trim() : null) });
    } else if (e.type === 'open_conversation') {
      if (typeof e.subject_type !== 'string' || !e.subject_type || typeof e.subject_id !== 'string' || !e.subject_id) continue;
      const occurrence = typeof e.occurrence_key === 'string' && e.occurrence_key ? { occurrence_key: e.occurrence_key } : {};
      out.push({ kind: 'conversation', conversation: { subject_type: e.subject_type, subject_id: e.subject_id, ...occurrence } });
    }
  }
  return out;
}

/** What one line shows between answers: pressed, said back, a note under it, links. */
export interface LineUi {
  busy?: boolean;
  /** A settled answer: the line is replaced by its readback. */
  said?: string | null;
  /** The readback reads as done (a real answer), or quiet (Skip / Not now). */
  good?: boolean;
  /** A line that stays up says why under it (a refusal, a consent flow), or a failed send. */
  note?: string | null;
  notes?: string[];
  links?: LineLink[];
  /** R19: the message the answer wrote, to copy. */
  draft?: LineDraft;
  /**
   * A question about who someone is, closed elsewhere while it was on screen (2026-11-15, 409 `line_closed`): its words stay, and
   * this ("Already answered.") stands in place of its buttons.
   */
  closed?: string;
}

export interface PressResult {
  ui: LineUi;
  /** The answer settled the line: the pane refreshes, and keeps the line to show its readback. */
  settled: boolean;
  /** The line closed under the press (409 `line_closed`): nothing was answered and nothing is said; the pane reads again. */
  closed?: boolean;
  /** Pages to open in the browser (a consent, a compose). */
  open: string[];
  /** A conversation to open in the chat pane (the meeting arc's Now). */
  conversation?: LineConversation;
  /** The answer moved things and can be put back (2026-11-15): its sentence and its move, for Undo beside it. */
  undo?: { said: string; moveId: string };
  /**
   * The server refused the press but said why and kept the line (19c: a yes with no `route_seen`, or a route that changed; 18b's stale
   * button): its sentence is the note, nothing settled, and the pane reads again so the line draws as it now stands.
   */
  readAgain?: boolean;
  /** Its send is already going (19c2): the sentence stays under the line, and the pane reads again once after this many ms. */
  readAgainAfterMs?: number;
}

/** "A moment" (19c2): how long after "This is being sent. Give it a moment." the line is read again, once. Mirror of shared's. */
export const SEND_SETTLE_MS = 3000;

/** The server's word for a press on a send line whose send is already going (19c2). Mirror of shared's. */
export const SEND_IN_FLIGHT = 'in_flight';

/**
 * A press on a send line while its send is already going (19c2): nothing new happened, and nothing is said as sent. The server's
 * `status: "in_flight"`; else (before that field) a success that keeps the line open with a sentence. Mirror of shared `inFlightOf`.
 */
export function inFlightOf(res: unknown): { said: string } | null {
  if (!isAnswerBody(res) || res.closed === true) return null;
  const rb = res.readback;
  const said = (typeof rb === 'string' ? rb : rb && typeof rb === 'object' && 'text' in rb && typeof rb.text === 'string' ? rb.text : '').trim();
  if (res.status === SEND_IN_FLIGHT) return { said };
  return res.success !== false && res.line_open === true && said ? { said } : null;
}

/** An answer's body, read field by field (no assertion: the mirror's looser wire types and the monorepo's read it the same). */
interface AnswerBody { success?: unknown; closed?: unknown; line_open?: unknown; status?: unknown; readback?: unknown }
const isAnswerBody = (x: unknown): x is AnswerBody => !!x && typeof x === 'object';

/** A send line's `route_seen` as it was drawn (19c), exactly as served. Mirror of shared `routeSeenOf`. */
export function routeSeenOf(line: unknown): string | null {
  const r = line && typeof line === 'object' ? (line as { route_seen?: unknown }).route_seen : null;
  return typeof r === 'string' && r !== '' ? r : null;
}

/** An answer on `line` with its `route_seen` echoed (19c); unchanged for a line that carries none. Mirror of shared `withRouteSeen`. */
export function withRouteSeen<A extends object>(line: unknown, answer: A): A & { route_seen?: string } {
  const r = routeSeenOf(line);
  return r === null ? answer : { ...answer, route_seen: r };
}

/**
 * A refusal that says why and keeps the line (a 4xx with a readback and `line_open: true`, whatever its code; 19c's `route_seen_required`
 * and `route_changed` are 409s): the answer, not an error. A line closed under the press and a missing key keep their own ways. Mirror of
 * the web's `isChoiceGone`.
 */
export function refusedKeepingLine(res: { status?: number; ok?: boolean; error?: string | null; data?: unknown } | null | undefined): boolean {
  if (!res || res.ok || !res.status || res.status < 400 || res.status >= 500) return false;
  if (lineClosed(res) || res.error === 'key_needed' || res.error === 'no_working_copy') return false;
  const d = res.data as { line_open?: unknown; readback?: { text?: unknown } | null } | null | undefined;
  return d?.line_open === true && typeof d.readback?.text === 'string' && !!d.readback.text.trim();
}

/** A press on a line the server had already closed (409 `line_closed`). Mirror of shared `isLineClosed`. */
export function lineClosed(res: { status?: number; error?: string | null } | null | undefined): boolean {
  return res?.status === 409 && res.error === 'line_closed';
}

/**
 * Answer a line with one of its buttons: the answer, then what the pane shows and opens.
 * A line_open answer keeps the line and says why under it; a settled one is replaced by its
 * readback; a failed send says so and keeps the buttons.
 */
export async function pressLineButton(
  deps: { answer: (lineId: string, answer: SpaceAnswer) => Promise<ApiResponse<SpaceAnswerReply>>; apiBase: string },
  line: MyuLineLite,
  button: LineButton,
): Promise<PressResult> {
  // "Move it" answers only with its day, "No, someone else" only with the person or the name: pressed bare, nothing goes (the pane
  // opens "Which day?" or "Who is it?" in its place).
  if (button.opens === 'day' && !button.answer.day) return { ui: {}, settled: false, open: [] };
  if (button.opens === 'who' && !button.answer.relationship_id && !button.answer.text?.trim()) return { ui: {}, settled: false, open: [] };
  // 19c: every answer on a send line echoes the way it goes, as this line was drawn.
  const res = await deps.answer(line.line_id, withRouteSeen(line, button.answer)).catch(() => null);
  // Closed under the press (2026-09-25): no note, no readback; the pane reads the list again. A question about who someone is
  // (2026-11-15) says "Already answered." in place of its buttons, so the person is not left with buttons that answer nothing.
  if (lineClosed(res)) return { ui: identityLine(line) ? { closed: IDENTITY_WORDS.alreadyAnswered } : {}, settled: false, closed: true, open: [] };
  if (refusedKeepingLine(res)) return { ui: { note: readbackText(res?.data) }, settled: false, open: [], readAgain: true };
  // Already going (19c2): nothing new happened, nothing is said as sent; the sentence under the line, read again after a moment.
  const flight = routeSeenOf(line) && res?.ok ? inFlightOf(res.data) : null;
  if (flight) return { ui: { note: flight.said || readbackText(res?.data) }, settled: false, open: [], readAgainAfterMs: SEND_SETTLE_MS };
  if (!res?.ok || !res.data) {
    return { ui: { note: res?.error === 'offline' ? LINE_ANSWER_WORDS.offline : LINE_ANSWER_WORDS.failed }, settled: false, open: [] };
  }
  const actions = lineEffectActions(res.data.effects, deps.apiBase);
  const open = actions.flatMap((a) => (a.kind === 'open' ? [a.url] : []));
  const notes = actions.flatMap((a) => (a.kind === 'note' ? [a.text] : []));
  const links = actions.flatMap((a) => (a.kind === 'link' ? [a.link] : []));
  // A message the answer wrote: one an effect carries (R19's draft_ready, "Send it yourself"), else the answer's own (2026-11-13: after
  // Move it, the short message to the other person; after Add it, the addition), under the line that says who or where it is for.
  const own = answerDraftOf(res.data, line);
  // The answer's own message first (its `must_see`, "Copy it"'s copy at open); an effect's only when it brings none: one message.
  const draft =
    (own
      ? {
          text: own.text,
          label: LINE_ANSWER_WORDS.draftLink,
          ...(own.lead ? { lead: own.lead } : {}),
          ...(own.toName ? { to_name: own.toName } : {}),
          ...(own.mustSee.length ? { must_see: own.mustSee } : {}),
          ...('choice_id' in button.answer && button.answer.choice_id === 'copy' && OWN_ANSWERS_KINDS.includes(line.kind ?? '') ? { copyAtOpen: true } : {}),
        }
      : undefined) ?? actions.find((a): a is Extract<LineEffectAction, { kind: 'draft' }> => a.kind === 'draft')?.draft;
  const conversation = actions.find((a): a is Extract<LineEffectAction, { kind: 'conversation' }> => a.kind === 'conversation')?.conversation;
  const also = conversation ? { conversation } : {};
  // What the answer did, in the server's words (2026-11-15: "Done. 1 thing moved to Tess Colleague." beside the readback's "Okay.").
  const effects = (res.data.effects ?? []).map((e) => ({ type: e.type, text: typeof e.text === 'string' ? e.text : undefined, move_id: typeof e.move_id === 'string' ? e.move_id : undefined }));
  const told = saidBack({ effects });
  const said = told ?? readbackText(res.data);
  // The move it made, to put back (2026-11-15 follow-up): Undo beside its sentence.
  const moveId = saidMoveId({ effects });
  const undo = moveId && said ? { undo: { said, moveId } } : {};
  if (res.data.line_open) return { ui: { note: said, notes, links }, settled: false, open, ...also, ...undo };
  // Tell, on a promise someone else's decision affects, has no readback of its own: its message's own words say it ("Here it is, to send.").
  const shown = said || own?.said || '';
  // "Can't send" said once (2026-11-19, as the web): a must-see sentence the readback already says is not drawn again; "To …" always is.
  const drawn = draft?.must_see ? { ...draft, must_see: draft.must_see.filter((m) => /^To\s/.test(m) || !shown.includes(m)) } : draft;
  return { ui: { said: shown, good: !button.answer.dismiss && !button.answer.later, notes, links, ...(drawn ? { draft: drawn } : {}) }, settled: true, open, ...also, ...undo };
}
