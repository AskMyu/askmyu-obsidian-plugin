/**
 * PrepView — the meeting's card, version 2 (2026-09-30), beside your notes.
 *
 * The order is the web card's (`PrepCard.tsx`), in the vault's register (hairline zones, whisper
 * labels, Myu's own words in the serif voice under a label that says so):
 *   the title and when; `partial` as one quiet line;
 *   the question before (`ask`): a box and Send, its own choices (Skip) as quiet text;
 *   the arc (`arc`): Hold time, Now, Skip;
 *   the top: 3 to 5 parts in the server's order, always open, a part's items as a list;
 *   the interview kind: the candidate's facts, your topics with their questions, the scorecard note;
 *   the people: the name and who they are to you, "more ▸" for the rest (a thin person is its line only);
 *   the room; before you go in; afterwards;
 *   the doors: "Open the conversation ▸" (the meeting's own), and after it "Write how it went ▸".
 * Every line with evidence carries a quiet "why ▸" that lists it (label, dated by the server); what
 * an item opens is `evidenceOpening` (prepCard.ts): a link in the browser, a journal conversation or
 * a space's conversation in the chat pane, a meeting's notes (the vault's note, else in place); an
 * email or a commitment is its label only.
 *
 * Every sentence is the server's, printed as sent; the labels are `PREP_WORDS` (shared's, copied)
 * and `PREP_VIEW_WORDS`. A read that is not version 2 is not drawn: it reads as the failed words.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { PastedBlockWire, PrepCardV2, PrepInterview, PrepLineRef, PrepPerson, SpaceAnswer } from '../wire';
import {
  PREP_VIEW_WORDS,
  PREP_WORDS,
  answerPrepLine,
  answerPrepPick,
  evidenceOpening,
  isPrepV2,
  meetingNoteLines,
  prepChatContext,
  prepDocument,
  prepEvidenceFor,
  prepNotRepliedLabel,
  prepOccurrenceKey,
  prepPartLabel,
  prepPersonHasMore,
  prepAskMode,
  prepPhase,
  prepShortDate,
  prepWhen,
  sendPrepAnswer,
  type EvidenceOpening,
  type PrepAnswer,
} from '../prepCard';
import { canSendPicks, pickManyAnswer, pickManyParts, togglePick, typedAnswer, typedHint } from '../pickMany';
import { PASTE_WORDS, canPutBack, chipAdded, pastedBlocksProblem, putBackText, undoChip, type PasteUndo } from '../pastedText';
import { announce, attachPasteListeners, isUndoKey, pastedLiveRegion, renderPastedRow } from './pastedChips';
import { PastedTextModal } from './PastedTextModal';
import { lineIdAttr } from '../linesSeenWatch';

export const PREP_VIEW_TYPE = 'askmyu-prep';

/** A meeting's notes shown in place (the vault had no note for it), under the door that asked. */
interface InlineNotes {
  where: string;
  meetingId: string;
  state: 'loading' | 'failed' | 'shown';
  lines: string[];
}

export class PrepView extends ItemView {
  private prep: PrepCardV2 | null = null;
  private eventId: string | null = null;
  private state: 'idle' | 'loading' | 'failed' | 'unknown' = 'idle';
  /** Guards a slow read for an earlier meeting from painting over the one now asked for. */
  private readSeq = 0;
  /** Which "why ▸" lists are open, by line key; which people show their "more". */
  private openWhy = new Set<string>();
  private openPeople = new Set<number>();
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
    this.plugin.linesSeen?.unwatch(this.contentEl);
    this.contentEl.empty();
  }

  /** Show a meeting's card: everything opened or typed for the one before starts fresh. */
  async showMeeting(eventId: string): Promise<void> {
    this.eventId = eventId;
    this.state = 'loading';
    this.prep = null;
    this.openWhy.clear();
    this.openPeople.clear();
    this.notes = null;
    this.notesUnder.clear();
    this.answered.clear();
    this.draft = '';
    this.pasted = [];
    this.undo = null;
    this.busy = false;
    this.said = null;
    this.pickFor = null;
    this.render();
    await this.readCard();
  }

  /** Read the card. `quiet`: the one on screen stays while it reads (after an answer). */
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
    } else if (!quiet || !this.prep) {
      // A card from before version 2 (or none) is not drawn.
      this.prep = null;
      this.state = res?.status === 404 ? 'unknown' : 'failed';
    }
    this.render();
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

  // ── render ────────────────────────────────────────────────────────────────

  private render(): void {
    const root = this.contentEl;
    root.empty();
    this.inputEl = null;
    this.pastedRowEl = null;
    this.sendEl = null;

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

    const head = root.createDiv({ cls: 'myu-prep-head' });
    head.createDiv({ cls: 'myu-card-title', text: prep.title });
    const when = prepWhen(prep.starts_at);
    if (when) head.createDiv({ cls: 'myu-quiet myu-prep-meeting', text: when });
    if (prep.partial) root.createEl('p', { cls: 'myu-quiet myu-prep-partial', text: PREP_WORDS.partial });

    if (this.said) {
      const said = root.createDiv({ cls: 'myu-prep-said' });
      said.createDiv({ cls: 'myu-whisper', text: PREP_VIEW_WORDS.myu });
      said.createDiv({ cls: 'myu-voice', text: this.said });
    }
    if (prep.ask && !this.answered.has(prep.ask.line_id)) this.renderAsk(root, prep.ask);
    if (prep.arc && !this.answered.has(prep.arc.line_id)) this.renderArc(root, prep.arc);

    this.renderTop(root, prep);
    if (prep.interview) this.renderInterview(root, prep.interview);
    this.renderPeople(root, prep);
    this.renderRoom(root, prep);
    this.renderBefore(root, prep);
    if (prep.afterwards?.trim()) {
      const zone = root.createDiv({ cls: 'myu-zone myu-prep-afterwards' });
      zone.createDiv({ cls: 'myu-whisper', text: PREP_WORDS.afterwards });
      zone.createDiv({ cls: 'myu-prep-text', text: prep.afterwards });
    }
    this.renderDoors(root, prep);
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

  /** The top: 3 to 5 parts in the server's order, always open; a part's items are a list. */
  private renderTop(root: HTMLElement, prep: PrepCardV2): void {
    if (!prep.top.length) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-top' });
    prep.top.forEach((t, i) => {
      const part = zone.createDiv({ cls: 'myu-prep-part', attr: { 'data-part': t.part } });
      part.createDiv({ cls: 'myu-whisper', text: prepPartLabel(t.part) });
      if (t.text.trim()) this.why(prep, part.createDiv({ cls: 'myu-prep-text', text: t.text }), `top:${i}`, t.evidence_ids);
      const items = t.items ?? [];
      if (!items.length) return;
      const list = part.createEl('ul', { cls: 'myu-prep-items' });
      items.forEach((it, j) => this.why(prep, list.createEl('li', { text: it.text }), `top:${i}:${j}`, it.evidence_ids));
    });
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

  /** One block per person: the name and who they are to you; "more ▸" opens the rest. A thin person is its line only. */
  private renderPeople(root: HTMLElement, prep: PrepCardV2): void {
    if (!prep.people.length) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-people' });
    prep.people.forEach((p, i) => {
      const block = zone.createDiv({ cls: 'myu-prep-person', attr: { 'data-thin': String(p.thin) } });
      const line = block.createDiv({ cls: 'myu-prep-person-line' });
      line.createSpan({ cls: 'myu-prep-name', text: p.name });
      if (p.to_you) {
        line.createSpan({ cls: 'myu-quiet', text: ' · ' });
        line.createSpan({ cls: 'myu-prep-to-you', text: p.to_you });
      }
      this.why(prep, line, `person:${i}`, p.evidence_ids);
      if (p.thin || !prepPersonHasMore(p)) return;
      const open = this.openPeople.has(i);
      const more = block.createEl('button', { cls: 'myu-aff myu-prep-more', text: open ? PREP_WORDS.less : PREP_WORDS.more, attr: { 'aria-expanded': String(open) } });
      more.onclick = () => {
        if (open) this.openPeople.delete(i);
        else this.openPeople.add(i);
        this.render();
      };
      if (open) this.renderPersonMore(block, p);
    });
  }

  private renderPersonMore(block: HTMLElement, p: PrepPerson): void {
    const detail = block.createDiv({ cls: 'myu-prep-detail' });
    if (p.stands) attr(detail, PREP_WORDS.stands, p.stands);
    if (p.you_owe.length) attr(detail, PREP_WORDS.youOwe, p.you_owe.join('; '));
    if (p.they_owe.length) attr(detail, PREP_WORDS.theyOwe, p.they_owe.join('; '));
    if (p.works_best) attr(detail, PREP_WORDS.worksBest, p.works_best);
    if (p.stance) attr(detail, PREP_WORDS.stance, p.stance);
    if (p.last_time) detail.createDiv({ cls: 'myu-quiet', text: p.last_time });
  }

  /** The room: team or not, and its lines. */
  private renderRoom(root: HTMLElement, prep: PrepCardV2): void {
    const room = prep.room;
    if (!room || (!room.team && !room.lines.length)) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-room' });
    zone.createDiv({ cls: 'myu-whisper', text: `${PREP_WORDS.room}${room.team ? ` · ${room.team.name}` : ''}` });
    room.lines.forEach((l, i) => this.why(prep, zone.createDiv({ cls: 'myu-prep-text', text: l.text }), `room:${i}`, l.evidence_ids));
  }

  /** Before you go in: what's planned, documents, the email that set it up, last time's notes, who hasn't replied. */
  private renderBefore(root: HTMLElement, prep: PrepCardV2): void {
    const b = prep.before_you_go;
    if (!b || !(b.agenda || b.documents.length || b.set_up_email || b.last_notes || b.not_replied.length)) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-prep-before' });
    zone.createDiv({ cls: 'myu-whisper', text: PREP_WORDS.beforeYouGo });
    if (b.agenda) attr(zone, PREP_WORDS.planned, b.agenda);
    if (b.documents.length) {
      const docs = attr(zone, PREP_WORDS.documents, '');
      b.documents.forEach((d, i) => {
        const doc = prepDocument(d);
        if (i > 0) docs.createSpan({ text: ', ' });
        if (doc.url && /^https?:\/\//i.test(doc.url)) docs.createEl('a', { cls: 'myu-prep-link', text: doc.name, href: doc.url, attr: { target: '_blank', rel: 'noopener' } });
        else docs.createSpan({ text: doc.name });
      });
    }
    if (b.set_up_email) {
      const e = b.set_up_email;
      const date = prepShortDate(e.at);
      attr(zone, PREP_WORDS.setUpEmail, `${e.subject} · ${e.from}${date ? ` · ${date}` : ''}`);
    }
    if (b.last_notes) {
      const meetingId = b.last_notes.meeting_id;
      const row = attr(zone, PREP_WORDS.lastNotes, b.last_notes.summary);
      if (meetingId) {
        const open = row.createEl('button', { cls: 'myu-aff myu-prep-open-notes', text: PREP_WORDS.openNotes });
        open.onclick = () => void this.openMeetingNotes(meetingId, 'last_notes');
        this.renderNotes(zone, 'last_notes');
      }
    }
    if (b.not_replied.length) attr(zone, prepNotRepliedLabel(b.not_replied), b.not_replied.join(', '));
  }

  /** The meeting's own conversation; after it, writing how it went (the capture, with this card as its context). */
  private renderDoors(root: HTMLElement, prep: PrepCardV2): void {
    const foot = root.createDiv({ cls: 'myu-prep-foot' });
    const talk = foot.createEl('button', { cls: 'myu-affordance', text: PREP_WORDS.openConversation });
    talk.onclick = () => void this.plugin.openMeetingConversation(prep.event_id, prep.title, prepOccurrenceKey(prep) ?? undefined);
    if (prepPhase(prep) !== 'after') return;
    const after = foot.createEl('button', { cls: 'myu-affordance', text: PREP_WORDS.writeHowItWent });
    after.onclick = () => void this.plugin.openChat({ text: '', send: false, context: prepChatContext(prep, 'after') });
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

/** A labelled row ("You owe · Send the deck"). Returns the row, for what follows the words (links, a door). */
function attr(host: HTMLElement, label: string, text: string): HTMLElement {
  const row = host.createDiv({ cls: 'myu-prep-attr' });
  row.createSpan({ cls: 'myu-prep-attr-label', text: label });
  if (text) row.createSpan({ cls: 'myu-prep-attr-text', text });
  return row;
}
