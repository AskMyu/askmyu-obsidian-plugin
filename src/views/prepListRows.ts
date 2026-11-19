/**
 * The person's list for a meeting, drawn (2026-10-29; BRIEF_WEB_PREP_NOTES §1–§2). Today's rows and the meeting's page
 * both draw it here, so the same three controls are on both: an item's words are a button that becomes a box to edit
 * them (Enter saves, Esc cancels), × takes it off the list, and a row is dragged to a new place (Alt+↑ / Alt+↓ from the
 * keyboard). The checkbox is live everywhere; a ticked item keeps its words readable. After the meeting an item is
 * ticked late or left, and says where its copy went ("Carried to 12 Nov · Drop"). The add box ("Add an item to your
 * list", Add) adds on Enter, and a paste of several lines adds one item per line (the server splits them).
 *
 * Only drawing: what a press does is the caller's (the doors, the redraw). Every word is `PREP_LIST_WORDS`.
 */

import type { PrepListItem, PrepState } from '../wire';
import { PREP_LIST_WORDS, prepItemNote } from '../prepList';

export interface PrepListHandlers {
  tick: (item: PrepListItem, done: boolean) => void;
  /** Press the words: their box opens (one item at a time). */
  startEdit: (item: PrepListItem) => void;
  /** Esc, or Enter with the words unchanged: the box closes. */
  cancelEdit: () => void;
  /** Enter with new words (trimmed, not empty). */
  saveEdit: (item: PrepListItem, text: string) => void;
  remove: (item: PrepListItem) => void;
  /** After the meeting: an item left unticked; its carried copy comes off the next meeting's list. */
  drop?: (item: PrepListItem) => void;
  /** The item at `from` to `to`. Absent where the list is not whole (a Today row with "+2 more"). */
  move?: (from: number, to: number) => void;
}

export interface PrepListUi {
  /** The item whose words are in a box, and what the box holds now (it survives a redraw). */
  editing: string | null;
  editDraft: string;
  onEditDraft: (text: string) => void;
  /** Items with a change on its way: drawn, their controls held until it lands. */
  busy: ReadonlySet<string>;
}

/** The quiet words after an item, when the caller has its own (the post's: "came up · from the notes"). `good` in the good colour. */
export type PrepItemNoteOf = (item: PrepListItem) => { text: string | null; drop: boolean; good?: boolean } | null;

/** The items, in the order given, one row each. Returns the list. */
export function renderPrepItems(host: HTMLElement, items: readonly PrepListItem[], state: PrepState, ui: PrepListUi, on: PrepListHandlers, noteOf?: PrepItemNoteOf): HTMLElement {
  const list = host.createEl('ul', { cls: 'myu-prep-list' });
  // After the meeting the list is the record: ticks stay live (a late tick takes the carried copy back), nothing else.
  const after = state === 'after';
  let dragFrom: number | null = null;
  items.forEach((item, index) => {
    const held = ui.busy.has(item.item_id);
    const row = list.createEl('li', { cls: 'myu-prep-li', attr: { 'data-item-id': item.item_id, 'data-done': String(item.done) } });
    if (on.move && !after && !held) {
      row.setAttr('draggable', 'true');
      row.ondragstart = (event) => {
        dragFrom = index;
        event.dataTransfer?.setData('text/plain', item.item_id);
      };
      row.ondragover = (event) => {
        if (dragFrom !== null) event.preventDefault();
      };
      row.ondrop = (event) => {
        event.preventDefault();
        const from = dragFrom;
        dragFrom = null;
        if (from !== null && from !== index) on.move?.(from, index);
      };
      row.ondragend = () => {
        dragFrom = null;
      };
    }
    const box = row.createEl('input', { cls: 'myu-prep-check', attr: { type: 'checkbox', 'aria-label': item.text } });
    box.checked = item.done;
    box.disabled = held;
    box.onchange = () => on.tick(item, box.checked);

    if (ui.editing === item.item_id && !after) {
      const edit = row.createEl('input', { cls: 'myu-prep-li-edit', attr: { type: 'text', 'aria-label': item.text } });
      edit.value = ui.editDraft;
      edit.oninput = () => ui.onEditDraft(edit.value);
      edit.onkeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          on.cancelEdit();
          return;
        }
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        const text = edit.value.trim();
        if (!text || text === item.text.trim()) on.cancelEdit();
        else on.saveEdit(item, text);
      };
      queueMicrotask(() => {
        edit.focus();
        edit.setSelectionRange(edit.value.length, edit.value.length);
      });
    } else {
      const words = row.createEl('button', { cls: 'myu-prep-li-text', text: item.text });
      words.disabled = held || after;
      words.onclick = () => on.startEdit(item);
      // The keyboard's drag: Alt+↑ / Alt+↓ moves the item one place.
      if (on.move && !after) {
        words.onkeydown = (event) => {
          if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
          const to = index + (event.key === 'ArrowUp' ? -1 : 1);
          if (to < 0 || to >= items.length) return;
          event.preventDefault();
          on.move?.(index, to);
        };
      }
    }

    const note: ReturnType<PrepItemNoteOf> = noteOf ? noteOf(item) : prepItemNote(item, state);
    if (note?.text) row.createSpan({ cls: `myu-quiet myu-prep-li-note${note.good ? ' myu-prep-li-came' : ''}`, text: note.text });
    if (note) {
      if (note.drop && on.drop) {
        row.createSpan({ cls: 'myu-quiet', text: ' · ' });
        const drop = row.createEl('button', { cls: 'myu-aff myu-prep-drop', text: PREP_LIST_WORDS.drop });
        drop.disabled = held;
        drop.onclick = () => on.drop?.(item);
      }
    }
    if (after) return;
    const remove = row.createEl('button', { cls: 'myu-aff myu-prep-li-x', text: '×', attr: { 'aria-label': PREP_LIST_WORDS.remove } });
    remove.disabled = held;
    remove.onclick = () => on.remove(item);
  });
  return list;
}

export interface PrepAddBoxOpts {
  draft: string;
  /** While an add is on its way the words wait in the box. */
  busy: boolean;
  onDraft: (text: string) => void;
  onAdd: (text: string) => void;
  /** The box had the focus before this redraw (or should have it now): it gets it back, the caret at the end. */
  focus?: boolean;
  onFocus?: (focused: boolean) => void;
}

/** "Add an item to your list" and Add. Enter adds (Shift+Enter keeps a new line); several lines add several items. */
export function renderPrepAddBox(host: HTMLElement, opts: PrepAddBoxOpts): HTMLTextAreaElement {
  const row = host.createDiv({ cls: 'myu-prep-add' });
  const box = row.createEl('textarea', {
    cls: 'myu-prep-add-box',
    attr: { rows: String(lineCount(opts.draft)), placeholder: PREP_LIST_WORDS.addPlaceholder, 'aria-label': PREP_LIST_WORDS.addPlaceholder },
  });
  box.value = opts.draft;
  const add = row.createEl('button', { cls: 'myu-affordance myu-prep-add-go', text: PREP_LIST_WORDS.add });
  add.disabled = opts.busy;
  add.onclick = () => opts.onAdd(box.value);
  box.oninput = () => {
    opts.onDraft(box.value);
    // A paste of several lines shows them all: each is an item when it is added.
    box.setAttr('rows', String(lineCount(box.value)));
  };
  box.onkeydown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    opts.onAdd(box.value);
  };
  box.onfocus = () => opts.onFocus?.(true);
  // A redraw takes the box away (and blurs it): only a blur that leaves the box on the page is the person moving on.
  box.onblur = () => queueMicrotask(() => {
    if (box.isConnected) opts.onFocus?.(false);
  });
  if (opts.focus) {
    queueMicrotask(() => {
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  }
  return box;
}

/** The box's height in lines: what it holds, at most six. */
function lineCount(text: string): number {
  return Math.min(6, Math.max(1, text.split('\n').length));
}

/** The lines an add would make (as the server splits them): none means nothing to send. */
export function addLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
