/**
 * Space mode (R14) — how a space's conversation is drawn in the chat pane (and a meeting's own
 * conversation, 2026-09-30, drawn the same way).
 *
 * It draws what `SpaceConversation.screen()` says and nothing else: what was said
 * before, the ONE ask that is up with its
 * buttons, what was said since, "Myu is reading…", then the text box. The box is
 * always there and is the main thing; the hints are quiet lines under it, never
 * buttons. No counter, no list of asks, no second box behind a button.
 *
 * Only Obsidian's element helpers are used (`createDiv` / `createEl` /
 * `createSpan`), so the wiring tests can press these buttons on the UI fake.
 *
 * Pasted text (2026-10-06): a long paste or drop in the box becomes a chip in a
 * row above it, redrawn in place (the box is never redrawn for it); a 'you'
 * turn's pasted text shows as folded cards under its words.
 */

import type { PastedBlockWire } from '../wire';
import { pastedBlocksProblem } from '../pastedText';
import { SPACE_MODE_WORDS, type ReadbackParts } from '../spaceModeLogic';
import { LINE_CONVERSATION_WORDS, MEETING_CONVERSATION_WORDS, type ScreenAsk, type SpaceScreen } from '../spaceConversation';
import { SPACE_RETRO_WORDS, type RetroPanelScreen } from '../spaceRetro';
import { attachPasteListeners, isUndoKey, renderPastedCards, renderPastedRow } from './pastedChips';
import { lineIdAttr } from '../linesSeenWatch';

export interface SpacePaneHandlers {
  send: (text: string) => void;
  /** A choice: answered at once; the typed choice turns the box into the name's; the send choice sends the picks. */
  choose: (choiceId: string) => void;
  /** Picking several (2026-10-03): toggle one pick. */
  pick: (choiceId: string) => void;
  /** Let the typed name kept beside the picks go. */
  dropTyped: () => void;
  earlier: () => void;
  unlock: () => void;
  draft: (text: string) => void;
  /** Pasted text in the box (2026-10-06). Without it the box takes every paste inline, as before. */
  pasted?: SpacePastedBox;
}

/**
 * The box's chips, as the conversation holds them. Each call reads the state as it is now: the row is redrawn in
 * place after a change, without a repaint of the pane.
 */
export interface SpacePastedBox {
  chips(): readonly PastedBlockWire[];
  /** The last paste that became a chip can still be undone (the hint shows). */
  canUndo(): boolean;
  /** Words under the chips (the lost words after a send). */
  note(): string | null;
  /** The box takes a typed name: a paste there stays inline. */
  typing(): boolean;
  /** A paste became a chip; `value` is the box's text without the selection it replaced. */
  add(text: string, source: 'paste' | 'drop', at: number, value: string): void;
  /** Undo: the box's new text and caret, or null when there was nothing to undo. */
  undo(value: string): { value: string; caret: number } | null;
  remove(id: string): void;
  /** A chip, opened (its text, Put back, Remove). `after` gets the box's new text after a Put back, else null. */
  open(id: string, after: (value: string | null) => void): void;
  /** The box was typed in; true when the hint went with it. */
  typedInBox(): boolean;
  /** Which of a turn's cards are open, by its key; and a card opened or closed. */
  expanded(key: string): ReadonlySet<string>;
  toggle(key: string, id: string, open: boolean): void;
}

/** Myu's words: plain text, or a readback with each bullet on its own line and the warning apart. */
function renderWords(host: HTMLElement, text: string, parts: ReadbackParts | null, cls: string): void {
  if (!parts) {
    // Line breaks as sent (an interview debrief's "A yes: …" / "A no: …" under its question), as the web draws them.
    host.createDiv({ cls: `${cls} myu-space-words`, text });
    return;
  }
  const box = host.createDiv({ cls: `${cls} myu-space-readback` });
  for (const l of parts.lead) box.createDiv({ text: l });
  const list = box.createEl('ul', { cls: 'myu-space-bullets' });
  for (const b of parts.bullets) list.createEl('li', { text: b });
  for (const l of parts.closing) box.createDiv({ text: l });
  for (const l of parts.warning) box.createDiv({ cls: 'myu-space-warning myu-quiet', text: l });
}

/**
 * Where things stand right now, as a quiet strip under the conversation's title. Always current
 * (it is drawn from every read), never a turn: it has no "myu" whisper and no place in the thread.
 */
export function renderSpaceStatus(host: HTMLElement, status: string | null): void {
  if (!status) return;
  // The clamp sits on the words, not on the padded strip, or a sliver of the fourth line shows in the padding.
  const strip = host.createDiv({ cls: 'myu-space-status myu-quiet' });
  strip.createDiv({ cls: 'myu-space-status-words', text: status });
}

/**
 * The one ask's buttons. A pick-many ask (2026-10-03): the people as toggles (pressed when picked, `aria-pressed`),
 * "Someone else" as a toggle that turns the box into the name's box, the kept name beside them with a way to let it
 * go, "That's everyone" disabled until something is picked or a name is kept, then the singles. Any other ask: its
 * choices as plain buttons, the typed choice among them as the same toggle. Then the quiet way out and, on a line's
 * own conversation, the two quiet ways out.
 */
function renderAskButtons(acts: HTMLElement, ask: ScreenAsk, busy: boolean, on: SpacePaneHandlers): void {
  const toggle = (label: string, pressed: boolean, press: () => void) => {
    const b = acts.createEl('button', { cls: 'myu-aff myu-pick', text: label, attr: { 'aria-pressed': String(pressed) } });
    b.disabled = busy;
    b.onclick = press;
  };
  const plain = (label: string, press: () => void, cls = 'myu-aff') => {
    const b = acts.createEl('button', { cls, text: label });
    b.disabled = busy;
    b.onclick = press;
  };
  const typed = ask.typed;
  if (ask.picks) {
    for (const p of ask.picks.picks) toggle(p.label, p.on, () => on.pick(p.id));
    if (typed) toggle(typed.label, typed.on, () => on.choose(typed.id));
    if (ask.kept) {
      const kept = acts.createSpan({ cls: 'myu-space-kept' });
      kept.createSpan({ cls: 'myu-space-kept-name', text: ask.kept });
      const drop = kept.createEl('button', { cls: 'myu-aff myu-space-kept-drop', text: '×', attr: { 'aria-label': LINE_CONVERSATION_WORDS.removeName } });
      drop.disabled = busy;
      drop.onclick = () => on.dropTyped();
    }
    const send = ask.picks.send;
    if (send) {
      const b = acts.createEl('button', { cls: 'myu-aff myu-pick-send', text: send.label, attr: { 'aria-disabled': String(!send.ready) } });
      b.disabled = busy || !send.ready;
      b.onclick = () => on.choose(send.id);
    }
    for (const c of ask.picks.singles) plain(c.label, () => on.choose(c.id));
  } else {
    for (const c of ask.choices) {
      if (typed && c.id === typed.id) toggle(typed.label, typed.on, () => on.choose(typed.id));
      else plain(c.label, () => on.choose(c.id));
    }
  }
  // The fourth choice of a talk's version ("Leave it") is the quiet way out.
  if (ask.quiet) {
    const quiet = ask.quiet;
    plain(quiet.label, () => on.choose(quiet.id), 'myu-affordance myu-space-quiet');
  }
  for (const w of ask.waysOut) plain(w.label, () => on.choose(w.id), 'myu-affordance myu-space-quiet myu-space-way-out');
}

/**
 * Draw the space's conversation into `thread` and its box into `composer`. Returns the box, for focus — null
 * when the box is not drawn (a line's own conversation with no door behind it, until a name is typed).
 */
export function renderSpaceConversation(
  thread: HTMLElement,
  composer: HTMLElement,
  screen: SpaceScreen,
  on: SpacePaneHandlers,
): HTMLTextAreaElement | null {
  if (screen.loading) thread.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Opening the conversation' });
  if (screen.failed) thread.createEl('p', { cls: 'myu-quiet', text: screen.failed });

  // What came before this retro sits behind one quiet line.
  if (screen.earlier === 'link') {
    const earlier = thread.createEl('button', { cls: 'myu-affordance myu-space-earlier', text: SPACE_MODE_WORDS.earlier });
    earlier.onclick = () => on.earlier();
  } else if (screen.earlier === 'loading') {
    thread.createEl('p', { cls: 'myu-quiet myu-thinking', text: SPACE_MODE_WORDS.earlier.replace(' ▸', '') });
  } else if (screen.earlier === 'none') {
    thread.createEl('p', { cls: 'myu-quiet myu-space-earlier', text: SPACE_MODE_WORDS.nothingEarlier });
  }

  const drawTurn = (turn: SpaceScreen['turns'][number]) => {
    if (turn.from === 'you') {
      const you = thread.createDiv({ cls: 'myu-chat-user', text: turn.text });
      if (turn.pasted?.length) renderPastedCards(you, turn.pasted, on.pasted?.expanded(turn.key) ?? new Set(), (id, open) => on.pasted?.toggle(turn.key, id, open));
      return;
    }
    const myu = thread.createDiv({ cls: 'myu-chat-myu' });
    myu.createDiv({ cls: 'myu-whisper', text: 'myu' });
    renderWords(myu, turn.text, turn.parts, 'myu-voice');
  };

  for (const turn of screen.turns) drawTurn(turn);

  // The ONE ask that is up, with its buttons as the backend sent them. It carries its line's id: in view for a
  // second, the line is reported as seen (linesSeenWatch.ts).
  if (screen.ask) {
    const ask = thread.createDiv({ cls: 'myu-chat-myu myu-space-ask', attr: lineIdAttr(screen.ask.line_id) });
    ask.createDiv({ cls: 'myu-whisper', text: 'myu' });
    renderWords(ask, screen.ask.text, screen.ask.parts, 'myu-voice');
    const busy = screen.answering || screen.reading;
    const a = screen.ask;
    if (a.choices.length > 0 || a.picks || a.quiet || a.waysOut.length > 0) {
      renderAskButtons(ask.createDiv({ cls: 'myu-mrow-acts myu-space-choices' }), a, busy, on);
    }
  }

  for (const turn of screen.after) drawTurn(turn);

  if (screen.note) thread.createEl('p', { cls: 'myu-voice myu-quiet myu-space-note', text: screen.note });
  if (screen.empty) thread.createEl('p', { cls: 'myu-quiet myu-space-empty', text: screen.empty });

  // A locked space (or another subject's conversation): the unlock is here, in place. It never sends the person anywhere.
  if (screen.unlock.show) {
    const notSpace = screen.kind !== undefined && screen.kind !== 'space';
    const row = thread.createDiv({ cls: 'myu-space-unlock' });
    const b = row.createEl('button', { cls: 'myu-aff', text: screen.unlock.busy ? SPACE_MODE_WORDS.unlocking : notSpace ? MEETING_CONVERSATION_WORDS.unlock : SPACE_MODE_WORDS.unlock });
    b.disabled = screen.unlock.busy;
    b.onclick = () => on.unlock();
    if (screen.unlock.failed) row.createEl('p', { cls: 'myu-quiet', text: notSpace ? MEETING_CONVERSATION_WORDS.unlockFailed : SPACE_MODE_WORDS.unlockFailed });
  }

  if (screen.reading) thread.createEl('p', { cls: 'myu-quiet myu-thinking myu-space-reading', text: SPACE_MODE_WORDS.reading });

  // The box: always there, the main thing — except on a line's own conversation with no door behind it, where
  // it appears for the name "Someone else" asks for.
  if (!screen.box.show) return null;
  const paste = on.pasted;
  // Pasted text waiting to go: the chips above the box.
  const row = paste ? composer.createDiv({ cls: 'myu-pasted-row' }) : null;
  const input = composer.createEl('textarea', {
    cls: 'myu-chat-input myu-space-input',
    attr: { rows: '3', placeholder: screen.box.placeholder, 'aria-label': screen.box.placeholder },
  });
  input.value = screen.box.draft;
  const send = composer.createEl('button', { cls: 'myu-affordance', text: 'Send' });
  send.disabled = screen.reading;
  send.onclick = () => on.send(input.value);
  // The row and Send's hold, redrawn in place.
  const drawRow = (): void => {
    if (!paste || !row) return;
    renderPastedRow(row, paste.chips(), {
      open: (id) =>
        paste.open(id, (value) => {
          if (value !== null) input.value = value;
          drawRow();
          input.focus();
          if (value !== null) input.setSelectionRange(value.length, value.length);
        }),
      remove: (id) => {
        paste.remove(id);
        drawRow();
        input.focus();
      },
      undo: paste.canUndo() ? undo : null,
      note: paste.note(),
    });
    send.disabled = screen.reading || !!pastedBlocksProblem(paste.chips());
  };
  const undo = (): void => {
    const out = paste?.undo(input.value) ?? null;
    if (out) input.value = out.value;
    drawRow();
    if (out) {
      input.focus();
      input.setSelectionRange(out.caret, out.caret);
    }
  };
  input.oninput = () => {
    on.draft(input.value);
    if (paste?.typedInBox()) drawRow();
  };
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      on.send(input.value);
      return;
    }
    if (paste?.canUndo() && isUndoKey(event)) {
      event.preventDefault();
      undo();
    }
  };
  if (paste) {
    attachPasteListeners(input, {
      addPasted: (text, source, at) => {
        paste.add(text, source, at, input.value);
        drawRow();
      },
      isTyping: () => paste.typing(),
    });
    drawRow();
  }

  // Under the box, for a person Myu has little of: a few plain prompts. Text, not buttons.
  if (screen.box.hints.length > 0) {
    const hints = composer.createDiv({ cls: 'myu-space-hints myu-quiet' });
    hints.createDiv({ cls: 'myu-space-hints-lead', text: screen.box.hintsLead });
    for (const h of screen.box.hints) hints.createDiv({ cls: 'myu-space-hint', text: h });
  }
  return input;
}

/**
 * The two tabs of a space's pane: the person's own conversation with Myu, and the team's retro.
 * One is showing at a time, so the pane has one scroll and one "where things stand".
 */
export function renderSpaceTabs(host: HTMLElement, retroShowing: boolean, on: { conversation: () => void; retro: () => void }): void {
  const tabs = host.createDiv({ cls: 'myu-space-tabs', attr: { role: 'tablist' } });
  const tab = (text: string, selected: boolean, press: () => void) => {
    const b = tabs.createEl('button', { cls: `myu-space-tab${selected ? ' is-active' : ''}`, text, attr: { role: 'tab', 'aria-selected': String(selected) } });
    b.onclick = () => {
      if (!selected) press();
    };
  };
  tab(SPACE_RETRO_WORDS.tabConversation, !retroShowing, on.conversation);
  tab(SPACE_RETRO_WORDS.tabRetro, retroShowing, on.retro);
}

/**
 * "How this works ▸": the backend's `how_it_works`, folded under the top (R20). Open the first
 * time this account sees a retro page, closed after; the words are the backend's, as sent.
 */
function renderHowThisWorks(page: HTMLElement, how: string | null, open: boolean, toggle: () => void): void {
  if (!how) return;
  const fold = page.createDiv({ cls: 'myu-space-retro-how' });
  const b = fold.createEl('button', {
    cls: 'myu-affordance myu-space-retro-how-toggle',
    text: `${SPACE_RETRO_WORDS.howThisWorks} ${open ? '▾' : '▸'}`,
    attr: { 'aria-expanded': String(open) },
  });
  b.onclick = () => toggle();
  if (open) fold.createDiv({ cls: 'myu-quiet myu-space-retro-how-words', text: how });
}

/**
 * The team's retro as a page: where it stands in one line, "How this works ▸" folded under it,
 * then each question under a plain heading with what people wrote and the summary the team
 * chose, then the tasks. For reading; the last lines say so and lead back to the conversation,
 * where Myu asks for votes and answers.
 */
export function renderSpaceRetro(
  host: HTMLElement,
  panel: RetroPanelScreen,
  on: { conversation: () => void; unlock: () => void; how?: () => void },
): void {
  const page = host.createDiv({ cls: 'myu-space-retro' });
  if (panel.loading) {
    page.createEl('p', { cls: 'myu-quiet myu-thinking', text: SPACE_RETRO_WORDS.loading });
    return;
  }
  if (panel.failed && !panel.view) {
    page.createEl('p', { cls: 'myu-quiet', text: SPACE_RETRO_WORDS.failed });
    return;
  }
  const view = panel.view;
  if (!view) return;
  const toggleHow = () => on.how?.();
  if (view.none) {
    // Before a retro exists: the one sentence, with the fold under it.
    page.createEl('p', { cls: 'myu-quiet', text: view.none });
    renderHowThisWorks(page, view.how, panel.howOpen, toggleHow);
    return;
  }

  const head = page.createDiv({ cls: 'myu-space-retro-head' });
  if (view.top) head.createDiv({ cls: 'myu-space-retro-title', text: view.top });
  renderHowThisWorks(head, view.how, panel.howOpen, toggleHow);
  if (view.locked) {
    const locked = page.createDiv({ cls: 'myu-space-retro-section' });
    locked.createDiv({ cls: 'myu-quiet', text: SPACE_RETRO_WORDS.locked });
    const unlock = locked.createEl('button', { cls: 'myu-affordance', text: SPACE_MODE_WORDS.unlock });
    unlock.onclick = () => on.unlock();
  }

  if (view.results) {
    const res = page.createDiv({ cls: 'myu-space-retro-section' });
    res.createDiv({ cls: 'myu-space-retro-heading', text: SPACE_RETRO_WORDS.results });
    if (view.results.text) res.createDiv({ cls: 'myu-space-retro-text', text: view.results.text });
    if (view.results.items.length) {
      const list = res.createEl('ul', { cls: 'myu-space-bullets' });
      for (const it of view.results.items) list.createEl('li', { text: it });
    }
  }

  for (const q of view.questions) {
    const box = page.createDiv({ cls: 'myu-space-retro-section' });
    const heading = box.createDiv({ cls: 'myu-space-retro-heading', text: q.title });
    if (q.from) heading.createSpan({ cls: 'myu-space-retro-from', text: `${SPACE_RETRO_WORDS.from} ${q.from}` });
    if (q.text) box.createDiv({ cls: 'myu-space-retro-text', text: q.text });
    if (q.state) box.createDiv({ cls: 'myu-quiet myu-space-retro-state', text: q.state });

    if (q.text) {
      box.createDiv({ cls: 'myu-whisper myu-space-retro-sub', text: SPACE_RETRO_WORDS.replies });
      if (q.replies.length === 0) box.createDiv({ cls: 'myu-quiet', text: SPACE_RETRO_WORDS.noReplies });
      for (const r of q.replies) {
        const reply = box.createDiv({ cls: 'myu-space-retro-reply' });
        if (r.name) reply.createDiv({ cls: 'myu-space-retro-who', text: r.name });
        reply.createDiv({ text: r.text });
      }
    }
    if (q.summary) {
      box.createDiv({ cls: 'myu-whisper myu-space-retro-sub', text: SPACE_RETRO_WORDS.summary });
      box.createDiv({ cls: 'myu-space-retro-summary myu-voice', text: q.summary });
    }
  }

  if (view.tasks.length) {
    const tasks = page.createDiv({ cls: 'myu-space-retro-section' });
    tasks.createDiv({ cls: 'myu-space-retro-heading', text: SPACE_RETRO_WORDS.tasks });
    for (const t of view.tasks) {
      const row = tasks.createDiv({ cls: 'myu-space-retro-task' });
      row.createDiv({ text: t.text });
      row.createDiv({ cls: 'myu-quiet', text: t.standing });
    }
  }

  // This page is for reading. Say where the answers go (once there is something to answer), and take the person there.
  const foot = page.createDiv({ cls: 'myu-space-retro-foot' });
  if (view.questions.length > 0 || view.tasks.length > 0) foot.createDiv({ cls: 'myu-quiet', text: SPACE_RETRO_WORDS.howToAct });
  const back = foot.createEl('button', { cls: 'myu-affordance', text: SPACE_RETRO_WORDS.goToConversation });
  back.onclick = () => on.conversation();
}
