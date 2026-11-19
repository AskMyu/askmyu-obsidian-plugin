/**
 * The person's list for one meeting, kept while a pane shows it (2026-10-29; BRIEF_WEB_PREP_NOTES §1–§2, the doors in
 * BRIEF_BACKEND_PREP_NOTES §2). Every change shows at once and goes through the list's doors behind it
 * (`/prep/items/add|update|remove`); one that did not go is put back and says so under the list, and the add box gets
 * its words back. Today's rows and the meeting's page each keep theirs; what they draw is `views/prepListRows.ts`.
 * No host API.
 */

import type { AskMyuApi, PrepMeetingRef } from './transport/api';
import type { PrepListItem } from './wire';
import { moveItem } from './prepList';
import { LINE_ANSWER_WORDS } from './lineAnswers';
import { PREP_VIEW_WORDS } from './prepCard';
import { addLines, type PrepListHandlers, type PrepListUi } from './views/prepListRows';

export type PrepListBackend = Pick<AskMyuApi, 'addPrepItems' | 'updatePrepItem' | 'removePrepItem'>;

export interface PrepListKeeperDeps {
  /** The doors, read when a change goes (the pane's plugin may swap its backend). */
  backend: () => PrepListBackend;
  /** The meeting the list belongs to; null while the pane has none. */
  meeting: () => PrepMeetingRef | null;
  items: () => PrepListItem[];
  /** The list as it now stands; `added` is how many items it gained (lost, when negative), for a count kept beside it. */
  setItems: (items: PrepListItem[], added: number) => void;
  /** Paint again. */
  onChange: () => void;
  /** A change landed on the server: the other panes read again. */
  onSaved?: () => void;
}

const failedWords = (error: string | null | undefined): string => (error === 'offline' ? LINE_ANSWER_WORDS.offline : PREP_VIEW_WORDS.listFailed);
const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export class PrepListKeeper {
  /** The item whose words are in a box, and what the box holds. */
  editing: string | null = null;
  editDraft = '';
  /** The add box's words, kept across redraws, and whether an add is on its way. */
  draft = '';
  adding = false;
  /** The add box had the focus: it gets it back after a redraw. */
  addFocused = false;
  /** Under the list, until the next change: what did not go. */
  note: string | null = null;
  /** The quiet line under the add box after an add on Today ("On the list for Thursday."). */
  said: string | null = null;
  /** Items with a change on their way. */
  readonly busy = new Set<string>();
  /** Myu's offers added from here, by their words: each chip reads as added. */
  private readonly offered = new Set<string>();
  private seq = 0;

  constructor(private deps: PrepListKeeperDeps) {}

  /** Was this offer added from here (its words, any case)? */
  hasOffered(text: string): boolean {
    return [...this.offered].some((t) => sameWords(t, text));
  }

  /** The list's drawing state (`renderPrepItems`). */
  ui(): PrepListUi {
    return {
      editing: this.editing,
      editDraft: this.editDraft,
      onEditDraft: (text) => {
        this.editDraft = text;
      },
      busy: this.busy,
    };
  }

  /** What the list's controls do. `move` only where the list is whole. */
  handlers(opts: { move: boolean }): PrepListHandlers {
    return {
      tick: (item, done) => void this.tick(item, done),
      startEdit: (item) => this.startEdit(item),
      cancelEdit: () => this.cancelEdit(),
      saveEdit: (item, text) => void this.saveEdit(item, text),
      remove: (item) => void this.remove(item),
      drop: (item) => void this.drop(item),
      ...(opts.move ? { move: (from: number, to: number) => void this.move(from, to) } : {}),
    };
  }

  /**
   * Onto the list: each line an item, shown at once and held until the server has it. The person's words leave the box
   * as they go (and come back if they did not); one of Myu's offers is marked added. True when it went.
   */
  async add(text: string, source: 'user' | 'myu_offer' = 'user'): Promise<boolean> {
    const meeting = this.deps.meeting();
    const lines = addLines(text);
    if (!meeting || lines.length === 0 || (source === 'user' && this.adding)) return false;
    let position = this.deps.items().reduce((max, i) => Math.max(max, i.position ?? 0), -1);
    const pending: PrepListItem[] = lines.map((t) => ({
      item_id: `pending-${++this.seq}`,
      text: t,
      done: false,
      source,
      carried_from: null,
      position: ++position,
      event_id: meeting.event_id,
      occurrence_key: meeting.occurrence_key ?? null,
    }));
    const pendingIds = new Set(pending.map((p) => p.item_id));
    if (source === 'user') {
      this.draft = '';
      this.adding = true;
    } else {
      this.offered.add(text.trim());
    }
    this.note = null;
    this.said = null;
    for (const id of pendingIds) this.busy.add(id);
    this.deps.setItems([...this.deps.items(), ...pending], pending.length);
    this.deps.onChange();

    const res = await this.deps.backend().addPrepItems(meeting, lines.join('\n'), source).catch(() => null);
    for (const id of pendingIds) this.busy.delete(id);
    if (source === 'user') this.adding = false;
    const rest = this.deps.items().filter((i) => !pendingIds.has(i.item_id));
    if (!res?.ok) {
      this.deps.setItems(rest, -pending.length);
      if (source === 'user' && !this.draft.trim()) this.draft = text;
      if (source === 'myu_offer') this.offered.delete(text.trim());
      this.note = failedWords(res?.error);
      this.deps.onChange();
      return false;
    }
    const made = Array.isArray(res.data?.items) ? res.data.items : [];
    this.deps.setItems([...rest, ...made], made.length - pending.length);
    this.deps.onChange();
    this.deps.onSaved?.();
    return true;
  }

  async tick(item: PrepListItem, done: boolean): Promise<void> {
    await this.change(item, { done }, { done: item.done });
  }

  startEdit(item: PrepListItem): void {
    if (this.busy.has(item.item_id)) return;
    this.editing = item.item_id;
    this.editDraft = item.text;
    this.note = null;
    this.deps.onChange();
  }

  cancelEdit(): void {
    this.editing = null;
    this.deps.onChange();
  }

  async saveEdit(item: PrepListItem, text: string): Promise<void> {
    this.editing = null;
    await this.change(item, { text }, { text: item.text });
  }

  /** × : off the list at once; back in its place if the server did not take it off. */
  async remove(item: PrepListItem): Promise<void> {
    const id = item.item_id;
    if (this.busy.has(id)) return;
    const before = this.deps.items();
    const at = before.findIndex((i) => i.item_id === id);
    if (at < 0) return;
    this.note = null;
    if (this.editing === id) this.editing = null;
    this.deps.setItems(before.filter((i) => i.item_id !== id), -1);
    this.deps.onChange();
    const res = await this.deps.backend().removePrepItem(id).catch(() => null);
    if (!res?.ok) {
      const now = this.deps.items();
      this.deps.setItems([...now.slice(0, at), before[at], ...now.slice(at)], 1);
      this.note = failedWords(res?.error);
      this.deps.onChange();
      return;
    }
    this.deps.onSaved?.();
  }

  /** Drop: after the meeting, the copy carried to the next one comes off its list; this item says nothing more. */
  async drop(item: PrepListItem): Promise<void> {
    const copy = item.carried_to?.item_id;
    if (!copy || this.busy.has(item.item_id)) return;
    this.busy.add(item.item_id);
    this.note = null;
    this.deps.onChange();
    const res = await this.deps.backend().removePrepItem(copy).catch(() => null);
    this.busy.delete(item.item_id);
    if (res?.ok) this.patch(item.item_id, { carried_to: null });
    else this.note = failedWords(res?.error);
    this.deps.onChange();
    if (res?.ok) this.deps.onSaved?.();
  }

  /** The item at `from` to `to`: the new order at once, then each item whose place changed is told its new one. */
  async move(from: number, to: number): Promise<void> {
    const before = this.deps.items();
    const moved = moveItem(before, from, to);
    if (moved.every((m, n) => m.item_id === before[n]?.item_id)) return;
    const was = new Map(before.map((i) => [i.item_id, i.position]));
    this.note = null;
    this.deps.setItems(moved, 0);
    this.deps.onChange();
    const changed = moved.filter((m) => was.get(m.item_id) !== m.position);
    const results = await Promise.all(changed.map((m) => this.deps.backend().updatePrepItem(m.item_id, { position: m.position }).catch(() => null)));
    const failed = results.find((r) => !r?.ok);
    if (failed !== undefined) {
      this.note = failedWords(failed?.error);
      this.deps.onChange();
    }
    this.deps.onSaved?.();
  }

  /** A tick or new words: shown at once, held until the server answers, put back if it did not take them. */
  private async change(item: PrepListItem, change: { text?: string; done?: boolean }, undo: Partial<PrepListItem>): Promise<void> {
    const id = item.item_id;
    if (this.busy.has(id)) return;
    this.note = null;
    this.patch(id, change);
    this.busy.add(id);
    this.deps.onChange();
    const res = await this.deps.backend().updatePrepItem(id, change).catch(() => null);
    this.busy.delete(id);
    if (!res?.ok) {
      this.patch(id, undo);
      this.note = failedWords(res?.error);
      this.deps.onChange();
      return;
    }
    if (res.data?.item) this.patch(id, { text: res.data.item.text, done: res.data.item.done });
    this.deps.onChange();
    this.deps.onSaved?.();
  }

  private patch(id: string, change: Partial<PrepListItem>): void {
    this.deps.setItems(this.deps.items().map((i) => (i.item_id === id ? { ...i, ...change } : i)), 0);
  }
}
