/**
 * Space mode (R14) — a space's own conversation, in the chat pane. And a meeting's own conversation
 * (2026-09-30): the same pane, one ask at a time with the box under it, for the question before the
 * meeting, the arc's session, "Anything you didn't say in there?" and the Yes/No that follows it.
 *
 * One Myu; the space sets the subject. In a space the conversation asks ONE thing
 * at a time and takes the person's own typed words first: the text box is always
 * there and is the main thing, the hints sit under it as quiet lines, and there
 * is no counter, no list of asks, and no second box behind a button.
 *
 * This file is the decisions, with no host API in it (the unit tests run it under
 * a stub that throws on any `obsidian` call). What goes where follows the same
 * rules every surface uses, so the vault behaves as the web
 * column, the phone sheet, the side panel and the terminal do (`spaceModeLogic.ts`
 * is the plugin's own copy of those decisions, held to the shared ones by a test).
 * Every sentence is the backend's; the few words the plugin owns are `SPACE_MODE_WORDS`.
 *
 * Typed words go to `POST /journal_chats/add` WITH the conversation's id — never
 * to a journal thread, which would not be read as space mode. A long paste or
 * drop in the box (2026-10-06) becomes a chip and goes beside them as
 * `pasted_blocks`; a send that fails gives the box back its words and chips.
 */

import type { AskMyuApi, MyuLineLite } from './transport/api';
import type { PastedBlockWire, SpaceAnswer, SpaceAsk, SpaceChoice, SpaceConversationRead, SpacePrepMine, SpaceTurn } from './wire';
import { PASTE_WORDS, canPutBack, chipAdded, chipsBack, pastedBlocksProblem, pastedTextLost, putBackText, readPastedBlocks, undoChip, type PasteUndo } from './pastedText';
import { lineClosed, quietWaysOut } from './lineAnswers';
import { canSendPicks, isPickMany, pickManyAnswer, pickManyParts, togglePick, typedAnswer, typedHint } from './pickMany';
import { DEBRIEF_PANE_WORDS, debriefEffectSteps, isDebriefConversation } from './debriefPane';
import {
  SPACE_MODE_WORDS,
  afterChoice,
  afterTyped,
  isAsk,
  isLockedText,
  isSpaceMode,
  readbackParts,
  readbackText,
  spaceDoorWords,
  spaceModeView,
  type ReadbackParts,
  type SpaceModeAsk,
  type SpaceModeStep,
} from './spaceModeLogic';

/**
 * The door on a space's Today entry: its words come from the step the person is at
 * (`GET /retro/prep/mine`), never a count. Nothing running (404) reads "Ask Myu about this space ▸".
 */
export function spaceDoorLabel(mine: SpacePrepMine | null | undefined): string {
  return spaceDoorWords(mine ?? null).text;
}

/** The spaces among today's lines, once each. */
export function spaceIdsOf(lines: Array<{ subjects?: Array<{ type?: string; id?: string }>; conversation?: { subject_type?: string; subject_id?: string } }>): string[] {
  const ids = new Set<string>();
  for (const l of lines) {
    const type = l.conversation?.subject_type ?? l.subjects?.[0]?.type;
    const id = l.conversation?.subject_id ?? l.subjects?.[0]?.id;
    if (type === 'space' && id) ids.add(id);
  }
  return [...ids];
}

/** What a locked turn reads as (the same words the web uses). */
export const LOCKED_TURN_WORDS = 'Unlock to read this.';

/** The words that differ in a meeting's own conversation (it is not a space, and it has no retro). */
export const MEETING_CONVERSATION_WORDS = {
  title: 'This meeting',
  unlock: 'Unlock this conversation',
  unlockFailed: 'This conversation could not be unlocked here. Sign out and sign in again, then come back.',
  agentRefused: 'This session can read this conversation, not write in it.',
} as const;

/**
 * Whose conversation the pane shows: a space's (the default), a meeting's (with the occurrence's start in ms
 * when known), or — 2026-10-03, the "About you" question — the account's own, a person's or a company's, when a
 * line about them is answered here (several picks, a typed name).
 */
export type ConversationSubjectType = 'space' | 'meeting' | 'account' | 'person' | 'company';

export interface ConversationSubject {
  type: ConversationSubjectType;
  occurrenceKey?: string;
}

/**
 * The conversation door (`GET /myu/conversation`) takes every subject here; the account's own question ("About you")
 * since 2026-10-03. A server from before then refuses `account` (400): the pane then reads the asks from the lines list
 * (`GET /myu/lines`, the Today scope they sit in) and says the readbacks in place (`SpaceConversation.read`).
 */
export function hasConversationDoor(_type: ConversationSubjectType): boolean {
  return true;
}

/** A subject type the pane can show a conversation for; null for any other word. */
export function conversationSubjectType(type: string | null | undefined): ConversationSubjectType | null {
  return type === 'space' || type === 'meeting' || type === 'account' || type === 'person' || type === 'company' ? type : null;
}

/** The words the pane owns for a conversation with no door behind it. */
export const LINE_CONVERSATION_WORDS = {
  nothingOpen: 'Nothing to answer here right now.',
  removeName: 'Remove this name',
} as const;

/** Where on the web, for the two asks the vault cannot do itself (R18); the same words as the terminal's. */
export const WEB_POINTER_WORDS = {
  /** "Add my LinkedIn" / "Upload a resume" (`open_onboarding`): that step is on the web's Home page. */
  profileOnWeb: 'To add your LinkedIn profile or a resume, open your Home page on the web:',
  /** "Connect my calendar" (the calendar's consent): a browser page, where the person is signed in. */
  calendarOnWeb: 'To let Myu see your calendar, open this link in a browser where you are signed in:',
} as const;

const PRODUCTION_API_BASE = 'https://myu.askmyu.com/api';

/** The web app beside the API (production's API is `https://myu.askmyu.com/api`). */
function webOrigin(apiBase: string | undefined): string {
  const base = apiBase ?? PRODUCTION_API_BASE;
  try {
    return new URL(base).origin;
  } catch {
    return base.replace(/\/api\/?$/, '');
  }
}

export interface SpaceConversationDeps {
  backend: Pick<AskMyuApi, 'getSubjectConversation' | 'addSubjectTurn' | 'answerMyuLine' | 'getMyuLines'>;
  /** Put this session's key back where Myu can use it. True when it worked. Never a navigation. */
  unlock: () => Promise<boolean>;
  /** "Take it there": the journal, with this text in the box, unsent, focused. */
  openJournal: (text: string) => void;
  /** Something changed: paint again. */
  onChange: () => void;
  /** An ask was answered here and settled: the line's row elsewhere (Today) reads again. */
  onAnswered?: () => void;
  now?: () => number;
  /** The API this vault talks to; the pointers to the web (R18: the LinkedIn or resume step, the calendar) are built from it. */
  apiBase?: string;
  /** A meeting's arc, Hold time: the calendar's own page, in the browser (nobody is invited). */
  openPage?: (url: string) => void;
  /** A meeting's arc, Now: the conversation it names, when it is another one (the occurrence's own). */
  openConversation?: (ref: { subject_type: string; subject_id: string; occurrence_key?: string }) => void;
}

export interface ScreenTurn {
  key: string;
  from: 'myu' | 'you';
  text: string;
  /** A readback with "• " lines: each bullet its own line, the warning apart. */
  parts: ReadbackParts | null;
  /** A 'you' turn's pasted text (2026-10-06), drawn as folded cards under its words. */
  pasted?: PastedBlockWire[];
}

/** A `select: "many"` ask (2026-10-03): the people as toggles, the send, the singles. */
export interface ScreenPicks {
  /** The toggles, `on` when picked. */
  picks: Array<{ id: string; label: string; on: boolean }>;
  /** "That's everyone": `ready` once something is picked or a name is kept; disabled until then. */
  send: { id: string; label: string; ready: boolean } | null;
  /** Answered alone, at once ("No one reports to me"). */
  singles: SpaceChoice[];
}

export interface ScreenAsk {
  line_id: string;
  text: string;
  parts: ReadbackParts | null;
  /** The choices as plain buttons. Empty on a pick-many ask, whose choices are `picks`. */
  choices: SpaceChoice[];
  quiet: SpaceChoice | null;
  /** Set on a pick-many ask. */
  picks: ScreenPicks | null;
  /** "Someone else": the choice that takes a typed name; `on` while the box is taking it. */
  typed: { id: string; label: string; on: boolean } | null;
  /** On a pick-many ask, the typed name kept beside the picks until "That's everyone" sends it. */
  kept: string | null;
  /** The two quiet ways out (Not now, Don't ask again) on a line's own conversation, unless the line carries its own. */
  waysOut: Array<{ id: string; label: string }>;
}

export interface SpaceScreen {
  /** A space's conversation, a meeting's (no retro page, its own unlock words), or a line's own (the account's, a person's). */
  kind?: ConversationSubjectType;
  title: string;
  loading: boolean;
  /** The read failed: said once, with the box still there. */
  failed: string | null;
  /** 'link' = "Earlier ▸"; 'loading'; 'none' = "Nothing earlier."; null = nothing to show. */
  earlier: 'link' | 'loading' | 'none' | null;
  /** What was said before, oldest first. */
  turns: ScreenTurn[];
  /** Where things stand right now: a quiet strip under the title. Always current, never a turn. */
  status: string | null;
  /** The ONE ask that is up. */
  ask: ScreenAsk | null;
  /** Said since the last read, under the ask: the person's own words at once, then Myu's reply. */
  after: ScreenTurn[];
  /** What Myu said back to a button when the ask stays up (a locked space, a refusal). */
  note: string | null;
  /** A conversation with no door behind it and nothing open: said once, in place. */
  empty: string | null;
  /** "Myu is reading…" while a typed message is out. */
  reading: boolean;
  /** A button is being answered. */
  answering: boolean;
  unlock: { show: boolean; busy: boolean; failed: boolean };
  /** `show`: the box is drawn. Always for a conversation; for a line's own with no door, only while a name is typed. */
  box: { show: boolean; placeholder: string; hints: string[]; hintsLead: string; draft: string };
}

/** A line from the lines list as the pane's ask (the loose list shape, tightened). */
function lineAsAsk(l: MyuLineLite): SpaceAsk {
  const choices = (l.choices ?? [])
    .filter((c): c is SpaceChoice => typeof c?.id === 'string' && c.id.length > 0)
    .map((c) => ({ id: c.id, label: c.label?.trim() || c.id, ...(c.readback?.trim() ? { readback: c.readback } : {}) }));
  return {
    line_id: l.line_id,
    text: l.text ?? '',
    choices,
    ...(l.select ? { select: l.select } : {}),
    ...(l.send ? { send: l.send } : {}),
    ...(l.typed ? { typed: l.typed } : {}),
    subjects: l.subjects,
    needs_you: l.needs_you,
    ask_kind: l.ask_kind,
    state: l.state,
    conversation: l.conversation,
    provenance: l.provenance,
    created_at: l.created_at,
  };
}

/** A line that is open and about this subject (its conversation ref first, else its first subject). */
function lineAbout(l: MyuLineLite, type: string, id: string): boolean {
  const open = !l.state || l.state === 'released' || l.state === 'queued';
  if (!open) return false;
  const c = l.conversation;
  if (c?.subject_type && c.subject_id) return c.subject_type === type && c.subject_id === id;
  const s = l.subjects?.[0];
  return s?.type === type && s?.id === id;
}

/** The opening words of a locked turn never reach the screen as ciphertext. */
function shown(text: string): string {
  return isLockedText(text) ? LOCKED_TURN_WORDS : text;
}

function screenTurn(t: SpaceTurn): ScreenTurn {
  const text = shown(t.text);
  const pasted = t.from === 'you' ? readPastedBlocks(t.pasted_blocks) : [];
  return { key: t.turn_id, from: t.from, text, parts: readbackParts(text), ...(pasted.length ? { pasted } : {}) };
}

/** The pasted characters a turn carried: with its words, what tells a turn shown ahead of the read from another. */
const pastedChars = (t: SpaceTurn): number => (t.pasted_blocks ?? []).reduce((sum, b) => sum + (typeof b?.text === 'string' ? b.text.length : 0), 0);

/**
 * The read carries `l`, a turn shown ahead of it: the same speaker, words and pasted characters. A turn sent with
 * pasted text can also come back without its blocks: folded into its words (the server's switch off: the typed words,
 * a blank line, each text), or with only the typed words (blocks the read could not open).
 */
function carries(t: SpaceTurn, l: SpaceTurn): boolean {
  if (t.from !== l.from) return false;
  const text = t.text.trim();
  if (text === l.text.trim() && pastedChars(t) === pastedChars(l)) return true;
  if (!l.pasted_blocks?.length || t.pasted_blocks?.length) return false;
  return text === l.text.trim() || text === [l.text, ...l.pasted_blocks.map((b) => b.text)].filter((s) => s.trim()).join('\n\n').trim();
}

export class SpaceConversation {
  private conv: SpaceConversationRead | null = null;
  private loading = true;
  private failed: string | null = null;
  /** Turns shown at once and replaced by the next read: the person's own, and Myu's reply. */
  private local: SpaceTurn[] = [];
  private reading = false;
  private answering = false;
  private note: string | null = null;
  private needsUnlock = false;
  private unlocking = false;
  private unlockFailed = false;
  private earlier: 'idle' | 'loading' | 'none' = 'idle';
  /** The ask a typed message came back with: shown while it is open, even when an older ask is open too. */
  private focusLineId: string | null = null;
  private seq = 0;
  /** The pane focuses the box after the next paint, then clears this. */
  wantsFocus = false;
  draft = '';
  /**
   * Pasted text in the box, as chips (2026-10-06), and the last paste that became one while Undo can put it back.
   * Changing these does not repaint the pane (`deps.onChange`): the pane redraws its chip row in place, so the box
   * keeps its caret and focus.
   */
  pasted: PastedBlockWire[] = [];
  undo: PasteUndo | null = null;
  /** Words under the chips until the next change: the lost words after a send. */
  pastedNote: string | null = null;
  /**
   * Picking several, and a typed name (2026-10-03): the picks on a `select: "many"` ask, the typed choice the box is
   * answering ("Someone else"), and — on a pick-many ask — the typed name waiting to go with the picks. All three
   * belong to the ask they were made on (`pickLineId`); a new ask starts clean.
   */
  private picked: string[] = [];
  private typedMode: string | null = null;
  private typedKept: string | null = null;
  private pickLineId: string | null = null;

  /**
   * `spaceId` is the subject's id: the space's, for a meeting the calendar event's, for the account's own
   * question the account's.
   */
  constructor(
    readonly spaceId: string,
    private label: string,
    private deps: SpaceConversationDeps,
    private subject: ConversationSubject = { type: 'space' },
  ) {
  }

  /** A meeting's own conversation (not a space's). */
  get isMeeting(): boolean {
    return this.subject.type === 'meeting';
  }

  /** A space's own conversation (not a meeting's, not a line's), whether or not the server has said space mode yet. */
  get isSpaceSubject(): boolean {
    return this.subject.type === 'space';
  }

  /** The conversation has a door (`GET /myu/conversation`) behind it — unless the server refused the account's own. */
  get hasDoor(): boolean {
    return hasConversationDoor(this.subject.type) && !this.noDoor;
  }

  /** A line's own conversation (the account's, a person's, a company's): not a space's, not a meeting's. */
  private get isLineConversation(): boolean {
    return this.subject.type !== 'space' && this.subject.type !== 'meeting';
  }

  /** True once the conversation was read at all (so "not space mode" is known, not assumed). */
  get opened(): boolean {
    return this.conv !== null;
  }

  /** True when the backend says this conversation is space mode (an older stack may not). */
  get isSpace(): boolean {
    return isSpaceMode(this.conv);
  }

  /** An interview debrief's conversation (2026-09-29): no retro page beside it, and its CV and LinkedIn asks say where. */
  get isDebrief(): boolean {
    return isDebriefConversation(this.conv);
  }

  /** Read the conversation. False when it could not be read, or a space's is not space mode. */
  async open(): Promise<boolean> {
    this.loading = true;
    this.deps.onChange();
    const ok = await this.read();
    this.loading = false;
    this.wantsFocus = true;
    this.deps.onChange();
    return ok && (this.isSpace || this.subject.type !== 'space');
  }

  private async read(): Promise<boolean> {
    let ok = this.hasDoor ? await this.readDoor() : await this.readLines();
    // A server from before 2026-10-03 refuses the account's own conversation (400): read the lines list from then on.
    if (!ok && this.subject.type === 'account' && !this.noDoor && this.doorStatus === 400) {
      this.noDoor = true;
      ok = await this.readLines();
    }
    // The picks, the typed choice and the kept name belong to the ask they were made on.
    const askId = this.conv ? (spaceModeView(this.conv, this.focusLineId).ask?.line_id ?? null) : null;
    if (askId !== this.pickLineId) {
      this.pickLineId = askId;
      this.picked = [];
      this.typedMode = null;
      this.typedKept = null;
    }
    return ok;
  }

  private async readDoor(): Promise<boolean> {
    // Once the earlier history was asked for, every later read keeps it. A meeting's read names its occurrence.
    const occurrence = this.subject.occurrenceKey ? { occurrenceKey: this.subject.occurrenceKey } : null;
    const opts = occurrence || this.withEarlier ? { ...occurrence, ...(this.withEarlier ? { earlier: true } : {}) } : undefined;
    const res = await this.deps.backend.getSubjectConversation(this.subject.type, this.spaceId, opts).catch(() => null);
    this.doorStatus = res?.status ?? 0;
    if (!res?.ok || !res.data) {
      this.failed = res?.error === 'offline' ? "You're offline. Try again when you're back online." : 'Could not open this conversation. Try again in a moment.';
      return false;
    }
    this.failed = null;
    this.conv = res.data;
    // A turn shown ahead of the read goes once the read carries it; one it does not carry yet stays.
    const recent = res.data.history.slice(-8);
    this.local = this.local.filter((l) => !recent.some((t) => carries(t, l)));
    return true;
  }

  /**
   * No door (the account's own question on a server from before 2026-10-03): the asks are the open lines about this
   * subject on the lines list, in its order. There is no history; what Myu said back is said here, in place (`say`).
   */
  private async readLines(): Promise<boolean> {
    const res = await this.deps.backend.getMyuLines('today').catch(() => null);
    if (!res?.ok || !res.data) {
      this.failed = res?.error === 'offline' ? "You're offline. Try again when you're back online." : 'Could not open this conversation. Try again in a moment.';
      return false;
    }
    this.failed = null;
    const mine = (res.data.lines ?? []).filter((l) => lineAbout(l, this.subject.type, this.spaceId) && isAsk(l)).map(lineAsAsk);
    const label = mine[0]?.subjects?.[0]?.label ?? this.conv?.subject?.label;
    this.conv = {
      success: true,
      conversation_id: mine[0]?.conversation?.conversation_id ?? this.conv?.conversation_id ?? '',
      subject: { type: this.subject.type, id: this.spaceId, ...(label ? { label } : {}) },
      history: [],
      open_line: mine[0],
      open_lines: mine,
    };
    return true;
  }

  /** A line changed on the server (a new ask, a readback): read again, quietly. */
  async refresh(): Promise<void> {
    if (this.reading || this.answering || this.loading) return;
    await this.read();
    this.deps.onChange();
  }

  /** "Earlier ▸": what came before this retro. When the same turns come back, say so. */
  async loadEarlier(): Promise<void> {
    if (this.earlier !== 'idle' || !this.conv) return;
    const before = this.conv.history.length;
    this.earlier = 'loading';
    this.withEarlier = true;
    this.deps.onChange();
    const ok = await this.read();
    const grew = ok && (this.conv?.history.length ?? 0) > before;
    // More came back: it is all here now. The same came back: there is nothing earlier.
    this.earlier = 'none';
    this.showNothingEarlier = !grew;
    this.deps.onChange();
  }
  private withEarlier = false;
  /** The account's own conversation was refused at the door (a server from before 2026-10-03): the lines list is read. */
  private noDoor = false;
  /** The last answer's status from the door (0 when nothing came back). */
  private doorStatus = 0;
  private showNothingEarlier = false;

  /** The ask that is SHOWN (the backend's `open_line` may be an older one underneath). */
  private currentAsk(): SpaceModeAsk | null {
    return this.conv ? spaceModeView(this.conv, this.focusLineId).ask : null;
  }

  /** True while the box takes a typed name ("Someone else"): a paste there stays inline. */
  get typing(): boolean {
    return !!this.typedMode;
  }

  /** A paste or a drop became a chip; `value` is the box's text without the selection the paste replaced. */
  addPasted(text: string, source: 'paste' | 'drop', at: number, value: string): PastedBlockWire {
    const out = chipAdded(this.pasted, text, source, at);
    this.pasted = out.chips;
    this.undo = out.undo;
    this.pastedNote = null;
    this.draft = value;
    return out.chip;
  }

  /** Undo: the last conversion back inline in the box's text. The new text and the caret, or null when there is none. */
  undoPasted(value: string): { value: string; caret: number } | null {
    const undo = this.undo;
    this.undo = null;
    const out = undo ? undoChip(value, this.pasted, undo) : null;
    if (!out) return null;
    this.pasted = out.chips;
    this.draft = out.value;
    return { value: out.value, caret: out.caret };
  }

  removePasted(id: string): void {
    this.pasted = this.pasted.filter((c) => c.id !== id);
    this.undo = null;
    this.pastedNote = null;
  }

  /** Put back: the chip's text at the end of the typed words. The new text, or null when it would go over the limit. */
  putBackPasted(id: string): string | null {
    const chip = this.pasted.find((c) => c.id === id);
    if (!chip || !canPutBack(this.draft, chip).ok) return null;
    this.draft = putBackText(this.draft, chip);
    this.pasted = this.pasted.filter((c) => c !== chip);
    this.undo = null;
    this.pastedNote = null;
    return this.draft;
  }

  /** The box was typed in: the hint (and the words after a send) go. True when there was one to take away. */
  typedInBox(): boolean {
    if (!this.undo && !this.pastedNote) return false;
    this.undo = null;
    this.pastedNote = null;
    return true;
  }

  /** Typed words: the person's turn shows at once; "Myu is reading…" until the answer lands. */
  async send(text: string): Promise<void> {
    const content = text.trim();
    // "Someone else" (2026-10-03): the typed name answers the line, not the conversation. On a pick-many ask it
    // waits beside the picks and goes with "That's everyone"; on a single-choice ask it is sent at once.
    if (this.typedMode) {
      const ask = this.currentAsk();
      const parts = pickManyParts(ask?.line);
      if (!content || !ask || !parts.typed || this.answering || this.reading) return;
      this.draft = '';
      if (isPickMany(ask.line)) {
        this.typedKept = content;
        this.typedMode = null;
        this.deps.onChange();
        return;
      }
      const body = typedAnswer(ask.line, content);
      if (!body) return;
      this.typedMode = null;
      await this.answer(ask, parts.typed.id, body);
      return;
    }
    const pasted = [...this.pasted];
    if ((!content && pasted.length === 0) || this.reading || !this.conv?.conversation_id) return;
    // Over a cap: nothing is sent; the box keeps the words and the chips, and its row says why.
    if (pastedBlocksProblem(pasted)) return;
    this.draft = '';
    this.pasted = [];
    this.undo = null;
    this.pastedNote = null;
    this.note = null;
    const mine: SpaceTurn = { turn_id: `local-${++this.seq}`, from: 'you', at: new Date((this.deps.now ?? Date.now)()).toISOString(), text: content, ...(pasted.length ? { pasted_blocks: pasted } : {}) };
    this.local.push(mine);
    this.reading = true;
    this.deps.onChange();
    const res = await this.deps.backend.addSubjectTurn(this.conv.conversation_id, content, pasted).catch(() => null);
    this.reading = false;
    if (!res) {
      this.giveBack(text, pasted, mine);
      this.say('Could not send this to Myu. Try again in a moment.');
      this.deps.onChange();
      return;
    }
    // Not sent (a read-only session's refusal too, whose words come from the answer below): the box gets it back.
    if (!res.ok) this.giveBack(text, pasted, mine);
    if (!res.ok && res.error !== 'scope_required' && res.data?.error !== 'scope_required') {
      this.say(res.error === 'offline' ? "You're offline. This message was not sent. Try again when you're back online." : 'Could not send this to Myu. Try again in a moment.');
      this.deps.onChange();
      return;
    }
    // Answered, but the server did not count the pasted text (one without it keeps only the typed words): the chips
    // go back in the box, and the turn shows only what reached Myu. The chips are numbered afresh, so the last
    // paste's Undo no longer names the chip it made.
    if (res.ok && pastedTextLost(pasted.length, res.data)) {
      delete mine.pasted_blocks;
      this.pasted = chipsBack(pasted, this.pasted);
      this.undo = null;
      this.pastedNote = PASTE_WORDS.lost;
    }
    await this.run(afterTyped(res.data ?? { error: res.error ?? undefined }));
    this.deps.onChange();
  }

  /**
   * A send that did not go: the box gets its words and chips back, and the turn shown for it goes (it would show
   * twice), unless something new is in the box already; then the turn stays, so nothing is lost.
   */
  private giveBack(text: string, pasted: PastedBlockWire[], mine: SpaceTurn): void {
    if (this.draft.trim() || this.pasted.length > 0) return;
    this.local = this.local.filter((t) => t !== mine);
    this.draft = text;
    this.pasted = pasted;
    this.wantsFocus = true;
  }

  /**
   * A button on the ask that is up. On a pick-many ask (2026-10-03) the send choice ("That's everyone") sends the
   * picks together with the kept name, and does nothing until there is something to send; the typed choice
   * ("Someone else") turns the box into the name's box instead of answering. The two quiet ways out a line's own
   * conversation adds (Not now, Don't ask again) answer as on a row.
   */
  async choose(choiceId: string): Promise<void> {
    // The ask that is SHOWN is the one answered (the backend's `open_line` may be an older one underneath).
    const ask = this.currentAsk();
    if (!ask || this.answering || this.reading) return;
    const parts = pickManyParts(ask.line);
    if (parts.typed && choiceId === parts.typed.id) {
      this.typedMode = this.typedMode === choiceId ? null : choiceId;
      if (this.typedMode) this.wantsFocus = true;
      this.deps.onChange();
      return;
    }
    if (parts.send && choiceId === parts.send.id) {
      if (!canSendPicks(this.picked, this.typedKept)) return;
      await this.answer(ask, choiceId, pickManyAnswer(ask.line, this.picked, this.typedKept));
      return;
    }
    const own = (ask.line.choices ?? []).some((c) => c.id === choiceId);
    const body: SpaceAnswer = own ? { choice_id: choiceId } : choiceId === 'later' ? { later: true } : choiceId === 'dismiss' ? { dismiss: true } : { choice_id: choiceId };
    await this.answer(ask, choiceId, body);
  }

  /** Toggle one pick on a pick-many ask. */
  pick(choiceId: string): void {
    const ask = this.currentAsk();
    if (!ask || this.answering || this.reading || !pickManyParts(ask.line).picks.some((c) => c.id === choiceId)) return;
    this.picked = togglePick(this.picked, choiceId);
    this.deps.onChange();
  }

  /** The typed name kept beside the picks: let it go. */
  dropTyped(): void {
    if (!this.typedKept) return;
    this.typedKept = null;
    this.deps.onChange();
  }

  private async answer(ask: SpaceModeAsk, choiceId: string, body: SpaceAnswer): Promise<void> {
    this.answering = true;
    this.note = null;
    this.deps.onChange();
    const res = await this.deps.backend.answerMyuLine(ask.line_id, body).catch(() => null);
    this.answering = false;
    // Closed under the press (409 line_closed): read the conversation again and show the ask that is up now.
    if (lineClosed(res)) {
      await this.read();
      this.deps.onChange();
      return;
    }
    if (!res?.ok || !res.data) {
      this.note = res?.error === 'offline' ? "You're offline. Try again when you're back online." : 'Could not send this to Myu. Try again in a moment.';
      this.deps.onChange();
      return;
    }
    // An ask that stays up says why in place (a locked space); a settled one reads back in the history —
    // or, with no door behind the conversation, is said here, in place.
    const said = readbackText(res.data);
    if (res.data.line_open) this.note = said;
    else if (!this.hasDoor && said?.trim()) this.say(said);
    await this.read();
    if (!res.data.line_open) this.deps.onAnswered?.();
    await this.run(afterChoice(choiceId, res.data.effects));
    // A calendar's consent (Myu's calendar ask, R18 I4): its page, for a browser where the person is signed in.
    for (const e of res.data.effects ?? []) {
      if (e.type !== 'consent_needed' || (e.provider !== 'google' && e.provider !== 'microsoft')) continue;
      if (typeof e.init_path !== 'string' || !e.init_path.startsWith('/')) continue;
      const q = new URLSearchParams({
        scope_set: typeof e.scope_set === 'string' ? e.scope_set : 'calendar',
        return_to: typeof e.return_to === 'string' ? e.return_to : 'dashboard',
      });
      this.note = `${WEB_POINTER_WORDS.calendarOnWeb} ${(this.deps.apiBase ?? PRODUCTION_API_BASE).replace(/\/+$/, '')}${e.init_path}?${q.toString()}`;
    }
    // A meeting's arc (2026-09-30): Hold time opens the calendar's page; Now opens the occurrence's own
    // conversation, where Myu wrote the first turn, when this one is not it already.
    if (this.isMeeting) {
      for (const e of res.data.effects ?? []) {
        if (e.type === 'invite_ready' && typeof e.handoff_url === 'string' && /^https?:\/\//i.test(e.handoff_url)) this.deps.openPage?.(e.handoff_url);
        if (e.type === 'open_conversation' && typeof e.subject_type === 'string' && typeof e.subject_id === 'string') {
          const occurrence = typeof e.occurrence_key === 'string' && e.occurrence_key ? e.occurrence_key : undefined;
          const here = e.subject_type === this.subject.type && e.subject_id === this.spaceId && (!occurrence || occurrence === this.subject.occurrenceKey);
          if (!here) this.deps.openConversation?.({ subject_type: e.subject_type, subject_id: e.subject_id, ...(occurrence ? { occurrence_key: occurrence } : {}) });
        }
      }
    }
    // An interview debrief's CV ask: a file goes on the candidate's page (the web) or through the terminal; a
    // LinkedIn link is pasted in the box here. The ask stays up until something is added.
    for (const step of debriefEffectSteps(res.data.effects)) {
      if (step.do === 'attach_cv') {
        this.note = DEBRIEF_PANE_WORDS.cvWhere(this.screenTitle(), `${webOrigin(this.deps.apiBase)}/dashboard/spaces/${encodeURIComponent(this.spaceId)}`);
      } else {
        this.note = this.note?.trim() ? this.note : DEBRIEF_PANE_WORDS.linkedinHere;
        this.wantsFocus = true;
      }
    }
    this.deps.onChange();
  }

  /** The unlock, in place: the session's key goes back, then the conversation is read again. */
  async unlockSpace(): Promise<void> {
    if (this.unlocking) return;
    this.unlocking = true;
    this.unlockFailed = false;
    this.deps.onChange();
    const ok = await this.deps.unlock().catch(() => false);
    this.unlocking = false;
    if (ok) {
      this.needsUnlock = false;
      this.note = null;
      await this.read();
    } else {
      this.unlockFailed = true;
    }
    this.deps.onChange();
  }

  private say(text: string): void {
    this.local.push({ turn_id: `local-${++this.seq}`, from: 'myu', at: new Date((this.deps.now ?? Date.now)()).toISOString(), text });
  }

  private async run(steps: SpaceModeStep[]): Promise<void> {
    for (const step of steps) {
      switch (step.do) {
        case 'say':
          this.say(step.text);
          break;
        case 'reload':
          // The new ask is already a turn of the conversation; it is the ask on screen after this.
          this.focusLineId = step.focus_line_id ?? null;
          await this.read();
          break;
        case 'open_journal':
          this.deps.openJournal(step.text);
          break;
        case 'unlock_space':
          this.needsUnlock = true;
          break;
        case 'open_onboarding':
          // The LinkedIn or resume step lives on the web's Home page; the pane says where, in place.
          this.note = `${WEB_POINTER_WORDS.profileOnWeb} ${webOrigin(this.deps.apiBase)}/dashboard`;
          break;
        case 'focus_box':
          this.wantsFocus = true;
          break;
        case 'refused_scope':
          this.say(this.isDebrief ? DEBRIEF_PANE_WORDS.agentRefused : this.isMeeting ? MEETING_CONVERSATION_WORDS.agentRefused : step.text);
          break;
      }
    }
  }

  private screenTitle(): string {
    return this.conv?.subject?.label || this.label || (this.isMeeting ? MEETING_CONVERSATION_WORDS.title : this.isLineConversation ? 'This conversation' : 'This space');
  }

  /** The one ask as the pane draws it: its choices, or — pick-many — its toggles, send and singles; the typed choice; the ways out. */
  private screenAsk(ask: SpaceModeAsk): ScreenAsk {
    const askText = shown(ask.text);
    const line = ask.line;
    const parts = pickManyParts(line);
    const many = isPickMany(line);
    return {
      line_id: ask.line_id,
      text: askText,
      parts: readbackParts(askText),
      choices: many ? [] : ask.choices,
      quiet: ask.quiet,
      picks: many
        ? {
            picks: parts.picks.map((c) => ({ id: c.id, label: c.label, on: this.picked.includes(c.id) })),
            send: parts.send ? { id: parts.send.id, label: parts.send.label, ready: canSendPicks(this.picked, this.typedKept) } : null,
            singles: parts.singles,
          }
        : null,
      typed: parts.typed ? { id: parts.typed.id, label: parts.typed.label, on: this.typedMode === parts.typed.id } : null,
      kept: many ? this.typedKept : null,
      // A space's asks carry their own ways out; a meeting's were made with theirs (Skip, Nothing).
      waysOut: this.isLineConversation ? quietWaysOut(line).map((b) => ({ id: b.id, label: b.label })) : [],
    };
  }

  /** Everything the pane shows, as plain data. */
  screen(): SpaceScreen {
    const conv = this.conv;
    const title = this.screenTitle();
    const kind = this.subject.type;
    const typing = !!this.typedMode;
    const box: SpaceScreen['box'] = { show: this.hasDoor || typing, placeholder: typing ? typedHint(null) : SPACE_MODE_WORDS.placeholder, hints: [], hintsLead: SPACE_MODE_WORDS.hintsLead, draft: this.draft };
    if (!conv) {
      return { kind, title, loading: this.loading, failed: this.failed, earlier: null, turns: [], status: null, ask: null, after: this.local.map(screenTurn), note: this.note, empty: null, reading: this.reading, answering: this.answering, unlock: { show: false, busy: false, failed: false }, box };
    }
    const view = spaceModeView(conv, this.focusLineId);
    const anyLocked = conv.history.some((t) => isLockedText(t.text)) || (!!view.ask && isLockedText(view.ask.text));
    return {
      kind,
      title,
      loading: this.loading,
      failed: this.failed,
      earlier: this.earlier === 'loading' ? 'loading' : this.earlier === 'none' ? (this.showNothingEarlier ? 'none' : null) : view.earlier ? 'link' : null,
      turns: view.turns.map(screenTurn),
      status: view.status,
      ask: view.ask ? this.screenAsk(view.ask) : null,
      after: this.local.map(screenTurn),
      note: this.note,
      empty: !this.hasDoor && !view.ask && !this.loading && this.local.length === 0 ? LINE_CONVERSATION_WORDS.nothingOpen : null,
      reading: this.reading,
      answering: this.answering,
      unlock: { show: this.needsUnlock || anyLocked, busy: this.unlocking, failed: this.unlockFailed },
      box: { ...box, placeholder: typing ? typedHint(view.ask?.line) : view.box.placeholder, hints: typing ? [] : view.box.hints, hintsLead: view.box.hintsLead },
    };
  }
}
