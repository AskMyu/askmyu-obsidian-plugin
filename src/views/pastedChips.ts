/**
 * Pasted text in the box (2026-10-06): the paste listeners that turn one long paste or drop into a chip, the chip
 * row above a composer, and the cards under a sent turn.
 *
 * The listeners read the text/plain synchronously and call preventDefault before anything else, so the browser
 * never inserts the text; nothing is awaited. The four composers (the chat, a subject's conversation, the meeting's
 * question, the onboarding moment) keep their chips next to their draft and redraw only the row when one is added,
 * never the whole pane: a re-render recreates the box and loses the caret, the focus and an IME composition.
 *
 * A card's text is plain pre-wrapped text, never MarkdownRenderer: pasted text is someone's document, shown as it
 * was. Only Obsidian's element helpers are used, so the wiring tests can drive all of this on the UI fake.
 */

import type { PastedBlockWire } from '../wire';
import { PASTE_WORDS, cardLabel, chipLabel, pastedBlocksProblem, pastedPreview, shouldChip } from '../pastedText';

/** What a composer does when a paste or a drop becomes a chip. */
export interface PasteHost {
  /**
   * `text` as it came; `at` is where it would have gone (for a paste, the selected range is already removed from the
   * box; a drop leaves the box as it was).
   */
  addPasted(text: string, source: 'paste' | 'drop', at: number): void;
  /** True while the box takes a typed name (a "Someone else" answer): a paste there stays inline. */
  isTyping?(): boolean;
}

type PasteBox = HTMLTextAreaElement | HTMLInputElement;

/**
 * Turn one long paste or drop into a chip: `paste` reads the clipboard's text/plain, `drop` the dragged text/plain
 * (never files, and not text dragged within this box), and `beforeinput` is the fallback for a box that gets no
 * paste event (a phone keyboard's clipboard arrives as `insertText`/`insertReplacementText`). An empty text/plain is
 * an image clipboard, and a paste below the chip size goes inline as typed: neither is touched.
 */
export function attachPasteListeners(input: PasteBox, host: PasteHost): void {
  let draggingHere = false;
  const take = (e: Event, text: string, source: 'paste' | 'drop'): void => {
    if (!text || !shouldChip(text) || host.isTyping?.()) return;
    e.preventDefault();
    const value = input.value;
    const start = Math.min(input.selectionStart ?? value.length, value.length);
    const end = Math.min(Math.max(start, input.selectionEnd ?? start), value.length);
    // As a native paste would: the selected text goes. A native drop lands where it is dropped and leaves the box's
    // selection (often one left over from before) alone, so a drop takes none of the typed words.
    if (source === 'paste') {
      if (end > start) input.value = value.slice(0, start) + value.slice(end);
      input.setSelectionRange(start, start);
    }
    host.addPasted(text, source, start);
  };
  const box: HTMLElement = input;
  box.addEventListener('paste', (e) => take(e, e.clipboardData?.getData('text/plain') ?? '', 'paste'));
  box.addEventListener('dragstart', () => {
    draggingHere = true;
  });
  box.addEventListener('dragend', () => {
    draggingHere = false;
  });
  box.addEventListener('drop', (e) => {
    if (draggingHere || (e.dataTransfer?.files?.length ?? 0) > 0) return;
    take(e, e.dataTransfer?.getData('text/plain') ?? '', 'drop');
  });
  box.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertText' && e.inputType !== 'insertReplacementText') return;
    take(e, e.data ?? e.dataTransfer?.getData('text/plain') ?? '', 'paste');
  });
}

/** Mod+Z (Ctrl, or Cmd on a Mac) with no Shift or Alt: the composer's Undo, while a conversion can be undone. */
export function isUndoKey(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ');
}

/** The pane's one live region: polite, visually hidden, outside anything a render empties. */
export function pastedLiveRegion(host: HTMLElement): HTMLElement {
  return host.createDiv({ cls: 'myu-sr-only', attr: { role: 'status', 'aria-live': 'polite' } });
}

/** Say it once, through the live region. */
export function announce(region: HTMLElement | null, words: string): void {
  if (!region) return;
  region.setText('');
  region.setText(words);
}

export interface PastedRowHandlers {
  /** The chip: its text, read-only, with Put back and Remove (PastedTextModal). */
  open: (id: string) => void;
  /** The ×. */
  remove: (id: string) => void;
  /** Set while the last conversion can be undone: the hint "Added as pasted text · Undo". */
  undo: (() => void) | null;
  /** Words under the chips until the next change (the lost words after a send). */
  note?: string | null;
}

/**
 * The chip row, drawn into `el` (emptied first): each chip a button with its label and preview, a separate ×
 * button, then the problem words while Send is held, the note, and the hint with its Undo. Numbers are positions in
 * the current list, shown only when there are several.
 */
export function renderPastedRow(el: HTMLElement, chips: readonly PastedBlockWire[], on: PastedRowHandlers): void {
  el.empty();
  chips.forEach((chip, i) => {
    const n = chips.length > 1 ? i + 1 : undefined;
    const item = el.createSpan({ cls: 'myu-pasted-chip' });
    const open = item.createEl('button', { cls: 'myu-pasted-open', text: chipLabel(chip, n) });
    const preview = pastedPreview(chip.text);
    if (preview) open.createSpan({ cls: 'myu-pasted-preview', text: preview });
    open.onclick = () => on.open(chip.id);
    const remove = item.createEl('button', { cls: 'myu-pasted-remove', text: '×', attr: { 'aria-label': PASTE_WORDS.removeLabel(n) } });
    remove.onclick = () => on.remove(chip.id);
  });
  const problem = pastedBlocksProblem(chips);
  if (problem) el.createDiv({ cls: 'myu-pasted-hint myu-pasted-problem', text: problem.words });
  if (on.note) el.createDiv({ cls: 'myu-pasted-hint', text: on.note });
  const undo = on.undo;
  if (undo) {
    const hint = el.createDiv({ cls: 'myu-pasted-hint' });
    hint.createSpan({ text: `${PASTE_WORDS.hint} · ` });
    const b = hint.createEl('button', { cls: 'myu-pasted-undo', text: PASTE_WORDS.undo });
    b.onclick = () => undo();
  }
}

/**
 * A sent turn's pasted text: one fold per block, its label as the summary and its text, plain and pre-wrapped,
 * inside. Which folds are open is the caller's (`expanded`, by block id), so a repaint keeps them as they were.
 */
export function renderPastedCards(el: HTMLElement, blocks: readonly PastedBlockWire[], expanded: ReadonlySet<string>, onToggle: (id: string, open: boolean) => void): void {
  blocks.forEach((pasted, i) => {
    const n = blocks.length > 1 ? i + 1 : undefined;
    const card = el.createEl('details', { cls: 'myu-pasted-card' });
    if (expanded.has(pasted.id)) card.setAttr('open', '');
    card.createEl('summary', { text: cardLabel(pasted, n) });
    card.createDiv({ cls: 'myu-pasted-text', text: pasted.text });
    card.addEventListener('toggle', () => onToggle(pasted.id, card.hasAttribute('open')));
  });
}
