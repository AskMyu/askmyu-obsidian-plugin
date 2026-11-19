/**
 * PrepView — the meeting's page beside your notes (2026-10-29: the prep as Myu's brief, with the person's list inside
 * it; BRIEF_WEB_PREP_NOTES §2, the doors in BRIEF_BACKEND_PREP_NOTES §2–§12). One page per meeting across time.
 *
 * Before, in the web page's order (`PrepCard.tsx`), in the vault's register (hairline zones, whisper labels, Myu's
 * own words in the serif voice under a label that says so, facts as rows with a label and a source):
 *   the title, the when, "Your private notes for this meeting.";
 *   Myu's brief: its paragraphs, then its question; while Myu reads, the words that say so (taking longer, or could
 *     not read it this time: Try again ▸). Nothing waits on it: the list and the people are there from the first read;
 *   the list: a live checkbox per item, its words edited in place, ×, a row dragged to a new place; the add box under
 *     it ("Add an item to your list", Add; Enter adds; several lines add several items); Myu's suggestions "+ {text}";
 *   a question that is not the list's own (who someone reports to: `prepAskIsList`), and the arc;
 *   the top parts the brief did not cover ("Since last time"), each with its "why ▸"; the interview kind;
 *   the room's one line; the people: the name, the one useful line, "{n} open", more ▾ / less ▴ for the rows with
 *     their sources (open at first when the server says so), Full card ▸; a thin person is the line alone;
 *   before you go in, as rows; "Past 1:1s with {first} ▸" lists the past meetings, each opening its own page.
 * In the meeting (`state: now`): NOW, Join the call ▸, the list with "2 of 3" and "+ add", the notes (saved as typed),
 *   "Myu won't interrupt…", Myu's prep folded to one line (the person's fold), Done ▸.
 * After: "2 of 3 covered" and where an unticked item went, the notes as text, Myu's report with its suggestions,
 *   what it read in the notes (action items with ×, the reminder with Yes ▸), Myu's prep folded.
 * The page has no chat of its own: the meeting's conversation is the chat pane's (Today's Open ▸ opens it there).
 *
 * Every line with evidence carries a quiet "why ▸" that lists it (label, dated by the server); what an item opens is
 * `evidenceOpening` (prepCard.ts). Every sentence is the server's, printed as sent; the labels are `PREP_LIST_WORDS`
 * and `PREP_WORDS` (shared's, copied) and `PREP_VIEW_WORDS`. A read that is not version 2 is not drawn: it reads as
 * the failed words.
 */

import { ItemView, Platform, WorkspaceLeaf } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { AfterItem, PastedBlockWire, PrepAfter, PrepCardV2, PrepHistoryRow, PrepInterview, PrepLineRef, PrepListItem, PrepPerson, PrepState, PrepSuggestion, PrepTopPart, SpaceAnswer } from '../wire';
import {
  PREP_VIEW_WORDS,
  PREP_WORDS,
  answerPrepLine,
  answerPrepPick,
  evidenceOpening,
  isPrepV2,
  meetingNoteLines,
  prepDocument,
  prepEvidenceFor,
  prepNotRepliedLabel,
  prepOccurrenceKey,
  prepPartLabel,
  prepPersonHasMore,
  prepAskMode,
  prepShortDate,
  sendPrepAnswer,
  type EvidenceOpening,
  type PrepAnswer,
} from '../prepCard';
import {
  NOTES_SAVE_MS,
  PREP_LIST_WORDS,
  READING_LONG_MS,
  READING_POLL_MS,
  prepAskIsList,
  prepCoveredLabel,
  prepFirstName,
  prepHistoryLink,
  prepHistoryRowWords,
  prepPersonLine,
  prepPersonRows,
  prepPersonStrip,
  prepReadingStage,
  prepStateOf,
  prepSuggestionTarget,
  prepWhenWords,
} from '../prepList';
import { PrepListKeeper } from '../prepListKeeper';
import {
  MEETING_POST_WORDS,
  foldMemoryKey,
  owedRow,
  postDate,
  postDay,
  postFolds,
  postHasRecord,
  postItemState,
  sinceLastMeeting,
  sinceLastRow,
  sourceLines,
  todoRow,
  yoursLabel,
  pastMeetingWords,
  type FoldKey,
} from '../meetingPost';
import { LINE_ANSWER_WORDS } from '../lineAnswers';
import type { PrepHistoryOf, PrepMeetingRef } from '../transport/api';
import { renderPrepAddBox, renderPrepItems } from './prepListRows';
import { canSendPicks, pickManyAnswer, pickManyParts, togglePick, typedAnswer, typedHint } from '../pickMany';
import { PASTE_WORDS, canPutBack, chipAdded, pastedBlocksProblem, putBackText, undoChip, type PasteUndo } from '../pastedText';
import { announce, attachPasteListeners, isUndoKey, pastedLiveRegion, renderPastedRow } from './pastedChips';
import { PastedTextModal } from './PastedTextModal';
import { lineIdAttr } from '../linesSeenWatch';
import { mayAskOf } from '../lastMomentsVault';
import { renderMayAsk } from './lastMomentsParts';

export const PREP_VIEW_TYPE = 'askmyu-prep';

/** The parts Myu's brief speaks to itself (what the meeting is for, your moves): not drawn again beside it. */
const BRIEF_PARTS = new Set(['purpose', 'moves']);
/** How long the page keeps reading while Myu reads (the meeting's line update reads it sooner), and after Done. */
const READING_GIVE_UP_MS = READING_LONG_MS * 6;
const REPORT_WAIT_MS = READING_LONG_MS * 3;
/** After the meeting with no record yet (notes from Drive come in when it syncs): the page reads again each minute. */
const RECORD_POLL_MS = 60_000;

const W = PREP_LIST_WORDS;
const P = MEETING_POST_WORDS;


/** A meeting's notes shown in place (the vault had no note for it), under the door that asked. */
interface InlineNotes {
  where: string;
  meetingId: string;
  state: 'loading' | 'failed' | 'shown';
  lines: string[];
}

/** A person block of the brief's shape (2026-10-29: the line, the rows), not a card from before it. */
function isSliced(p: PrepPerson): boolean {
  return p.line !== undefined || p.line_kind !== undefined || Array.isArray(p.changed) || Array.isArray(p.open);
}

/** An http(s) address, or nothing (the call's link opens in the browser). */
function webUrl(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

const failedWords = (error: string | null | undefined): string => (error === 'offline' ? LINE_ANSWER_WORDS.offline : PREP_VIEW_WORDS.listFailed);

export class PrepView extends ItemView {
  private prep: PrepCardV2 | null = null;
  private eventId: string | null = null;
  private state: 'idle' | 'loading' | 'failed' | 'unknown' = 'idle';
  /** Guards a slow read for an earlier meeting from painting over the one now asked for. */
  private readSeq = 0;
  /** Which "why ▸" lists are open, by line key. */
  private openWhy = new Set<string>();
  /** People opened or folded by hand, by place; the rest follow the server's `open_default`. */
  private peopleOpen = new Map<number, boolean>();
  /** A meeting's notes shown in place: one at a time, under the door that asked. */
  private notes: InlineNotes | null = null;
  /** The question before: the typed words, and whether a line is being answered. */
  private draft = '';
  /** Pasted text in the question's box, as chips (2026-10-06): sent beside the draft, cleared with it. */
  private pasted: PastedBlockWire[] = [];
  /** The last paste that became a chip, while Undo can put it back inline. */
  private undo: PasteUndo | null = null;
  /** The box, its chip row and Send, as drawn last: a chip redraws the row in place, never the card. */
  private inputEl: HTMLInputElement | null = null;
  private pastedRowEl: HTMLElement | null = null;
  private sendEl: HTMLButtonElement | null = null;
  /** The pane's live region, outside contentEl (which every render empties). */
  private liveEl: HTMLElement | null = null;
  private busy = false;
  /** A pick inside the card (2026-10-04): the people picked, "Someone else" pressed and the name typed, for `pickFor`. */
  private picked: string[] = [];
  private naming = false;
  private name = '';
  private pickFor: string | null = null;
  /** Under the question or the arc when an answer did not go (or the line stays up and says why). */
  private notesUnder = new Map<string, string>();
  /** What Myu said back once a line was answered: shown where it was, since the card reads again without it. */
  private said: string | null = null;
  /** Lines answered here: not drawn again, even from a card read before the answer landed. */
  private answered = new Set<string>();

  /** The person's list for this meeting (2026-10-29): every change shows at once and goes through the list's doors. */
  private list: PrepListKeeper = this.newList(null);
  /** In the meeting: "+ add" opened the add box for the thing that just came up. */
  private addOpen = false;
  /** Myu's prep in the meeting and after: folded to one line until the person opens it. */
  private prepOpen = false;
  /** The meeting's notes as typed (the box's words while the page shows this meeting), and their save. */
  private notesDraft: string | null = null;
  private notesTimer: number | null = null;
  private notesFailed = false;
  private notesFocused = false;
  private notesStatusEl: HTMLElement | null = null;
  /** When Myu began reading this meeting (for "Taking longer than usual"), and the read that follows. */
  private readingSince: number | null = null;
  private rereadTimer: number | null = null;
  /** Done was pressed at: the page reads again until Myu's report is there, for a while. */
  private doneAt: number | null = null;
  private doneBusy = false;
  private doneNote: string | null = null;
  /** The past 1:1s, once asked for. */
  private history: { state: 'loading' | 'failed' | 'shown'; rows: PrepHistoryRow[]; across?: string | null } | null = null;
  /** After: action items and reminders being answered, and what did not go. */
  private afterBusy = new Set<string>();
  private afterNote: string | null = null;
  /** Suggestions taken for another meeting's list (after this one): on their way or added, by their words; what did not go. */
  private offeredElsewhere = new Map<string, 'busy' | 'added'>();
  private suggestNote: string | null = null;
  /**
   * The post (2026-10-30): each fold open or shut, as the person left it (also remembered in the vault's local storage,
   * `foldMemoryKey`); a person's own rows under Owed by others; a to-do dropped and what did not go.
   */
  private folds = new Map<string, boolean>();
  private owedOpen = new Set<string>();
  private yoursNote: string | null = null;
  /** They may ask about (2026-11-13): which items are open to their sources. */
  private mayAskOpen = new Set<string>();

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: AskMyuPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return PREP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.prep?.title ? `Myu — ${this.prep.title}` : PREP_VIEW_WORDS.pane;
  }

  override getIcon(): string {
    return 'target';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('myu-today');
    this.liveEl = pastedLiveRegion(this.containerEl);
    // "Seen" (2026-10-06): the card's question and the arc's invitation, in view for a second.
    this.plugin.linesSeen?.watch(this.contentEl);
    this.render();
  }

  override async onClose(): Promise<void> {
    void this.flushNotes();
    this.clearReread();
    this.plugin.linesSeen?.unwatch(this.contentEl);
    this.contentEl.empty();
  }

  /** Show a meeting's page: everything opened or typed for the one before starts fresh (its notes are saved first). */
  async showMeeting(eventId: string): Promise<void> {
    void this.flushNotes();
    this.clearReread();
    this.eventId = eventId;
    this.state = 'loading';
    this.prep = null;
    this.openWhy.clear();
    this.peopleOpen.clear();
    this.notes = null;
    this.notesUnder.clear();
    this.answered.clear();
    this.draft = '';
    this.pasted = [];
    this.undo = null;
    this.busy = false;
    this.said = null;
    this.pickFor = null;
    this.list = this.newList(eventId);
    this.addOpen = false;
    this.prepOpen = false;
    this.notesDraft = null;
    this.notesFailed = false;
    this.notesFocused = false;
    this.readingSince = null;
    this.doneAt = null;
    this.doneBusy = false;
    this.doneNote = null;
    this.history = null;
    this.afterBusy.clear();
    this.afterNote = null;
    this.offeredElsewhere.clear();
    this.suggestNote = null;
    this.folds.clear();
    this.owedOpen.clear();
    this.yoursNote = null;
    this.mayAskOpen.clear();
    this.render();
    await this.readCard();
    // The cursor goes to the list's add on a desktop (a phone's keyboard would cover the page).
    if (this.eventId === eventId && this.prep && prepStateOf(this.prep) === 'before' && Platform.isDesktopApp) {
      this.list.addFocused = true;
      this.render();
    }
  }

  /**
   * A line changed on the server: while Myu is still reading this meeting, or after it while its record has not come in,
   * the page reads again now.
   */
  lineUpdated(): void {
    const prep = this.prep;
    if (prep && (prep.reading || prep.after?.reading || (prepStateOf(prep) === 'after' && !postHasRecord(prep.after)))) void this.readCard(true);
  }

  /** The list changed elsewhere (a Today row, an offer in the chat pane): this meeting's page reads again. */
  listChanged(eventId: string | null | undefined): void {
    if (this.prep && (!eventId || eventId === this.eventId)) void this.readCard(true);
  }

  /** Read the card. `quiet`: the one on screen stays while it reads (after an answer, while Myu reads). */
  private async readCard(quiet = false): Promise<void> {
    const eventId = this.eventId;
    if (!eventId) return;
    const seq = ++this.readSeq;
    if (!quiet) {
      this.state = 'loading';
      this.render();
    }
    const res = await this.plugin.backend.getMeetingPrep(eventId).catch(() => null);
    if (seq !== this.readSeq || eventId !== this.eventId) return;
    const prep = res?.ok ? res.data?.prep : null;
    if (isPrepV2(prep)) {
      this.prep = prep;
      this.state = 'idle';
      this.followReading(prep);
    } else if (!quiet || !this.prep) {
      // A card from before version 2 (or none) is not drawn.
      this.prep = null;
      this.state = res?.status === 404 ? 'unknown' : 'failed';
    }
    this.render();
  }

  /**
   * While Myu reads the meeting the page reads again every few seconds (and at once on the meeting's line update),
   * for a while; after Done, until Myu's report is there. Then it stays still.
   */
  private followReading(prep: PrepCardV2): void {
    this.clearReread();
    const now = Date.now();
    // Myu reading the meeting before it, or writing its report after it (`after.reading`): the same few seconds' read.
    if ((prep.reading && !prep.reading_failed) || (prepStateOf(prep) === 'after' && prep.after?.reading)) {
      this.readingSince ??= now;
      if (now - this.readingSince < READING_GIVE_UP_MS) this.reread(READING_POLL_MS);
      return;
    }
    this.readingSince = null;
    const after = prep.after;
    const waitingForReport = prepStateOf(prep) === 'after' && !after?.report && !after?.report_failed;
    if (this.doneAt !== null && waitingForReport && now - this.doneAt < REPORT_WAIT_MS) {
      this.reread(READING_POLL_MS);
      return;
    }
    // After, with no record yet: each minute while the page is open, so the record appears in place when it comes.
    if (prepStateOf(prep) === 'after' && !postHasRecord(after)) this.reread(RECORD_POLL_MS);
  }

  private reread(ms: number): void {
    this.rereadTimer = window.setTimeout(() => {
      this.rereadTimer = null;
      void this.readCard(true);
    }, ms);
  }

  private clearReread(): void {
    if (this.rereadTimer !== null) window.clearTimeout(this.rereadTimer);
    this.rereadTimer = null;
  }

  /** This meeting as the list's doors name it. */
  private meetingRef(): PrepMeetingRef | null {
    const prep = this.prep;
    return prep ? { event_id: prep.event_id, occurrence_key: prepOccurrenceKey(prep) } : null;
  }

  /**
   * The list's keeper for one meeting: its items are that meeting's card's, in their order. A change still on its way
   * when another meeting is opened lands nowhere on the page (the next read of that meeting shows it).
   */
  private newList(eventId: string | null): PrepListKeeper {
    const mine = () => (this.prep && this.prep.event_id === eventId ? this.prep : null);
    return new PrepListKeeper({
      backend: () => this.plugin.backend,
      meeting: () => (mine() ? this.meetingRef() : null),
      items: () => [...(mine()?.items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      setItems: (items) => {
        const prep = mine();
        if (!prep) return;
        this.prep = { ...prep, items, covered: { done: items.filter((i) => i.done).length, total: items.length } };
      },
      onChange: () => {
        if (this.eventId === eventId) this.render();
      },
      // Today's row for this meeting reads again.
      onSaved: () => this.plugin.requestTodayRefresh(),
    });
  }

  // ── what the buttons do ───────────────────────────────────────────────────

  /** The question before, typed: into the meeting's own conversation. Then the card reads again. */
  private async sendAnswer(ask: PrepLineRef): Promise<void> {
    const prep = this.prep;
    const pasted = [...this.pasted];
    if (!prep || this.busy || (!this.draft.trim() && pasted.length === 0)) return;
    // Over a cap: nothing is sent; the row says why.
    if (pastedBlocksProblem(pasted)) return;
    this.busy = true;
    this.undo = null;
    this.notesUnder.delete(ask.line_id);
    this.render();
    const out = await sendPrepAnswer(this.plugin.backend, prep, this.draft, pasted);
    // The pane moved to another meeting meanwhile: nothing of this one is painted there.
    if (this.eventId !== prep.event_id) return;
    this.busy = false;
    if (out.note) {
      // The typed words went but the pasted text did not: the chips stay in the box, the words go.
      if (out.pastedLost) this.draft = '';
      this.notesUnder.set(ask.line_id, out.note);
      this.render();
      return;
    }
    this.draft = '';
    this.pasted = [];
    await this.afterAnswer(ask, out);
  }

  // ── pasted text in the question's box (2026-10-06) ──────────────────────────

  /** The chip row and Send's hold, redrawn in place: the box itself is never touched. */
  private drawPasted(): void {
    if (this.pastedRowEl) {
      renderPastedRow(this.pastedRowEl, this.pasted, {
        open: (id) => this.openPasted(id),
        remove: (id) => this.removePasted(id),
        undo: this.undo ? () => this.undoPaste() : null,
      });
    }
    if (this.sendEl) this.sendEl.disabled = this.busy || !!pastedBlocksProblem(this.pasted);
  }

  private addPasted(text: string, source: 'paste' | 'drop', at: number): void {
    const out = chipAdded(this.pasted, text, source, at);
    this.pasted = out.chips;
    this.undo = out.undo;
    if (this.inputEl) this.draft = this.inputEl.value;
    announce(this.liveEl, PASTE_WORDS.announce(out.chip.chars));
    this.drawPasted();
  }

  private undoPaste(): void {
    const input = this.inputEl;
    const undo = this.undo;
    this.undo = null;
    const out = input && undo ? undoChip(input.value, this.pasted, undo) : null;
    if (input && out) {
      this.pasted = out.chips;
      input.value = out.value;
      this.draft = out.value;
    }
    this.drawPasted();
    if (input && out) {
      input.focus();
      input.setSelectionRange(out.caret, out.caret);
    }
  }

  private removePasted(id: string): void {
    this.pasted = this.pasted.filter((c) => c.id !== id);
    this.undo = null;
    this.drawPasted();
    this.inputEl?.focus();
  }

  private openPasted(id: string): void {
    const at = this.pasted.findIndex((c) => c.id === id);
    const chip = this.pasted[at];
    if (!chip) return;
    const n = this.pasted.length > 1 ? at + 1 : undefined;
    new PastedTextModal(this.app, chip, n, this.draft, {
      putBack: () => {
        if (!canPutBack(this.draft, chip).ok) return;
        this.draft = putBackText(this.draft, chip);
        this.pasted = this.pasted.filter((c) => c !== chip);
        this.undo = null;
        const input = this.inputEl;
        if (input) input.value = this.draft;
        this.drawPasted();
        if (input) {
          input.focus();
          input.setSelectionRange(this.draft.length, this.draft.length);
        }
      },
      remove: () => this.removePasted(id),
    }).open();
  }

  /** One of a line's own choices (the question's Skip, the arc's Hold time / Now / Skip). */
  private async choose(line: PrepLineRef, choiceId: string): Promise<void> {
    const prep = this.prep;
    if (!prep || this.busy) return;
    this.busy = true;
    this.notesUnder.delete(line.line_id);
    this.render();
    const out = await answerPrepLine(this.plugin.backend, prep, line, choiceId);
    for (const url of out.open) window.open(url, '_blank');
    // Now: the meeting's own conversation, where Myu has written the first turn.
    if (out.conversation) void this.plugin.openConversationRef(out.conversation, prep.title);
    // The pane moved to another meeting meanwhile: nothing of this one is painted there.
    if (this.eventId !== prep.event_id) return;
    this.busy = false;
    if (out.note) {
      this.notesUnder.set(line.line_id, out.note);
      this.render();
      return;
    }
    await this.afterAnswer(line, out);
  }

  /** A pick inside the card: a typed name, or the picks sent together. The card reads again after. */
  private async answerPick(line: PrepLineRef, answer: SpaceAnswer | null): Promise<void> {
    const prep = this.prep;
    if (!prep || this.busy || !answer) return;
    this.busy = true;
    this.notesUnder.delete(line.line_id);
    this.render();
    const out = await answerPrepPick(this.plugin.backend, line, answer);
    if (this.eventId !== prep.event_id) return;
    this.busy = false;
    if (out.note) {
      this.notesUnder.set(line.line_id, out.note);
      this.render();
      return;
    }
    await this.afterAnswer(line, out);
  }

  /** A settled line leaves the card (what Myu said back stays in its place); the card and Today read again. */
  private async afterAnswer(line: PrepLineRef, out: PrepAnswer): Promise<void> {
    if (!out.closed) {
      this.answered.add(line.line_id);
      this.said = out.said?.trim() || null;
    }
    this.plugin.requestTodayRefresh();
    await this.readCard(true);
  }

  private openEvidence(how: EvidenceOpening, prep: PrepCardV2, where: string): void {
    switch (how.kind) {
      case 'link':
        window.open(how.url, '_blank');
        return;
      case 'journal':
        void this.plugin.openConversation(how.id);
        return;
      case 'space':
        void this.plugin.openChatAbout('space', how.id, { label: prep.room.team?.space_id === how.id ? prep.room.team.name : '' });
        return;
      case 'meeting':
        void this.openMeetingNotes(how.id, where);
        return;
    }
  }

  /**
   * A meeting's notes: its note in Myu's folder when the vault has one; else its notes here, under
   * the door that asked (pressed again, they fold away).
   */
  private async openMeetingNotes(meetingId: string, where: string): Promise<void> {
    if (this.notes?.where === where && this.notes.meetingId === meetingId && this.notes.state !== 'loading') {
      this.notes = null;
      this.render();
      return;
    }
    if (await this.plugin.openMeetingNote(meetingId).catch(() => false)) return;
    const asked: InlineNotes = { where, meetingId, state: 'loading', lines: [] };
    this.notes = asked;
    this.render();
    const res = await this.plugin.backend.getMeetingDetail(meetingId).catch(() => null);
    if (this.notes !== asked) return;
    this.notes = res?.ok ? { ...asked, state: 'shown', lines: meetingNoteLines(res.data) } : { ...asked, state: 'failed' };
    this.render();
  }

  // ── the meeting and after (2026-10-29) ─────────────────────────────────────

  /** The notes as typed: saved a moment after the last key (last write wins), never on each one. */
  private scheduleNotesSave(): void {
    if (this.notesTimer !== null) window.clearTimeout(this.notesTimer);
    this.notesTimer = window.setTimeout(() => {
      this.notesTimer = null;
      void this.saveNotes();
    }, NOTES_SAVE_MS);
  }

  /** A save that is waiting goes now (another meeting is opened, the pane closes, Done). */
  private async flushNotes(): Promise<void> {
    if (this.notesTimer === null) return;
    window.clearTimeout(this.notesTimer);
    this.notesTimer = null;
    await this.saveNotes();
  }

  private async saveNotes(): Promise<void> {
    const ref = this.meetingRef();
    const text = this.notesDraft;
    if (!ref || text === null) return;
    const res = await this.plugin.backend.savePrepNotes(ref, text).catch(() => null);
    if (this.eventId !== ref.event_id) return;
    const failed = !res?.ok;
    if (!failed && this.prep) this.prep = { ...this.prep, notes: res.data?.notes ?? { text } };
    if (failed === this.notesFailed) return;
    this.notesFailed = failed;
    // The label says it in place: the box keeps its caret.
    this.notesStatusEl?.setText(failed ? PREP_VIEW_WORDS.notesNotSaved : W.savedAsYouType);
  }

  /** Done, the person's: the notes are saved, what had no tick carries, and the page reads again for Myu's report. */
  private async done(): Promise<void> {
    const ref = this.meetingRef();
    if (!ref || this.doneBusy) return;
    this.doneBusy = true;
    this.doneNote = null;
    this.render();
    await this.flushNotes();
    const res = await this.plugin.backend.prepDone(ref).catch(() => null);
    if (this.eventId !== ref.event_id) return;
    this.doneBusy = false;
    if (!res?.ok) {
      this.doneNote = failedWords(res?.error);
      this.render();
      return;
    }
    this.doneAt = Date.now();
    this.plugin.requestTodayRefresh();
    await this.readCard(true);
  }

  /** An action item Myu read in the notes, removed before it is kept. */
  private async removeAction(id: string): Promise<void> {
    const ref = this.meetingRef();
    if (!ref || this.afterBusy.has(id)) return;
    this.afterBusy.add(id);
    this.afterNote = null;
    this.render();
    const res = await this.plugin.backend.removePrepAction(ref, id).catch(() => null);
    if (this.eventId !== ref.event_id) return;
    this.afterBusy.delete(id);
    if (res?.ok && this.prep?.after) {
      this.prep = { ...this.prep, after: { ...this.prep.after, action_items: (this.prep.after.action_items ?? []).filter((a) => a.id !== id) } };
    } else if (!res?.ok) {
      this.afterNote = failedWords(res?.error);
    }
    this.render();
  }

  /** The reminder Myu offered: Yes ▸ takes it (a line on the morning you next meet), × lets it go. */
  private async answerReminder(id: string, yes: boolean): Promise<void> {
    const ref = this.meetingRef();
    if (!ref || this.afterBusy.has(id)) return;
    this.afterBusy.add(id);
    this.afterNote = null;
    this.render();
    const res = await this.plugin.backend.answerPrepReminder(ref, id, yes).catch(() => null);
    if (this.eventId !== ref.event_id) return;
    this.afterBusy.delete(id);
    if (res?.ok && this.prep?.after) {
      const reminders = (this.prep.after.reminders ?? []).map((r) => (r.id === id ? { ...r, status: yes ? 'accepted' : 'declined' } : r));
      this.prep = { ...this.prep, after: { ...this.prep.after, reminders } };
    } else if (!res?.ok) {
      this.afterNote = failedWords(res?.error);
    }
    this.render();
  }

  /**
   * "Past 1:1s with Reid ▸" (a 1:1, by the person) or "Earlier Roadmap sync ▸" (a recurring meeting, by its series): the
   * past meetings under the link (pressed again, they fold away).
   */
  private async toggleHistory(of: PrepHistoryOf): Promise<void> {
    if (this.history && this.history.state !== 'loading') {
      this.history = null;
      this.render();
      return;
    }
    const eventId = this.eventId;
    const asked: NonNullable<PrepView['history']> = { state: 'loading', rows: [] };
    this.history = asked;
    this.render();
    const res = await this.plugin.backend.getPrepHistory(of).catch(() => null);
    if (this.eventId !== eventId || this.history !== asked) return;
    // The meeting on the page is not one of its own past meetings.
    const rows = (res?.data?.history ?? []).filter((r) => r.event_id && r.event_id !== eventId);
    this.history = res?.ok ? { state: 'shown', rows, across: res.data?.across?.text?.trim() || null } : { state: 'failed', rows: [] };
    this.render();
  }

  // ── render ────────────────────────────────────────────────────────────────

  private render(): void {
    const root = this.contentEl;
    root.empty();
    this.inputEl = null;
    this.pastedRowEl = null;
    this.sendEl = null;
    this.notesStatusEl = null;

    if (this.state === 'loading') {
      root.createEl('p', { cls: 'myu-quiet', text: PREP_WORDS.loading });
      return;
    }
    if (this.state === 'unknown') {
      root.createEl('p', { cls: 'myu-quiet', text: PREP_VIEW_WORDS.unknown });
      return;
    }
    if (this.state === 'failed' || !this.prep) {
      if (this.state !== 'failed') return;
      root.createEl('p', { cls: 'myu-quiet', text: PREP_WORDS.failed });
      const retry = root.createEl('button', { cls: 'myu-affordance', text: PREP_VIEW_WORDS.retry });
      retry.onclick = () => void this.readCard();
      return;
    }
    const prep = this.prep;
    const state = prepStateOf(prep);

    this.renderHead(root, prep, state);
    if (prep.partial) root.createEl('p', { cls: 'myu-quiet myu-prep-partial', text: PREP_WORDS.partial });
    if (this.said) {
      const said = root.createDiv({ cls: 'myu-prep-said' });
      said.createDiv({ cls: 'myu-whisper', text: PREP_VIEW_WORDS.myu });
      said.createDiv({ cls: 'myu-voice', text: this.said });
    }

    if (state === 'before') {
      const drawn = this.renderBrief(root, prep);
      this.renderList(root, prep, state);
      // A question that is not the list's own, and the arc (neither rides on the meeting or after it).
      if (prep.ask && !this.answered.has(prep.ask.line_id) && !prepAskIsList(prep.ask)) this.renderAsk(root, prep.ask);
      if (prep.arc && !this.answered.has(prep.arc.line_id)) this.renderArc(root, prep.arc);
      this.renderDossier(root, prep, drawn);
      return;
    }
    if (state === 'now') {
      this.renderList(root, prep, state);
      this.renderNotesBox(root, prep);
      root.createDiv({ cls: 'myu-quiet myu-prep-quiet-line', text: W.quiet });
      this.renderFold(root, prep);
      this.renderDone(root);
      return;
    }
    // After: the meeting's record. What wrote it, Myu's report (or the line for nothing at all), then — with a record —
    // Yours, always open, and the rest as one line each with its count; before the record comes in, the ticks, the
    // carry and the notes as the person left them, still editable.
    this.renderSources(root, prep);
    this.renderReport(root, prep);
    if (postHasRecord(prep.after)) {
      this.renderYours(root, prep);
      this.renderPostFolds(root, prep);
    } else {
      this.renderList(root, prep, state);
      this.renderNotesBox(root, prep);
      this.renderFromNotes(root, prep);
    }
    this.renderFold(root, prep);
  }

  /** The title (NOW beside it in the meeting), the when, "Your private notes for this meeting.", Join the call ▸. */
  private renderHead(root: HTMLElement, prep: PrepCardV2, state: PrepState): void {
    const head = root.createDiv({ cls: 'myu-prep-head' });
    const title = head.createDiv({ cls: 'myu-card-title', text: prep.title });
    if (state === 'now') title.createSpan({ cls: 'myu-prep-now', text: W.now });
    const when = prepWhenWords(prep.starts_at);
    if (when) head.createDiv({ cls: 'myu-quiet myu-prep-meeting', text: when });
    head.createDiv({ cls: 'myu-quiet myu-prep-private', text: W.privateNotes });
    const join = state === 'now' ? webUrl(prep.join_url) : null;
    if (!join) return;
    const call = head.createEl('button', { cls: 'myu-affordance myu-prep-join', text: W.join });
    call.onclick = () => window.open(join, '_blank');
  }

  /**
   * Myu's brief in its voice: the paragraphs, then the question on its own line. While Myu reads, its place says so
   * (two quiet placeholder lines under the words); after about twenty seconds, that it is taking longer; when it could
   * not, "Try again ▸" reads the meeting again. A card from before the brief draws its top parts in its place.
   * Returns what it drew there.
   */
  private renderBrief(root: HTMLElement, prep: PrepCardV2): 'brief' | 'stage' | 'top' | null {
    const stage = prepReadingStage(prep, this.readingSince === null ? 0 : Date.now() - this.readingSince);
    const paragraphs = (prep.brief?.paragraphs ?? []).map((p) => p.trim()).filter(Boolean);
    const question = prep.brief?.question?.trim() ?? '';
    if (!stage && !paragraphs.length) {
      if (!prep.top.length) return null;
      this.renderTop(root, prep, prep.top.map((t, i) => [t, i]));
      return 'top';
    }
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-brief' });
    zone.createDiv({ cls: 'myu-whisper', text: PREP_VIEW_WORDS.myu });
    for (const p of paragraphs) zone.createEl('p', { cls: 'myu-voice myu-prep-brief-p', text: p });
    if (stage === 'failed') {
      const again = zone.createEl('button', { cls: 'myu-aff myu-prep-reading', text: W.readingFailed });
      again.onclick = () => {
        this.readingSince = null;
        void this.readCard(true);
      };
    } else if (stage) {
      zone.createEl('p', { cls: 'myu-voice myu-prep-reading', text: stage === 'long' ? W.readingLong : W.reading });
      if (stage === 'reading' && !paragraphs.length) {
        zone.createDiv({ cls: 'myu-prep-placeholder' });
        zone.createDiv({ cls: 'myu-prep-placeholder myu-prep-placeholder-short' });
      }
    }
    if (question && (paragraphs.length || stage !== 'failed')) zone.createEl('p', { cls: 'myu-voice myu-prep-question', text: question });
    return paragraphs.length ? 'brief' : 'stage';
  }

  /**
   * The list: in the meeting and after, its label with the count ("2 of 3", "2 of 3 covered") and, in the meeting,
   * "+ add" for the thing that just came up; the items; the add box (before the meeting, or opened by "+ add"); what
   * did not go; before the meeting, Myu's suggestions under it.
   */
  private renderList(root: HTMLElement, prep: PrepCardV2, state: PrepState): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-cover', attr: { 'data-state': state } });
    if (state !== 'before') {
      const label = zone.createDiv({ cls: 'myu-whisper myu-prep-cover-label', text: W.listLabel });
      const count = prepCoveredLabel(prep);
      if (count) label.createSpan({ cls: 'myu-prep-count', text: count });
      if (state === 'now' && !this.addOpen) {
        const add = label.createEl('button', { cls: 'myu-aff myu-prep-add-link', text: W.addLink });
        add.onclick = () => {
          this.addOpen = true;
          this.list.addFocused = true;
          this.render();
        };
      }
    }
    const list = this.list;
    const items = [...(prep.items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (items.length) renderPrepItems(zone, items, state, list.ui(), list.handlers({ move: state !== 'after' }));
    if (state === 'before' || (state === 'now' && this.addOpen)) {
      renderPrepAddBox(zone, {
        draft: list.draft,
        busy: list.adding,
        onDraft: (text) => {
          list.draft = text;
        },
        onAdd: (text) => void list.add(text),
        focus: list.addFocused,
        onFocus: (focused) => {
          list.addFocused = focused;
        },
      });
    }
    if (list.note) zone.createDiv({ cls: 'myu-quiet myu-line-note', text: list.note });
    if (state === 'before') this.renderSuggestions(zone, prep.brief?.suggestions, items);
  }

  /**
   * Myu's suggestions as "+ {text}": one press puts it where `prepSuggestionTarget` says, as Myu's offer — this
   * meeting's list before and during it; after it, the next meeting's, or the person's or the series' next one — and
   * then it reads as on your list.
   */
  private renderSuggestions(host: HTMLElement, suggestions: PrepSuggestion[] | null | undefined, items: PrepListItem[]): void {
    const shown = (suggestions ?? []).filter((s) => !!s.text?.trim());
    if (!shown.length) return;
    const row = host.createDiv({ cls: 'myu-prep-offers' });
    for (const s of shown) {
      const text = s.text.trim();
      const elsewhere = this.offeredElsewhere.get(text);
      const added = elsewhere === 'added' || this.list.hasOffered(text) || items.some((i) => i.text.trim().toLowerCase() === text.toLowerCase());
      const chip = row.createEl('button', { cls: 'myu-aff myu-prep-offer', text: added ? `${text} · ${W.onYourList}` : W.plus(text), attr: { 'data-added': String(added) } });
      chip.disabled = added || elsewhere === 'busy';
      chip.onclick = () => void this.takeSuggestion(s);
    }
    if (this.suggestNote) host.createDiv({ cls: 'myu-quiet myu-line-note', text: this.suggestNote });
  }

  /** A suggestion taken: onto this meeting's list (shown at once), or where its target says, which is said on the chip. */
  private async takeSuggestion(s: PrepSuggestion): Promise<void> {
    const ref = this.meetingRef();
    const text = s.text.trim();
    if (!ref || !text || this.offeredElsewhere.has(text)) return;
    const target = prepSuggestionTarget(ref, s);
    if (target.event_id === ref.event_id && (target.occurrence_key ?? null) === (ref.occurrence_key ?? null)) {
      await this.list.add(text, 'myu_offer');
      return;
    }
    this.offeredElsewhere.set(text, 'busy');
    this.suggestNote = null;
    this.render();
    const res = await this.plugin.backend.addPrepItems(target, text, 'myu_offer').catch(() => null);
    if (this.eventId !== ref.event_id) return;
    if (res?.ok) {
      this.offeredElsewhere.set(text, 'added');
      // The next meeting's row on Today (or its waiting items) read again.
      this.plugin.requestTodayRefresh();
    } else {
      this.offeredElsewhere.delete(text);
      this.suggestNote = failedWords(res?.error);
    }
    this.render();
  }

  /**
   * What the page knows beyond the list: the top parts the brief did not cover, the interview kind, the room, the
   * people, before you go in.
   */
  private renderDossier(root: HTMLElement, prep: PrepCardV2, drawn: 'brief' | 'stage' | 'top' | null): void {
    // They may ask about (2026-11-13), first, as the web's page has it: up to three, each with what happened and what the person
    // already told them, opening to its sources. Nothing when there is nothing.
    renderMayAsk(root, mayAskOf(prep), this.mayAskOpen);
    if (drawn !== 'top') {
      const parts = prep.top.map((t, i): [PrepTopPart, number] => [t, i]).filter(([t]) => drawn !== 'brief' || !BRIEF_PARTS.has(t.part));
      this.renderTop(root, prep, parts);
    }
    if (prep.interview) this.renderInterview(root, prep.interview);
    this.renderRoom(root, prep);
    this.renderPeople(root, prep);
    this.renderBefore(root, prep);
  }

  /** In the meeting and after: Myu's prep folded to one line; open, the brief and the rest of the page. */
  private renderFold(root: HTMLElement, prep: PrepCardV2): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-fold' });
    const head = zone.createDiv({ cls: 'myu-whisper', text: W.myuPrep });
    const toggle = head.createEl('button', { cls: 'myu-aff myu-prep-fold-toggle', text: this.prepOpen ? W.hide : W.show, attr: { 'aria-expanded': String(this.prepOpen) } });
    toggle.onclick = () => {
      this.prepOpen = !this.prepOpen;
      this.render();
    };
    if (!this.prepOpen) return;
    this.renderDossier(zone, prep, this.renderBrief(zone, prep));
  }

  /** The notes in the meeting (and after it): what's said and decided, saved as typed. The label says when a save did not go. */
  private renderNotesBox(root: HTMLElement, prep: PrepCardV2): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-notes-zone' });
    const label = zone.createDiv({ cls: 'myu-whisper', text: W.notesLabel });
    this.notesStatusEl = label.createSpan({ cls: 'myu-prep-count', text: this.notesFailed ? PREP_VIEW_WORDS.notesNotSaved : W.savedAsYouType });
    this.notesBox(zone, prep);
  }

  /** The notes' box itself: the words as typed (or as saved), each key saving a moment later. */
  private notesBox(host: HTMLElement, prep: PrepCardV2): void {
    const box = host.createEl('textarea', { cls: 'myu-prep-notes-box', attr: { rows: '6', placeholder: W.notesPlaceholder, 'aria-label': W.notesLabel } });
    box.value = this.notesDraft ?? prep.notes?.text ?? prep.after?.notes?.text ?? '';
    box.oninput = () => {
      this.notesDraft = box.value;
      this.scheduleNotesSave();
    };
    box.onfocus = () => {
      this.notesFocused = true;
    };
    // A redraw takes the box away (and blurs it): only a blur that leaves the box on the page is the person moving on.
    box.onblur = () => queueMicrotask(() => {
      if (box.isConnected) this.notesFocused = false;
    });
    // A read while typing redraws the page: the box gets the focus back.
    if (this.notesFocused) {
      queueMicrotask(() => {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      });
    }
  }

  /** Done ▸, the one thing in the actions row. */
  private renderDone(root: HTMLElement): void {
    const foot = root.createDiv({ cls: 'myu-prep-foot' });
    const done = foot.createEl('button', { cls: 'myu-affordance myu-cta myu-prep-done', text: W.done });
    done.disabled = this.doneBusy;
    done.onclick = () => void this.done();
    if (this.doneNote) foot.createDiv({ cls: 'myu-quiet myu-line-note', text: this.doneNote });
  }

  /**
   * After: Myu's report in its voice (the question on its own line, when it asks one), its suggestions as "+ {text}";
   * with nothing at all written, the server's line for that, in the plain face.
   */
  private renderReport(root: HTMLElement, prep: PrepCardV2): void {
    const report = prep.after?.report;
    const paragraphs = (report?.paragraphs ?? []).map((p) => p.trim()).filter(Boolean);
    const question = report?.question?.trim() ?? '';
    const nothing = prep.after?.nothing?.trim() ?? '';
    // Myu is writing the report (a record or a tick came in): its place says so until the report is there.
    if (!paragraphs.length && !question && prep.after?.reading) {
      const waited = this.readingSince === null ? 0 : Date.now() - this.readingSince;
      const zone = root.createDiv({ cls: 'myu-zone myu-prep-brief myu-prep-report' });
      zone.createDiv({ cls: 'myu-whisper', text: PREP_VIEW_WORDS.myu });
      zone.createEl('p', { cls: 'myu-voice myu-prep-reading', text: waited >= READING_LONG_MS ? W.readingLong : W.reading });
      zone.createDiv({ cls: 'myu-prep-placeholder' });
      zone.createDiv({ cls: 'myu-prep-placeholder myu-prep-placeholder-short' });
      return;
    }
    if (!paragraphs.length && !question) {
      if (nothing) root.createDiv({ cls: 'myu-zone myu-prep-nothing' }).createEl('p', { cls: 'myu-prep-text', text: nothing });
      return;
    }
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-brief myu-prep-report' });
    zone.createDiv({ cls: 'myu-whisper', text: PREP_VIEW_WORDS.myu });
    for (const p of paragraphs) zone.createEl('p', { cls: 'myu-voice myu-prep-brief-p', text: p });
    if (question) zone.createEl('p', { cls: 'myu-voice myu-prep-question', text: question });
    this.renderSuggestions(zone, report?.suggestions, prep.items ?? []);
  }

  /** What wrote the record, one line each ("Notes by Gemini · 30 Oct"), with "Open the notes ▸" to the source itself. */
  private renderSources(root: HTMLElement, prep: PrepCardV2): void {
    const lines = sourceLines(prep.after);
    if (!lines.length) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-post-sources' });
    lines.forEach((l, i) => {
      const row = zone.createDiv({ cls: 'myu-post-source' });
      row.createSpan({ cls: 'myu-post-source-name', text: l.text });
      const id = l.meeting_id;
      if (!id) return;
      const where = `source:${i}`;
      const open = row.createEl('button', { cls: 'myu-aff myu-prep-open-notes', text: P.openNotes });
      open.onclick = () => void this.openMeetingNotes(id, where);
      this.renderNotes(zone, where);
    });
  }

  /**
   * Yours, always open: "Yours · 3 to do · 2 of 3 covered"; one row per thing you owe from the record (its words, its
   * source under it, its day and × on the right: × drops it from the ledger); then the list's items with what became of
   * them (ticked, came up in the notes, or didn't come up and where it went).
   */
  private renderYours(root: HTMLElement, prep: PrepCardV2): void {
    const after = prep.after;
    const items = [...(prep.items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const zone = root.createDiv({ cls: 'myu-zone myu-post-yours' });
    zone.createDiv({ cls: 'myu-whisper myu-post-yours-label', text: yoursLabel(after, items) });
    for (const t of after?.yours?.todo ?? []) {
      const r = todoRow(t);
      if (!r.text) continue;
      const row = attr(zone, P.toDo, r.text, r.sub, r.right);
      const id = t.commitment_id;
      if (!id) continue;
      row.setAttr('data-commitment', id);
      const x = actsOf(row).createEl('button', { cls: 'myu-aff myu-prep-li-x', text: '×', attr: { 'aria-label': W.remove } });
      x.disabled = this.afterBusy.has(id);
      x.onclick = () => void this.dropTodo(id);
    }
    if (this.yoursNote) zone.createDiv({ cls: 'myu-quiet myu-line-note', text: this.yoursNote });
    if (!items.length) return;
    const list = this.list;
    renderPrepItems(zone, items, 'after', list.ui(), list.handlers({ move: false }), (item) => {
      const st = postItemState(item);
      return st.text ? { text: st.text, drop: st.drop, good: st.kind === 'notes' } : null;
    });
    if (list.note) zone.createDiv({ cls: 'myu-quiet myu-line-note', text: list.note });
  }

  /** × on one of yours: dropped from the ledger (`POST /commitments/update`); gone from Yours when it went. */
  private async dropTodo(id: string): Promise<void> {
    const prep = this.prep;
    if (!prep || this.afterBusy.has(id)) return;
    this.afterBusy.add(id);
    this.yoursNote = null;
    this.render();
    const res = await this.plugin.backend.updateCommitment(id, { status: 'dropped' }).catch(() => null);
    if (this.eventId !== prep.event_id) return;
    this.afterBusy.delete(id);
    const now = this.prep;
    if (res?.ok && now?.after?.yours) {
      this.prep = { ...now, after: { ...now.after, yours: { ...now.after.yours, todo: (now.after.yours.todo ?? []).filter((t) => t.commitment_id !== id) } } };
    } else if (!res?.ok) {
      this.yoursNote = failedWords(res?.error);
    }
    this.render();
  }

  /** A fold's open or shut: as the person left it on this page, else as remembered in the vault, else shut. */
  private foldOpen(key: FoldKey): boolean {
    const eventId = this.eventId ?? '';
    const known = this.folds.get(key);
    if (known !== undefined) return known;
    try {
      const kept: unknown = this.app?.loadLocalStorage?.(foldMemoryKey(eventId, key));
      return kept === true;
    } catch {
      return false;
    }
  }

  private setFold(key: FoldKey, open: boolean): void {
    this.folds.set(key, open);
    try {
      // Kept for this vault on this device only: a convenience, never the record.
      this.app?.saveLocalStorage?.(foldMemoryKey(this.eventId ?? '', key), open ? true : null);
    } catch {
      // A store that refuses keeps the fold for this visit.
    }
    this.render();
  }

  /**
   * The folded sections, each one line with its count and more ▾ / less ▴, shut until opened: Decided; what others owe
   * ({First} owes for a 1:1; Owed by others for a group, one row per person, each opening to their items); Came up;
   * The room (a group); Your notes (editable, as before).
   */
  private renderPostFolds(root: HTMLElement, prep: PrepCardV2): void {
    const after: PrepAfter = { ...(prep.after ?? {}), notes: prep.after?.notes ?? prep.notes ?? null };
    if (this.notesDraft !== null) after.notes = { text: this.notesDraft };
    const first = prep.kind === 'one_on_one' ? prepFirstName(prep.people[0]?.name) : null;
    for (const f of postFolds(after, { kind: prep.kind, firstName: first })) {
      const open = this.foldOpen(f.key);
      const zone = root.createDiv({ cls: 'myu-zone myu-post-fold', attr: { 'data-fold': f.key } });
      const head = zone.createDiv({ cls: 'myu-whisper myu-post-fold-head', text: f.label });
      head.createSpan({ cls: 'myu-prep-count', text: f.count });
      const toggle = head.createEl('button', { cls: 'myu-aff myu-prep-fold-toggle', text: open ? P.less : P.more, attr: { 'aria-expanded': String(open) } });
      toggle.onclick = () => this.setFold(f.key, !open);
      if (!open) continue;
      this.renderFoldBody(zone, f.key, after, prep);
    }
  }

  private renderFoldBody(zone: HTMLElement, key: FoldKey, after: PrepAfter, prep: PrepCardV2): void {
    switch (key) {
      case 'decided':
        for (const d of after.decided ?? []) if (d.text?.trim()) line(zone, d.text.trim(), d.source?.trim() || null, d.at ? postDate(d.at) : null);
        return;
      case 'owed': {
        const owed = after.owed ?? [];
        // A 1:1: the other person's items, as they are. A group: per person first, each opening to their items.
        if (prep.kind === 'one_on_one' && owed.length <= 1) {
          for (const i of owed.flatMap((o) => o.items ?? [])) owedItem(zone, i);
          return;
        }
        for (const o of owed) {
          const r = owedRow(o);
          const row = attr(zone, r.name, r.count, r.gist);
          row.setAttr('data-owner', o.owner);
          const open = this.owedOpen.has(o.owner);
          const more = actsOf(row).createEl('button', { cls: 'myu-aff myu-prep-more', text: open ? P.less : P.more, attr: { 'aria-expanded': String(open) } });
          more.onclick = () => {
            if (open) this.owedOpen.delete(o.owner);
            else this.owedOpen.add(o.owner);
            this.render();
          };
          if (!open) continue;
          const inner = zone.createDiv({ cls: 'myu-post-owed-items' });
          for (const i of o.items ?? []) owedItem(inner, i);
        }
        return;
      }
      case 'came_up':
        for (const c of after.came_up ?? []) if (c.topic?.trim()) line(zone, c.topic.trim(), null, typeof c.share === 'number' ? `${c.share}%` : null);
        return;
      case 'room':
        for (const p of after.room?.people ?? []) {
          const sub = [typeof p.turns === 'number' ? P.turns(p.turns) : null, typeof p.talk_time === 'number' ? P.talkTime(p.talk_time) : null].filter(Boolean).join(' · ');
          line(zone, p.name, sub || null, null);
        }
        return;
      case 'notes':
        this.notesStatusEl = zone.createDiv({ cls: 'myu-quiet myu-prep-notes-status', text: this.notesFailed ? PREP_VIEW_WORDS.notesNotSaved : W.savedAsYouType });
        this.notesBox(zone, prep);
        return;
    }
  }

  /**
   * "From your notes · Myu's reading": one row per action item (who, the words, when, × while it is not kept yet), and
   * the reminder Myu offered as one more row (Yes ▸ takes it, × lets it go).
   */
  private renderFromNotes(root: HTMLElement, prep: PrepCardV2): void {
    const actions = (prep.after?.action_items ?? []).filter((a) => a.text?.trim() && a.status !== 'removed');
    const reminders = (prep.after?.reminders ?? []).filter((r) => r.text?.trim() && r.status !== 'declined');
    if (!actions.length && !reminders.length) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-from-notes' });
    const label = zone.createDiv({ cls: 'myu-whisper', text: W.fromNotes });
    label.createSpan({ cls: 'myu-prep-count', text: W.myuReading });
    for (const a of actions) {
      const who = a.owner === 'you' ? PREP_VIEW_WORDS.you : a.owner_name?.trim() || '';
      const row = attr(zone, who, a.text.trim(), a.when?.trim() || null);
      row.setAttr('data-action', a.id);
      if (a.status && a.status !== 'pending') continue;
      const acts = row.createSpan({ cls: 'myu-prep-attr-acts' });
      const x = acts.createEl('button', { cls: 'myu-aff myu-prep-li-x', text: '×', attr: { 'aria-label': W.remove } });
      x.disabled = this.afterBusy.has(a.id);
      x.onclick = () => void this.removeAction(a.id);
    }
    for (const r of reminders) {
      const row = attr(zone, PREP_VIEW_WORDS.remindYou, r.text.trim());
      row.setAttr('data-reminder', r.id);
      if (r.status && r.status !== 'offered') continue;
      const acts = row.createSpan({ cls: 'myu-prep-attr-acts' });
      const yes = acts.createEl('button', { cls: 'myu-aff', text: W.yes });
      yes.disabled = this.afterBusy.has(r.id);
      yes.onclick = () => void this.answerReminder(r.id, true);
      const x = acts.createEl('button', { cls: 'myu-aff myu-prep-li-x', text: '×', attr: { 'aria-label': W.remove } });
      x.disabled = this.afterBusy.has(r.id);
      x.onclick = () => void this.answerReminder(r.id, false);
    }
    if (this.afterNote) zone.createDiv({ cls: 'myu-quiet myu-line-note', text: this.afterNote });
  }

  /**
   * The question inside the card. The question before: Myu's question, a box and Send, and its own choices as quiet
   * text. A pick (2026-10-04): one choice, its "Someone else" opening a box for the name; or several, the people as
   * toggles, "Someone else" opening a box whose name rides with them, "That's everyone" sending, "Not sure" alone.
   */
  private renderAsk(root: HTMLElement, ask: PrepLineRef): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-ask', attr: { 'data-mode': prepAskMode(ask) } });
    zone.createDiv({ cls: 'myu-whisper', text: PREP_VIEW_WORDS.myu });
    zone.createDiv({ cls: 'myu-voice', text: ask.text, attr: lineIdAttr(ask.line_id) });
    if (prepAskMode(ask) !== 'text') {
      this.renderPick(zone, ask);
      return;
    }
    // Pasted text waiting to go: the chips above the box.
    this.pastedRowEl = zone.createDiv({ cls: 'myu-pasted-row' });
    const row = zone.createDiv({ cls: 'myu-prep-answer' });
    const input = row.createEl('input', { cls: 'myu-prep-input', attr: { type: 'text', placeholder: PREP_WORDS.answerPlaceholder, 'aria-label': ask.text } });
    this.inputEl = input;
    input.value = this.draft;
    input.disabled = this.busy;
    input.oninput = () => {
      this.draft = input.value;
      if (this.undo) {
        this.undo = null;
        this.drawPasted();
      }
    };
    input.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.sendAnswer(ask);
        return;
      }
      if (this.undo && isUndoKey(event)) {
        event.preventDefault();
        this.undoPaste();
      }
    };
    attachPasteListeners(input, { addPasted: (text, source, at) => this.addPasted(text, source, at) });
    const send = row.createEl('button', { cls: 'myu-affordance', text: PREP_WORDS.sendAnswer });
    send.disabled = this.busy;
    send.onclick = () => void this.sendAnswer(ask);
    this.sendEl = send;
    this.drawPasted();
    this.renderChoices(zone, ask);
  }

  private renderPick(zone: HTMLElement, ask: PrepLineRef): void {
    if (this.pickFor !== ask.line_id) {
      this.pickFor = ask.line_id;
      this.picked = [];
      this.naming = false;
      this.name = '';
    }
    const many = prepAskMode(ask) === 'many';
    const parts = pickManyParts(ask);
    const acts = zone.createDiv({ cls: 'myu-mrow-acts myu-line-choices' });
    const button = (label: string, cls: string, attr: Record<string, string>, onClick: () => void, off = false) => {
      const b = acts.createEl('button', { cls, text: label, attr });
      b.disabled = this.busy || off;
      b.onclick = onClick;
      return b;
    };
    for (const c of ask.choices) {
      if (parts.typed && c.id === parts.typed.id) {
        button(c.label, 'myu-aff myu-pick', { 'data-choice': c.id, 'aria-pressed': String(this.naming) }, () => {
          this.naming = !this.naming;
          this.render();
        });
      } else if (many && parts.picks.some((p) => p.id === c.id)) {
        button(c.label, 'myu-aff myu-pick', { 'data-choice': c.id, 'aria-pressed': String(this.picked.includes(c.id)) }, () => {
          this.picked = togglePick(this.picked, c.id);
          this.render();
        });
      } else if (many && parts.send && c.id === parts.send.id) {
        // The name is read at the press: it is typed after this button was drawn.
        const typedName = () => (this.naming ? this.name : null);
        button(c.label, 'myu-aff myu-pick-send', { 'data-choice': c.id }, () => void this.answerPick(ask, pickManyAnswer(ask, this.picked, typedName())), !canSendPicks(this.picked, typedName()));
      } else {
        button(c.label, 'myu-aff', { 'data-choice': c.id }, () => void this.choose(ask, c.id));
      }
    }
    if (this.naming) {
      const row = zone.createDiv({ cls: 'myu-prep-answer' });
      const input = row.createEl('input', { cls: 'myu-prep-input', attr: { type: 'text', placeholder: typedHint(ask), 'aria-label': typedHint(ask) } });
      input.value = this.name;
      input.disabled = this.busy;
      input.oninput = () => {
        this.name = input.value;
        // "That's everyone" follows the name: it can send once something is typed.
        const send = acts.querySelector<HTMLButtonElement>('.myu-pick-send');
        if (send) send.disabled = this.busy || !canSendPicks(this.picked, this.name);
      };
      if (!many) {
        const sendName = () => void this.answerPick(ask, typedAnswer(ask, this.name));
        input.onkeydown = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            sendName();
          }
        };
        const send = row.createEl('button', { cls: 'myu-affordance', text: PREP_WORDS.sendAnswer });
        send.disabled = this.busy;
        send.onclick = sendName;
      }
      queueMicrotask(() => input.focus?.());
    }
    const note = this.notesUnder.get(ask.line_id);
    if (note) zone.createDiv({ cls: 'myu-quiet myu-line-note', text: note });
  }

  /** The arc: Myu's invitation and its three choices (Hold time, Now, Skip). */
  private renderArc(root: HTMLElement, arc: PrepLineRef): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-arc' });
    zone.createDiv({ cls: 'myu-whisper', text: PREP_VIEW_WORDS.myu });
    zone.createDiv({ cls: 'myu-voice', text: arc.text, attr: lineIdAttr(arc.line_id) });
    this.renderChoices(zone, arc);
  }

  /** A line's choices as the server sent them; Skip is the quiet way out. What did not go is said under them. */
  private renderChoices(zone: HTMLElement, line: PrepLineRef): void {
    if (line.choices.length > 0) {
      const acts = zone.createDiv({ cls: 'myu-mrow-acts myu-line-choices' });
      for (const c of line.choices) {
        const b = acts.createEl('button', { cls: c.id === 'skip' ? 'myu-aff myu-line-quiet' : 'myu-aff', text: c.label, attr: { 'data-choice': c.id } });
        b.disabled = this.busy;
        b.onclick = () => void this.choose(line, c.id);
      }
    }
    const note = this.notesUnder.get(line.line_id);
    if (note) zone.createDiv({ cls: 'myu-quiet myu-line-note', text: note });
  }

  /** Top parts in the server's order, always open, Myu's sentence in its voice; a part's items are a list. */
  private renderTop(root: HTMLElement, prep: PrepCardV2, parts: Array<[PrepTopPart, number]>): void {
    if (!parts.length) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-top' });
    for (const [t, i] of parts) {
      const part = zone.createDiv({ cls: 'myu-prep-part', attr: { 'data-part': t.part } });
      const label = part.createDiv({ cls: 'myu-whisper', text: prepPartLabel(t.part) });
      // Since last time as rows (2026-10-30): from the last meeting's record and the ledger, the meeting named on the label.
      if (t.part === 'since_last' && t.rows?.length) {
        const from = sinceLastMeeting(t.meeting);
        if (from) label.createSpan({ cls: 'myu-prep-count', text: from });
        const first = prep.kind === 'one_on_one' ? prepFirstName(prep.people[0]?.name) : '';
        t.rows.forEach((r, j) => {
          const row = sinceLastRow(r, first);
          if (!row.text) return;
          attr(part, row.label, row.text, row.sub, row.done ? `✓ ${row.right ?? ''}`.trim() : row.right).setAttr('data-row', `${r.kind}:${j}`);
        });
        continue;
      }
      if (t.text.trim()) this.why(prep, part.createDiv({ cls: 'myu-prep-text myu-voice', text: t.text }), `top:${i}`, t.evidence_ids);
      const items = t.items ?? [];
      if (!items.length) continue;
      const list = part.createEl('ul', { cls: 'myu-prep-items' });
      items.forEach((it, j) => this.why(prep, list.createEl('li', { text: it.text }), `top:${i}:${j}`, it.evidence_ids));
    }
  }

  /** The interview: the candidate's facts, your topics with their questions, the scorecard note. */
  private renderInterview(root: HTMLElement, iv: PrepInterview): void {
    if (!iv.candidate_facts.length && !iv.topics.length && !iv.scorecard_note) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-interview' });
    if (iv.candidate_facts.length) {
      zone.createDiv({ cls: 'myu-whisper', text: PREP_WORDS.candidateFacts });
      const facts = zone.createEl('ul', { cls: 'myu-prep-items' });
      for (const f of iv.candidate_facts) facts.createEl('li', { text: f });
    }
    if (iv.topics.length) {
      zone.createDiv({ cls: 'myu-whisper myu-prep-sub', text: PREP_WORDS.yourTopics });
      for (const t of iv.topics) {
        const topic = zone.createDiv({ cls: 'myu-prep-topic' });
        topic.createDiv({ cls: 'myu-prep-name', text: t.name });
        if (!t.questions.length) continue;
        const qs = topic.createEl('ul', { cls: 'myu-prep-items' });
        for (const q of t.questions) qs.createEl('li', { text: q });
      }
    }
    if (iv.scorecard_note) zone.createEl('p', { cls: 'myu-quiet', text: iv.scorecard_note });
  }

  /** The room: its one line for a group meeting (who decides, who brings what); a card from before it, its lines. */
  private renderRoom(root: HTMLElement, prep: PrepCardV2): void {
    const room = prep.room;
    const summary = room?.summary?.trim() ?? '';
    if (!room || (!summary && !room.team && !room.lines.length)) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-room' });
    zone.createDiv({ cls: 'myu-whisper', text: `${PREP_WORDS.room}${room.team ? ` · ${room.team.name}` : ''}` });
    if (summary) {
      zone.createDiv({ cls: 'myu-prep-text myu-prep-room-summary', text: summary });
      return;
    }
    room.lines.forEach((l, i) => this.why(prep, zone.createDiv({ cls: 'myu-prep-text', text: l.text }), `room:${i}`, l.evidence_ids));
  }

  /**
   * One row per person: the name, then the one line that is useful for this meeting (or the name alone), "3 open" when
   * more is open than the line says, and more ▾ / less ▴ for the rows (what changed, what is owed each way, the open
   * threads, how they like to work), each with its source under it, then Full card ▸. Open at first when the server
   * says so; a thin person is the line alone. A card from before the line reads as it did ("more ▸").
   */
  private renderPeople(root: HTMLElement, prep: PrepCardV2): void {
    if (!prep.people.length) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-people' });
    prep.people.forEach((p, i) => {
      if (!isSliced(p)) {
        this.renderPersonBlock(zone, prep, p, i);
        return;
      }
      const block = zone.createDiv({ cls: 'myu-prep-person', attr: { 'data-thin': String(p.thin), 'data-kind': p.line_kind ?? '' } });
      const head = block.createDiv({ cls: 'myu-prep-person-line' });
      head.createSpan({ cls: 'myu-prep-person-name', text: p.name });
      const line = prepPersonLine(p);
      if (line) head.createSpan({ cls: 'myu-prep-person-says', text: line });
      const strip = prepPersonStrip(p);
      if (strip) head.createSpan({ cls: 'myu-prep-strip', text: strip });
      const rows = prepPersonRows(p);
      if (!rows.length) return;
      const open = this.peopleOpen.get(i) ?? !!p.open_default;
      const toggle = head.createEl('button', { cls: 'myu-aff myu-prep-more', text: open ? W.personLess : W.personMore, attr: { 'aria-expanded': String(open) } });
      toggle.onclick = () => {
        this.peopleOpen.set(i, !open);
        this.render();
      };
      if (!open) return;
      const facts = block.createDiv({ cls: 'myu-prep-detail myu-prep-facts' });
      // One label per kind of fact: a second "Changed" row under the first carries none.
      let last = '';
      for (const r of rows) {
        attr(facts, r.label === last ? '' : r.label, r.text, r.sub).setAttr('data-row', r.key);
        last = r.label;
      }
      const id = p.relationship_id;
      if (!id) return;
      const full = block.createEl('button', { cls: 'myu-aff myu-prep-full', text: W.fullCard });
      full.onclick = () => void this.plugin.openCard('person', id, p.name);
    });
  }

  /** A card from before the line: the name and who they are to you; "more ▸" opens the rest. A thin person is its line. */
  private renderPersonBlock(zone: HTMLElement, prep: PrepCardV2, p: PrepPerson, i: number): void {
    const block = zone.createDiv({ cls: 'myu-prep-person', attr: { 'data-thin': String(p.thin) } });
    const line = block.createDiv({ cls: 'myu-prep-person-line' });
    line.createSpan({ cls: 'myu-prep-name', text: p.name });
    if (p.to_you) {
      line.createSpan({ cls: 'myu-quiet', text: ' · ' });
      line.createSpan({ cls: 'myu-prep-to-you', text: p.to_you });
    }
    this.why(prep, line, `person:${i}`, p.evidence_ids);
    if (p.thin || !prepPersonHasMore(p)) return;
    const open = this.peopleOpen.get(i) ?? false;
    const more = block.createEl('button', { cls: 'myu-aff myu-prep-more', text: open ? PREP_WORDS.less : PREP_WORDS.more, attr: { 'aria-expanded': String(open) } });
    more.onclick = () => {
      this.peopleOpen.set(i, !open);
      this.render();
    };
    if (!open) return;
    const detail = block.createDiv({ cls: 'myu-prep-detail' });
    if (p.stands) attr(detail, PREP_WORDS.stands, p.stands);
    if (p.you_owe.length) attr(detail, PREP_WORDS.youOwe, p.you_owe.join('; '));
    if (p.they_owe.length) attr(detail, PREP_WORDS.theyOwe, p.they_owe.join('; '));
    if (p.works_best) attr(detail, PREP_WORDS.worksBest, p.works_best);
    if (p.stance) attr(detail, PREP_WORDS.stance, p.stance);
    if (p.last_time) detail.createDiv({ cls: 'myu-quiet', text: p.last_time });
  }

  /**
   * Before you go in, as rows: last time (its notes, "Open the notes ▸"), what's planned, documents, the email that set
   * it up, who hasn't replied, and the history of a 1:1 ("Past 1:1s with Reid ▸", each past meeting its own page).
   */
  private renderBefore(root: HTMLElement, prep: PrepCardV2): void {
    const b = prep.before_you_go;
    const history = prepHistoryLink(prep);
    const any = !!b && !!(b.agenda || b.documents.length || b.set_up_email || b.last_notes || b.not_replied.length);
    if (!any && !history) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-before' });
    zone.createDiv({ cls: 'myu-whisper', text: PREP_WORDS.beforeYouGo });
    const L = W.labels;
    if (b?.last_notes) {
      const meetingId = b.last_notes.meeting_id;
      const row = attr(zone, L.lastTime, b.last_notes.summary);
      if (meetingId) {
        const open = row.createEl('button', { cls: 'myu-aff myu-prep-open-notes', text: PREP_WORDS.openNotes });
        open.onclick = () => void this.openMeetingNotes(meetingId, 'last_notes');
        this.renderNotes(zone, 'last_notes');
      }
    }
    if (b?.agenda) attr(zone, L.planned, b.agenda);
    if (b?.documents.length) {
      const docs = attr(zone, L.documents, '');
      const text = docs.createSpan({ cls: 'myu-prep-attr-text' });
      b.documents.forEach((d, i) => {
        const doc = prepDocument(d);
        if (i > 0) text.createSpan({ text: ', ' });
        if (doc.url && /^https?:\/\//i.test(doc.url)) text.createEl('a', { cls: 'myu-prep-link', text: doc.name, href: doc.url, attr: { target: '_blank', rel: 'noopener' } });
        else text.createSpan({ text: doc.name });
      });
    }
    if (b?.set_up_email) {
      const e = b.set_up_email;
      attr(zone, L.setUpEmail, `${e.subject} · ${e.from}`, prepShortDate(e.at) || null);
    }
    if (b?.not_replied.length) attr(zone, prepNotRepliedLabel(b.not_replied), b.not_replied.join(', '));
    if (!history) return;
    const row = attr(zone, L.history, '');
    const link = row.createEl('button', { cls: 'myu-aff myu-prep-history-link', text: history.label, attr: { 'aria-expanded': String(!!this.history) } });
    link.onclick = () => void this.toggleHistory(history.relationship_id ? { relationship_id: history.relationship_id } : { event_series: history.event_series });
    this.renderHistory(zone);
  }

  /** The past 1:1s under their link: each a press away from its own page. */
  private renderHistory(host: HTMLElement): void {
    const h = this.history;
    if (!h) return;
    const box = host.createDiv({ cls: 'myu-prep-notes myu-prep-history' });
    if (h.state === 'loading') {
      box.createDiv({ cls: 'myu-quiet', text: PREP_VIEW_WORDS.historyLoading });
      return;
    }
    if (h.state === 'failed' || !h.rows.length) {
      box.createDiv({ cls: 'myu-quiet', text: h.state === 'failed' ? PREP_VIEW_WORDS.historyFailed : PREP_VIEW_WORDS.historyEmpty });
      return;
    }
    for (const r of h.rows) {
      // The record's counts when the server sends them ("2 of 3 covered · 2 decisions · 7 actions · notes by Gemini").
      const words = (r.source !== undefined || r.covered !== undefined ? pastMeetingWords(r) : prepHistoryRowWords(r)) || r.title?.trim() || '';
      const open = box.createEl('button', { cls: 'myu-aff myu-prep-ref myu-prep-history-row', text: words, attr: { 'data-event': r.event_id } });
      open.onclick = () => void this.showMeeting(r.event_id);
    }
    if (h.across) box.createDiv({ cls: 'myu-quiet myu-prep-across', text: h.across });
  }

  /**
   * A line's quiet "why ▸" (only when it has evidence that resolves) and, open, its evidence: each
   * item's label; one that opens something is a button, the rest are text.
   */
  private why(prep: PrepCardV2, line: HTMLElement, key: string, ids: string[] | undefined): void {
    const evidence = prepEvidenceFor(prep, ids);
    if (!evidence.length) return;
    const open = this.openWhy.has(key);
    const b = line.createEl('button', { cls: 'myu-aff myu-prep-why', text: open ? PREP_WORDS.whyOpen : PREP_WORDS.why, attr: { 'aria-expanded': String(open) } });
    b.onclick = () => {
      if (open) this.openWhy.delete(key);
      else this.openWhy.add(key);
      this.render();
    };
    if (!open) return;
    const list = line.createDiv({ cls: 'myu-prep-evidence' });
    for (const { id, ev } of evidence) {
      const how = evidenceOpening(ev);
      if (!how) {
        list.createDiv({ cls: 'myu-quiet myu-prep-ref', text: ev.label, attr: { 'data-evidence': id } });
        continue;
      }
      const item = list.createEl('button', { cls: 'myu-aff myu-prep-ref', text: ev.label, attr: { 'data-evidence': id, 'data-open': how.kind } });
      item.createSpan({ cls: 'myu-prep-open', text: ` ${PREP_WORDS.openItem}` });
      const where = `${key}/${id}`;
      item.onclick = () => this.openEvidence(how, prep, where);
      if (how.kind === 'meeting') this.renderNotes(list, where);
    }
  }

  /** A meeting's notes shown in place, under the door that asked for them (the vault had no note of it). */
  private renderNotes(host: HTMLElement, where: string): void {
    const notes = this.notes;
    if (notes?.where !== where) return;
    const box = host.createDiv({ cls: 'myu-prep-notes' });
    if (notes.state === 'loading') {
      box.createDiv({ cls: 'myu-quiet', text: PREP_VIEW_WORDS.notesLoading });
      return;
    }
    if (notes.state === 'failed') {
      box.createDiv({ cls: 'myu-quiet', text: PREP_VIEW_WORDS.notesFailed });
      return;
    }
    if (!notes.lines.length) {
      box.createDiv({ cls: 'myu-quiet', text: PREP_VIEW_WORDS.notesEmpty });
      return;
    }
    const [first, ...rest] = notes.lines;
    box.createDiv({ cls: 'myu-prep-text', text: first });
    if (!rest.length) return;
    const list = box.createEl('ul', { cls: 'myu-prep-items' });
    for (const l of rest) list.createEl('li', { text: l });
  }
}

/**
 * A fact as a row: the label (quiet, in the mono the rows use), the fact, and its source or date under it. Returns the
 * row, for what follows the words (a link, a door, ×).
 */
function attr(host: HTMLElement, label: string, text: string, sub: string | null = null, right: string | null = null): HTMLElement {
  const row = host.createDiv({ cls: 'myu-prep-attr' });
  row.createSpan({ cls: 'myu-prep-attr-label', text: label });
  if (text) row.createSpan({ cls: 'myu-prep-attr-text', text });
  if (sub) row.createSpan({ cls: 'myu-prep-attr-sub', text: sub });
  if (right) actsOf(row).createSpan({ cls: 'myu-prep-attr-right', text: right });
  return row;
}

/** A row's right-hand end (its date, its ×, its more ▾), made once. */
function actsOf(row: HTMLElement): HTMLElement {
  return row.querySelector<HTMLElement>('.myu-prep-attr-acts') ?? row.createSpan({ cls: 'myu-prep-attr-acts' });
}

/** A fact with no label of its own (under a fold that names it): the words, the source under them, the day on the right. */
function line(host: HTMLElement, text: string, sub: string | null, right: string | null): HTMLElement {
  const row = host.createDiv({ cls: 'myu-post-row' });
  row.createSpan({ cls: 'myu-prep-attr-text', text });
  if (right) row.createSpan({ cls: 'myu-prep-attr-right', text: right });
  if (sub) row.createSpan({ cls: 'myu-prep-attr-sub', text: sub });
  return row;
}

/** Something owed, from the ledger: its words, where it came from, its day. */
function owedItem(host: HTMLElement, i: AfterItem): void {
  if (i.text?.trim()) line(host, i.text.trim(), i.source?.trim() || null, i.when ? postDay(i.when) : null);
}
