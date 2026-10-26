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
 *            unless the line carries its own (mirror of shared `quietWaysOut` / `carriesWayOut`)
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

/** The words the vault owns here; the web's own words for the same buttons and notes. */
export const LINE_ANSWER_WORDS = {
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
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'It did not copy. Select the message and copy it yourself.',
  draftLink: 'Open the link',
} as const;

/** R19 `draft_ready`: the message, and the link it is about ("Open the pull request"). Nothing is sent. */
export interface LineDraft {
  text: string;
  url?: string;
  /** The link's label; `LINE_ANSWER_WORDS.draftLink` when the effect names none. */
  label: string;
  to_name?: string;
}

export interface LineButton {
  /** The choice id, `later` for Not now, `dismiss` for Don't ask again, `change` for Change. */
  id: string;
  label: string;
  answer: SpaceAnswer;
  /** The quiet way out (Skip, Not now, Leave it): drawn as quiet text, not a button. */
  quiet: boolean;
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

/** The line carries its own way out, "Not now" or "Leave it" (mirror of shared `carriesWayOut`): no second one is added. */
export function carriesWayOut(line: Pick<MyuLineLite, 'choices'>): boolean {
  return (line.choices ?? []).some((c) => {
    const label = (c?.label ?? '').trim().toLowerCase();
    return c?.id === 'not_now' || c?.id === 'later' || c?.id === 'leave' || label === 'not now' || label === 'leave it';
  });
}

/** The two quiet ways out after a question's own buttons (mirror of shared `quietWaysOut`). */
export function quietWaysOut(line: Pick<MyuLineLite, 'choices'>): LineButton[] {
  if (carriesWayOut(line)) return [];
  return [
    { id: 'later', label: LINE_ANSWER_WORDS.later, answer: { later: true }, quiet: true },
    { id: 'dismiss', label: LINE_ANSWER_WORDS.never, answer: { dismiss: true }, quiet: true },
  ];
}

/** The buttons a line gets in the vault, kind by kind, as the web draws them. */
export function lineButtons(line: MyuLineLite): LineButton[] {
  switch (line.ask_kind) {
    case 'tell':
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
  const res = await deps.answer(line.line_id, button.answer).catch(() => null);
  // Closed under the press (2026-09-25): no note, no readback; the pane reads the list again.
  if (lineClosed(res)) return { ui: {}, settled: false, closed: true, open: [] };
  if (!res?.ok || !res.data) {
    return { ui: { note: res?.error === 'offline' ? LINE_ANSWER_WORDS.offline : LINE_ANSWER_WORDS.failed }, settled: false, open: [] };
  }
  const actions = lineEffectActions(res.data.effects, deps.apiBase);
  const open = actions.flatMap((a) => (a.kind === 'open' ? [a.url] : []));
  const notes = actions.flatMap((a) => (a.kind === 'note' ? [a.text] : []));
  const links = actions.flatMap((a) => (a.kind === 'link' ? [a.link] : []));
  const draft = actions.find((a): a is Extract<LineEffectAction, { kind: 'draft' }> => a.kind === 'draft')?.draft;
  const conversation = actions.find((a): a is Extract<LineEffectAction, { kind: 'conversation' }> => a.kind === 'conversation')?.conversation;
  const also = conversation ? { conversation } : {};
  const said = readbackText(res.data);
  if (res.data.line_open) return { ui: { note: said, notes, links }, settled: false, open, ...also };
  return { ui: { said: said ?? '', good: !button.answer.dismiss && !button.answer.later, notes, links, ...(draft ? { draft } : {}) }, settled: true, open, ...also };
}
